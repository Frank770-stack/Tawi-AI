import { requireOrg } from "@/lib/auth";
import { listPendingRequests } from "@/lib/confirmations";
import { db } from "@/lib/db";
import { formatStems, formatWhen } from "@/lib/format";
import { Card } from "@/components/ui";
import { RequestStatusPill } from "@/components/request-status";
import { RequestCard } from "./request-card";

export const metadata = { title: "Requests · Tawi AI" };

export default async function RequestsPage() {
  const { organization: farm } = await requireOrg("FARM");
  const pending = await listPendingRequests(farm.id);
  const answered = await db.allocationRequest.findMany({
    where: { farmId: farm.id, status: { not: "PENDING" } },
    orderBy: [{ respondedAt: "desc" }, { requestedAt: "desc" }],
    take: 10,
    include: { variety: true, order: { include: { exporter: true } } },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Requests</h1>
        <p className="mt-1 text-muted">Most urgent first. Confirming locks that stock.</p>
      </div>

      {pending.length === 0 ? (
        <Card>
          <p className="font-semibold">No requests waiting</p>
          <p className="mt-1 text-sm text-muted">Exporters will appear here when they need flowers.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {pending.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </ul>
      )}

      {answered.length > 0 && (
        <section className="pt-2">
          <h2 className="text-lg font-bold">Answered</h2>
          <Card flush className="mt-2 divide-y divide-line">
            {answered.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {formatStems(r.confirmedQty || r.requestedQty)} {r.variety.name}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {r.order.exporter.name}
                    {r.respondedAt ? ` · ${formatWhen(r.respondedAt)}` : ""}
                  </p>
                </div>
                <RequestStatusPill status={r.status} />
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
