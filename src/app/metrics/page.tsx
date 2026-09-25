import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isInternalPhone, requireUser } from "@/lib/auth";
import { expireOverdueRequests } from "@/lib/allocations";
import { formatStems } from "@/lib/format";
import { getMetrics } from "@/lib/metrics";
import { formatPhone } from "@/lib/phone";
import { Card, Logo } from "@/components/ui";

export const metadata = { title: "Internal metrics · Tawi AI" };

// Internal page, visible only to phones listed in INTERNAL_PHONES.
export default async function MetricsPage() {
  const user = await requireUser();
  if (!isInternalPhone(user.phone)) notFound();

  await expireOverdueRequests();
  const [metrics, accessRequests] = await Promise.all([
    getMetrics(),
    db.accessRequest.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const duplicates = metrics.duplicatePromises;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
      <Logo />
      <h1 className="text-2xl font-bold">Internal metrics</h1>

      <section
        className={`rounded-2xl border-2 p-4 ${
          duplicates.length === 0 ? "border-brand-700 bg-brand-50" : "border-danger bg-danger-50"
        }`}
      >
        <h2 className="text-sm font-semibold text-muted">Duplicate promises (live check)</h2>
        <p className={`text-3xl font-bold ${duplicates.length === 0 ? "text-brand-800" : "text-danger"}`}>
          {duplicates.length}
        </p>
        {duplicates.length === 0 ? (
          <p className="mt-1 text-sm text-muted">
            No farm has promised more than it logged, and no order is confirmed beyond its quantity.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm font-semibold text-danger">
            {duplicates.map((d, i) => (
              <li key={i}>
                {d.label}: promised {formatStems(d.promised)} against{" "}
                {d.kind === "OVER_PROMISED_STOCK" ? "stock" : "an order"} of {formatStems(d.limit)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Avg confirmation time"
          value={metrics.avgConfirmationMinutes === null ? null : metrics.avgConfirmationMinutes.toFixed(1)}
          unit="min"
          target="< 5 min"
          met={metrics.avgConfirmationMinutes !== null && metrics.avgConfirmationMinutes < 5}
          note="Request sent to farm reply"
        />
        <Metric
          label="Replies within 30 min"
          value={metrics.responseRate30 === null ? null : metrics.responseRate30.toFixed(0)}
          unit="%"
          target="> 85%"
          met={metrics.responseRate30 !== null && metrics.responseRate30 > 85}
          note={`${metrics.respondedWithin30} of ${metrics.answeredOrExpired} requests`}
        />
        <Metric
          label="Fulfilment accuracy"
          value={metrics.fulfillmentAccuracy === null ? null : metrics.fulfillmentAccuracy.toFixed(0)}
          unit="%"
          target="> 90%"
          met={metrics.fulfillmentAccuracy !== null && metrics.fulfillmentAccuracy > 90}
          note="Delivered vs confirmed"
        />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Count label="Orders completed" value={metrics.ordersCompleted} />
        <Count label="Orders in total" value={metrics.ordersTotal} />
        <Count label="Farms registered" value={metrics.farmsRegistered} />
        <Count label="Exporters" value={metrics.exportersRegistered} />
      </section>

      <section>
        <h2 className="text-xl font-bold">Access requests ({accessRequests.length})</h2>
        <Card flush className="mt-3 divide-y divide-line">
          {accessRequests.length === 0 && <p className="p-4 text-muted">No access requests yet.</p>}
          {accessRequests.map((r) => (
            <div key={r.id} className="p-4">
              <p className="font-semibold">
                {r.name} · {r.organizationName}{" "}
                <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-800">
                  {r.orgType === "FARM" ? "Farm" : "Exporter"}
                </span>
              </p>
              <p className="text-sm text-muted">
                <a href={`tel:${r.phone}`} className="underline">
                  {formatPhone(r.phone)}
                </a>{" "}
                · {r.createdAt.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}
              </p>
            </div>
          ))}
        </Card>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  unit,
  target,
  met,
  note,
}: {
  label: string;
  value: string | null;
  unit: string;
  target: string;
  met: boolean;
  note: string;
}) {
  return (
    <Card>
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold">
        {value === null ? <span className="text-xl text-muted">No data yet</span> : value}
        {value !== null && <span className="ml-1 text-lg font-semibold text-muted">{unit}</span>}
      </p>
      <p className="mt-1 text-sm">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
            value === null ? "bg-canvas text-muted" : met ? "bg-brand-50 text-brand-800" : "bg-warn-50 text-warn"
          }`}
        >
          Target {target}
        </span>
      </p>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </Card>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </Card>
  );
}
