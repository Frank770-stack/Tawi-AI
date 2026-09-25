import { db } from "@/lib/db";
import { requireOrg } from "@/lib/auth";
import { VARIETY_NAMES } from "@/lib/varieties";
import { Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { addVarietyAction } from "../actions";
import { FarmDetailsForm } from "./farm-details-form";
import { RemoveVarietyButton } from "./remove-variety-button";

export const metadata = { title: "Farm & varieties · Tawi AI" };

export default async function FarmSetupPage() {
  const { organization: farm } = await requireOrg("FARM");
  const varieties = await db.variety.findMany({
    where: { farmId: farm.id, archivedAt: null },
    orderBy: { name: "asc" },
  });
  const active = new Set(varieties.map((v) => v.name));
  const addable = VARIETY_NAMES.filter((n) => !active.has(n));

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold">Flower varieties</h1>
        <p className="mt-1 text-muted">The flowers your farm grows. Exporters see these when sourcing.</p>

        <Card flush className="mt-4 divide-y divide-line">
          {varieties.length === 0 && (
            <p className="p-4 text-muted">No varieties yet. Tap one below to add it.</p>
          )}
          {varieties.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 p-4">
              <span className="text-lg font-semibold">{v.name}</span>
              <RemoveVarietyButton varietyId={v.id} />
            </div>
          ))}
        </Card>

        {addable.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold">Add a variety</p>
            <div className="flex flex-wrap gap-2">
              {addable.map((name) => (
                <form key={name} action={addVarietyAction}>
                  <input type="hidden" name="name" value={name} />
                  <SubmitButton variant="secondary" className="" pendingText="Adding…">
                    + {name}
                  </SubmitButton>
                </form>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold">Farm details</h2>
        <Card className="mt-3">
          <FarmDetailsForm farm={farm} />
        </Card>
      </section>
    </div>
  );
}
