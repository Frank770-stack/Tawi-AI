import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/auth";
import { expireOverdueRequests, getOrderPosition, listCandidateFarms } from "@/lib/allocations";
import { formatDate, formatStems } from "@/lib/format";
import { Card } from "@/components/ui";
import { MatchForm } from "./match-form";

export const metadata = { title: "Choose farms · Tawi AI" };

export default async function MatchPage(props: PageProps<"/exporter/orders/[id]/match">) {
  const { organization } = await requireOrg("EXPORTER");
  const { id } = await props.params;
  const order = await db.order.findFirst({ where: { id, exporterId: organization.id } });
  if (!order) notFound();
  if (order.status === "CONFIRMED" || order.status === "FULFILLED") redirect(`/exporter/orders/${id}`);

  await expireOverdueRequests();
  const [position, farms] = await Promise.all([
    getOrderPosition(db, order.id),
    listCandidateFarms(order.varietyName, order.id),
  ]);

  return (
    <div className="space-y-4">
      <Link href={`/exporter/orders/${order.id}`} className="inline-flex min-h-11 items-center font-semibold text-brand-800">
        ← Back to order
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Choose farms</h1>
        <p className="mt-1 text-muted">
          {formatStems(order.quantity)} {order.varietyName} · deliver {formatDate(order.deliveryDate)}
        </p>
      </div>

      {position.remaining === 0 ? (
        <Card>
          <p className="font-semibold">Nothing left to request</p>
          <p className="mt-1 text-sm text-muted">
            {formatStems(position.confirmed)} stems confirmed and {formatStems(position.pending)} awaiting farm replies.
          </p>
        </Card>
      ) : farms.length === 0 ? (
        <Card>
          <p className="font-semibold">No farms grow {order.varietyName}</p>
          <p className="mt-1 text-sm text-muted">Ask the farms in the pilot to add this variety.</p>
        </Card>
      ) : (
        <MatchForm
          orderId={order.id}
          varietyName={order.varietyName}
          remaining={position.remaining}
          farms={farms}
        />
      )}
    </div>
  );
}
