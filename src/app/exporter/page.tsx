import Link from "next/link";
import type { Order } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/auth";
import { expireOverdueRequests } from "@/lib/allocations";
import { formatDate, formatStems } from "@/lib/format";
import { ButtonLink, Card } from "@/components/ui";
import { OrderStatusPill } from "@/components/order-status";

export const metadata = { title: "Orders · Tawi AI" };

// Exporter dashboard: active orders and how much of each is confirmed.
export default async function ExporterHome() {
  const { organization } = await requireOrg("EXPORTER");
  await expireOverdueRequests();

  const [active, fulfilled] = await Promise.all([
    db.order.findMany({
      where: { exporterId: organization.id, status: { not: "FULFILLED" } },
      orderBy: [{ deliveryDate: "asc" }, { createdAt: "asc" }],
    }),
    db.order.findMany({
      where: { exporterId: organization.id, status: "FULFILLED" },
      orderBy: { fulfilledAt: "desc" },
      take: 10,
    }),
  ]);

  // One query for every order's confirmed total.
  const sums = await db.allocationRequest.groupBy({
    by: ["orderId"],
    where: { orderId: { in: [...active, ...fulfilled].map((o) => o.id) } },
    _sum: { confirmedQty: true },
  });
  const confirmedByOrder = new Map(sums.map((s) => [s.orderId, s._sum.confirmedQty ?? 0]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Active orders</h1>
        <ButtonLink href="/exporter/orders/new" className="min-h-11 px-4">
          + New order
        </ButtonLink>
      </div>

      {active.length === 0 ? (
        <Card>
          <p className="font-semibold">No active orders</p>
          <p className="mt-1 text-sm text-muted">Create an order when a buyer asks for flowers.</p>
        </Card>
      ) : (
        <OrderList orders={active} confirmedByOrder={confirmedByOrder} />
      )}

      {fulfilled.length > 0 && (
        <section className="pt-2">
          <h2 className="text-lg font-bold">Recently fulfilled</h2>
          <div className="mt-2">
            <OrderList orders={fulfilled} confirmedByOrder={confirmedByOrder} />
          </div>
        </section>
      )}
    </div>
  );
}

function OrderList({
  orders,
  confirmedByOrder,
}: {
  orders: Order[];
  confirmedByOrder: Map<string, number>;
}) {
  return (
    <Card flush className="divide-y divide-line">
      {orders.map((o) => {
        const confirmed = confirmedByOrder.get(o.id) ?? 0;
        const shortage = Math.max(0, o.quantity - confirmed);
        return (
          <Link
            key={o.id}
            href={`/exporter/orders/${o.id}`}
            className="block p-4 hover:bg-canvas"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold">
                  {formatStems(o.quantity)} {o.varietyName}
                </p>
                <p className="truncate text-sm text-muted">
                  {o.buyerName} · deliver {formatDate(o.deliveryDate)}
                </p>
              </div>
              <OrderStatusPill status={o.status} />
            </div>

            <p className="mt-2 text-sm font-semibold">
              Confirmed {formatStems(confirmed)} of {formatStems(o.quantity)}
              {shortage > 0 && o.status !== "FULFILLED" && (
                <span className="text-danger"> · Shortage {formatStems(shortage)}</span>
              )}
            </p>
            <div
              aria-hidden="true"
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas"
              title={`${confirmed} of ${o.quantity} confirmed`}
            >
              <div
                className="h-full rounded-full bg-brand-600"
                style={{ width: `${Math.min(100, Math.round((confirmed / o.quantity) * 100))}%` }}
              />
            </div>
          </Link>
        );
      })}
    </Card>
  );
}
