import { requireOrg } from "@/lib/auth";
import { formatStems, formatWhen } from "@/lib/format";
import { getStockPositions, type StockPosition } from "@/lib/stock";
import { ButtonLink, Card } from "@/components/ui";
import { LogStockForm } from "./log-stock-form";

export const metadata = { title: "Stock · Tawi AI" };

export default async function StockPage() {
  const { organization: farm } = await requireOrg("FARM");
  const positions = await getStockPositions(farm.id);

  if (positions.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Stock</h1>
        <Card>
          <p className="font-semibold">No varieties yet</p>
          <p className="mt-1 text-sm text-muted">Add the flowers you grow, then log your stock here each day.</p>
          <ButtonLink href="/farm/setup" className="mt-3 w-full">Add varieties</ButtonLink>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Stock</h1>
        <p className="mt-1 text-muted">Log today&apos;s count for each variety.</p>
      </div>
      {positions.map((p) => (
        <StockCard key={p.varietyId} position={p} />
      ))}
    </div>
  );
}

function StockCard({ position: p }: { position: StockPosition }) {
  return (
    <Card className={p.updatedToday ? "" : "border-2 border-warn"}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-bold">{p.name}</h2>
        <UpdatedBadge position={p} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Figure label="In stock" value={p.stock} />
        <Figure label="Promised" value={p.allocated} />
        <Figure label="Available" value={p.atp} strong />
      </dl>

      <div className="mt-4">
        <LogStockForm varietyId={p.varietyId} varietyName={p.name} lastLocation={p.location} />
      </div>

      {p.history.length > 0 && (
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand-800">
            Recent counts
          </summary>
          <ul className="divide-y divide-line text-sm">
            {p.history.map((h) => (
              <li key={h.id} className="flex justify-between gap-2 py-2">
                <span>{formatWhen(h.loggedAt)} · {h.location}</span>
                <span className="font-semibold">{formatStems(h.quantity)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function UpdatedBadge({ position: p }: { position: StockPosition }) {
  if (!p.lastUpdated) {
    return <span className="rounded-full bg-warn-50 px-3 py-1 text-sm font-bold text-warn">Never logged</span>;
  }
  if (!p.updatedToday) {
    return (
      <span className="rounded-full bg-warn-50 px-3 py-1 text-right text-sm font-bold text-warn">
        Not updated today
        <span className="block text-xs font-medium">Last: {formatWhen(p.lastUpdated)}</span>
      </span>
    );
  }
  return (
    <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-800">
      {formatWhen(p.lastUpdated)}
    </span>
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
