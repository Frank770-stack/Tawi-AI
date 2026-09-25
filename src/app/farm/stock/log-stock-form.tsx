"use client";

import { useActionState } from "react";
import { logStockAction, type LogStockState } from "./actions";
import { FormError, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function LogStockForm({
  varietyId,
  varietyName,
  lastLocation,
}: {
  varietyId: string;
  varietyName: string;
  lastLocation: string | null;
}) {
  const [state, action] = useActionState<LogStockState, FormData>(logStockAction, {});
  const v = state.values ?? {};

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="varietyId" value={varietyId} />
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Stems today</span>
          <Input
            name="quantity"
            inputMode="numeric"
            pattern="[0-9, ]*"
            placeholder="e.g. 2500"
            aria-label={`${varietyName} stems today`}
            defaultValue={v.quantity}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Location</span>
          <Input
            name="location"
            placeholder="e.g. Cold store"
            defaultValue={v.location ?? lastLocation ?? ""}
            required
          />
        </label>
      </div>
      <FormError message={state.error} />
      {state.savedAt && !state.error && (
        <p role="status" className="text-sm font-semibold text-brand-700">Saved.</p>
      )}
      <SubmitButton pendingText="Saving…">Save {varietyName} count</SubmitButton>
    </form>
  );
}
