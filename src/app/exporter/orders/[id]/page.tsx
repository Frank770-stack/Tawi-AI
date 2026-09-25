import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/auth";
import { expireOverdueRequests, getOrderPosition } from "@/lib/allocations";
import { formatDate, formatStems, formatWhen } from "@/lib/format";
import { ButtonLink, Card } from "@/components/ui";
import { OrderStatusPill } from "@/components/order-status";
import { RequestStatusPill } from "@/components/request-status";
import { FulfilForm } from "./fulfil-form";

export const metadata = { title: "Order · Tawi AI" };

export default async function OrderPage(props: PageProps<"/exporter/orders/[id]">) {
  const { organization } = await requireOrg("EXPORTER");
  const { id } = await props.params;
  // Scoped to this exporter: another exporter's order id is a 404.
  const order = await db.order.findFirst({ where: { id, exporterId: organization.id } });
  if (!order) notFound();

  await expireOverdueRequests();
  const [position, requests] = await Promise.all([
    getOrderPosition(db, order.id),
    db.allocationRequest.findMany({
      where: { orderId: order.id },
      orderBy: { requestedAt: "asc" },
      include: { farm: true },
    }),
  ]);

  const steps = [
    { label: "Order created", at: order.createdAt },
    { label: "Requests sent to farms", at: order.firstRequestAt },
    { label: "Fully confirmed", at: order.confirmedAt },
    { label: "Fulfilled", at: order.fulfilledAt },
  ];

  return (
    <div className="space-y-4">
      <Link href="/exporter" className="inline-flex min-h-11 items-center font-semibold text-brand-800">
        ← All orders
      </Link>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              {formatStems(order.quantity)} {order.varietyName}
            </h1>
            <p className="mt-1 text-muted">Deliver {formatDate(order.deliveryDate)}</p>
          </div>
          <OrderStatusPill status={order.status} />
        </div>
        <dl className="mt-4 space-y-2">
          <div>
            <dt className="text-sm font-semibold text-muted">Buyer</dt>
            <dd>{order.buyerName}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-muted">Buyer contact</dt>
            <dd className="break-words">{order.buyerContact}</dd>
          </div>
          {order.deliveredQuantity !== null && (
            <div>
              <dt className="text-sm font-semibold text-muted">Delivered</dt>
              <dd>{formatStems(order.deliveredQuantity)} stems</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-muted">Sourcing</h2>
        <p className="mt-1 text-lg font-bold">
          Confirmed {formatStems(position.confirmed)}
          {position.shortage > 0 && (
            <span className="text-danger"> · Shortage {formatStems(position.shortage)}</span>
          )}
        </p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Figure label="Confirmed" value={position.confirmed} strong />
          <Figure label="Waiting" value={position.pending} />
          <Figure label="Not requested" value={position.remaining} />
        </dl>

        {requests.length > 0 && (
          <ul className="mt-4 divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{r.farm.name}</p>
                  <p className="text-sm text-muted">
                    Asked for {formatStems(r.requestedQty)}
                    {r.status === "PENDING" && ` · reply by ${formatWhen(r.responseDeadline)}`}
                    {(r.status === "CONFIRMED" || r.status === "PARTIAL") &&
                      ` · confirmed ${formatStems(r.confirmedQty)}`}
                  </p>
                </div>
                <RequestStatusPill status={r.status} />
              </li>
            ))}
          </ul>
        )}

        {order.status !== "FULFILLED" && position.remaining > 0 && (
          <ButtonLink href={`/exporter/orders/${order.id}/match`} className="mt-4 w-full">
            {requests.length === 0 ? "Send requests to farms" : "Request the rest from other farms"}
          </ButtonLink>
        )}

        {order.status !== "FULFILLED" && position.confirmed > 0 && (
          <FulfilForm orderId={order.id} confirmed={position.confirmed} />
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-muted">Progress</h2>
        <ol className="mt-3 space-y-3">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 rounded-full border-2 ${s.at ? "border-brand-700 bg-brand-700" : "border-line bg-surface"}`}
              />
              <span className={s.at ? "font-semibold" : "text-muted"}>{s.label}</span>
              <span className="ml-auto text-sm text-muted">{s.at ? formatWhen(s.at) : ""}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function Figure({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`rounded-xl px-1 py-2 ${strong ? "bg-brand-50" : "bg-canvas"}`}>
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className={`text-lg font-bold ${strong ? "text-brand-800" : ""}`}>{formatStems(value)}</dd>
    </div>
  );
}
