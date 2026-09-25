"use client";

import { useActionState, useState } from "react";
import { fulfilOrderAction, type FulfilState } from "../actions";
import { FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatStems } from "@/lib/format";

export function FulfilForm({ orderId, confirmed }: { orderId: string; confirmed: number }) {
  const [state, action] = useActionState<FulfilState, FormData>(fulfilOrderAction, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 min-h-12 w-full rounded-xl border-2 border-brand-700 font-semibold text-brand-800 hover:bg-brand-50"
      >
        Mark delivered
      </button>
    );
  }

  return (
    <form action={action} className="mt-4 space-y-3 rounded-xl bg-canvas p-3">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Stems actually delivered</span>
        <input
          name="deliveredQuantity"
          inputMode="numeric"
          pattern="[0-9, ]*"
          defaultValue={formatStems(confirmed)}
          autoFocus
          className={inputClass}
        />
      </label>
      <p className="text-sm text-muted">
        This closes the order and releases the farms&apos; locked stock.
      </p>
      <FormError message={state.error} />
      <SubmitButton pendingText="Saving…">Mark fulfilled</SubmitButton>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="min-h-12 w-full rounded-xl font-semibold text-muted"
      >
        Cancel
      </button>
    </form>
  );
}
