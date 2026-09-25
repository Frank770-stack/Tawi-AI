import Link from "next/link";
import { requireOrg } from "@/lib/auth";
import { listCommitments, listPendingRequests } from "@/lib/confirmations";
import { formatDate, formatStems, formatWhen } from "@/lib/format";
import { getStockPositions } from "@/lib/stock";
import { ButtonLink, Card } from "@/components/ui";

export const metadata = { title: "Farm · Tawi AI" };

// Farm dashboard: requests waiting for an answer, and what's already promised.
export default async function FarmHome() {
  const { organization: farm } = await requireOrg("FARM");
  const [pending, commitments, positions] = await Promise.all([
    listPendingRequests(farm.id),
    listCommitments(farm.id),
    getStockPositions(farm.id),
  ]);
  const stale = positions.filter((p) => !p.updatedToday);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{farm.name}</h1>

      <section>
        <h2 className="text-lg font-bold">
          Requests waiting {pending.length > 0 && `(${pending.length})`}
        </h2>
        {pending.length === 0 ? (
          <Card className="mt-2">
            <p className="text-muted">Nothing to answer right now.</p>
          </Card>
        ) : (
          <Card flush className="mt-2 divide-y divide-line border-2 border-warn">
            {pending.map((r) => (
              <Link key={r.id} href="/farm/requests" className="block p-4 hover:bg-canvas">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold">
                      {formatStems(r.requestedQty)} {r.varietyName}
                    </p>
                    <p className="text-sm text-muted">{r.exporterName}</p>
                  </div>
                  <span className="whitespace-nowrap rounded-full bg-warn-50 px-3 py-1 text-sm font-bold text-warn">
                    By {formatWhen(r.responseDeadline)}
                  </span>
                </div>
              </Link>
            ))}
          </Card>
        )}
        {pending.length > 0 && (
          <ButtonLink href="/farm/requests" className="mt-3 w-full">
            Answer requests
          </ButtonLink>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold">Confirmed</h2>
        {commitments.length === 0 ? (
          <Card className="mt-2">
            <p className="text-muted">You haven&apos;t promised any stock yet.</p>
          </Card>
        ) : (
          <Card flush className="mt-2 divide-y divide-line">
            {commitments.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-bold">
                    {formatStems(c.confirmedQty)} {c.varietyName}
                  </p>
                  <p className="truncate text-sm text-muted">{c.exporterName}</p>
                </div>
                <span className="whitespace-nowrap text-sm font-semibold text-muted">
                  {formatDate(c.deliveryDate)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      {stale.length > 0 && (
        <Link
          href="/farm/stock"
          className="block rounded-xl bg-warn-50 px-4 py-3 font-semibold text-warn hover:bg-warn-50/70"
        >
          Stock not updated today: {stale.map((p) => p.name).join(", ")} →
        </Link>
      )}
    </div>
  );
}
