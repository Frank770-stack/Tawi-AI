"use client";

import { useActionState, useState } from "react";
import { sendRequestsAction, type SendRequestsState } from "./actions";
import type { CandidateFarm } from "@/lib/allocations";
import { FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatStems, formatWhen } from "@/lib/format";

const DEADLINES = [
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 180, label: "3 hours" },
  { minutes: 360, label: "6 hours" },
];

export function MatchForm({
  orderId,
  varietyName,
  remaining,
  farms,
}: {
  orderId: string;
  varietyName: string;
  remaining: number;
  farms: CandidateFarm[];
}) {
  const [state, action] = useActionState<SendRequestsState, FormData>(sendRequestsAction, {});
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const total = Object.values(quantities).reduce((a, b) => a + b, 0);
  const left = remaining - total;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="orderId" value={orderId} />

      <ul className="space-y-3">
        {farms.map((farm) => (
          <li key={farm.varietyId} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold">{farm.farmName}</p>
                {farm.location && <p className="text-sm text-muted">{farm.location}</p>}
              </div>
              <Availability farm={farm} needed={remaining} varietyName={varietyName} />
            </div>

            <div className="mt-3 flex items-center gap-3">
              <label className="flex-1">
                <span className="mb-1 block text-sm font-semibold">Ask for</span>
                <input
                  name={`qty:${farm.varietyId}`}
                  inputMode="numeric"
                  pattern="[0-9, ]*"
                  placeholder="0"
                  aria-label={`Stems to request from ${farm.farmName}`}
                  className={inputClass}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[\s,]/g, ""));
                    setQuantities((q) => ({ ...q, [farm.varietyId]: Number.isFinite(n) ? n : 0 }));
                  }}
                />
              </label>
              {farm.atp > 0 && (
                <button
                  type="button"
                  className="mt-6 min-h-12 rounded-xl border-2 border-brand-700 px-3 font-semibold text-brand-800"
                  onClick={(e) => {
                    const fill = Math.min(farm.atp, Math.max(0, remaining - total + (quantities[farm.varietyId] ?? 0)));
                    const input = e.currentTarget.form!.elements.namedItem(`qty:${farm.varietyId}`) as HTMLInputElement;
                    input.value = String(fill);
                    setQuantities((q) => ({ ...q, [farm.varietyId]: fill }));
                  }}
                >
                  Fill
                </button>
              )}
            </div>

            {farm.pendingForThisOrder > 0 && (
              <p className="mt-2 text-sm text-warn">
                {formatStems(farm.pendingForThisOrder)} stems already awaiting this farm&apos;s reply.
              </p>
            )}
          </li>
        ))}
      </ul>

      <div
        className={`sticky bottom-0 -mx-4 border-t-2 bg-surface px-4 py-3 ${
          left < 0 ? "border-danger" : "border-line"
        }`}
      >
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">Assigned</span>
          <span className="text-lg font-bold">
            {formatStems(total)} / {formatStems(remaining)}
          </span>
        </div>
        <p className={`text-sm ${left < 0 ? "font-semibold text-danger" : "text-muted"}`}>
          {left > 0 && `${formatStems(left)} stems still unassigned`}
          {left === 0 && total > 0 && "Fully assigned"}
          {left < 0 && `${formatStems(-left)} stems too many`}
        </p>

        <fieldset className="mt-3">
          <legend className="mb-1.5 text-sm font-semibold">Farms must reply within</legend>
          <div className="grid grid-cols-4 gap-2">
            {DEADLINES.map((d, i) => (
              <label
                key={d.minutes}
                className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-line bg-surface text-sm font-semibold has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800"
              >
                <input
                  type="radio"
                  name="deadlineMinutes"
                  value={d.minutes}
                  defaultChecked={i === 0}
                  className="sr-only"
                />
                {d.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-3">
          <FormError message={state.error} />
          <SubmitButton pendingText="Sending…" className="mt-2 w-full">
            Send requests
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

function Availability({
  farm,
  needed,
  varietyName,
}: {
  farm: CandidateFarm;
  needed: number;
  varietyName: string;
}) {
  if (farm.atp <= 0) {
    return (
      <span className="whitespace-nowrap rounded-full bg-canvas px-3 py-1 text-sm font-bold text-muted">
        No {varietyName.toLowerCase()} available
      </span>
    );
  }
  if (farm.atp < needed) {
    return (
      <span className="rounded-full bg-warn-50 px-3 py-1 text-right text-sm font-bold text-warn">
        Not enough: {formatStems(farm.atp)} / {formatStems(needed)}
        <Stamp farm={farm} />
      </span>
    );
  }
  return (
    <span className="rounded-full bg-brand-50 px-3 py-1 text-right text-sm font-bold text-brand-800">
      Available: {formatStems(farm.atp)} stems
      <Stamp farm={farm} />
    </span>
  );
}

function Stamp({ farm }: { farm: CandidateFarm }) {
  if (!farm.lastUpdated) return <span className="block text-xs font-medium text-warn">Never logged</span>;
  if (farm.updatedToday) return null;
  return <span className="block text-xs font-medium">Stock from {formatWhen(farm.lastUpdated)}</span>;
}
