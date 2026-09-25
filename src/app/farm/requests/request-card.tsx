"use client";

import { useActionState, useState } from "react";
import { respondAction, type RespondState } from "./actions";
import type { FarmRequest } from "@/lib/confirmations";
import { FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatStems, formatWhen } from "@/lib/format";

export function RequestCard({ request }: { request: FarmRequest }) {
  const [state, action] = useActionState<RespondState, FormData>(respondAction, {});
  const [modifying, setModifying] = useState(false);
  const enough = request.atp >= request.requestedQty;

  if (state.done) {
    return (
      <li className="rounded-2xl border-2 border-brand-700 bg-brand-50 p-4">
        <p role="status" className="font-semibold text-brand-800">
          {request.exporterName} · {state.done}
        </p>
      </li>
    );
  }

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            {formatStems(request.requestedQty)} {request.varietyName}
          </h2>
          <p className="text-muted">{request.exporterName}</p>
        </div>
        <span className="rounded-full bg-warn-50 px-3 py-1 text-right text-sm font-bold text-warn">
          Reply by {formatWhen(request.responseDeadline)}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-canvas px-3 py-2">
          <dt className="font-semibold text-muted">Delivery</dt>
          <dd className="font-bold">{formatDate(request.deliveryDate)}</dd>
        </div>
        <div className={`rounded-xl px-3 py-2 ${enough ? "bg-brand-50" : "bg-warn-50"}`}>
          <dt className="font-semibold text-muted">You have available</dt>
          <dd className={`font-bold ${enough ? "text-brand-800" : "text-warn"}`}>
            {formatStems(request.atp)} stems
          </dd>
        </div>
      </dl>

      <form action={action} className="mt-4 space-y-2">
        <input type="hidden" name="requestId" value={request.id} />

        {!modifying && (
          <>
            {enough ? (
              <SubmitButton name="action" value="CONFIRM" pendingText="Confirming…">
                Confirm {formatStems(request.requestedQty)} stems
              </SubmitButton>
            ) : (
              <p className="rounded-xl bg-warn-50 px-4 py-3 text-sm font-medium text-warn">
                You can&apos;t confirm all {formatStems(request.requestedQty)} stems. Confirm a lower amount or reject.
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModifying(true)}
                className="min-h-12 flex-1 rounded-xl border-2 border-brand-700 font-semibold text-brand-800"
              >
                Confirm less
              </button>
              <SubmitButton name="action" value="REJECT" variant="danger" className="flex-1" pendingText="…">
                Reject
              </SubmitButton>
            </div>
          </>
        )}

        {modifying && (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">How many stems can you supply?</span>
              <input
                name="quantity"
                inputMode="numeric"
                pattern="[0-9, ]*"
                autoFocus
                defaultValue={Math.max(0, Math.min(request.atp, request.requestedQty))}
                aria-label={`Stems of ${request.varietyName} you can supply`}
                className={inputClass}
              />
            </label>
            <SubmitButton name="action" value="MODIFY" pendingText="Confirming…">
              Confirm this amount
            </SubmitButton>
            <button
              type="button"
              onClick={() => setModifying(false)}
              className="min-h-12 w-full rounded-xl font-semibold text-muted"
            >
              Cancel
            </button>
          </>
        )}

        <FormError message={state.error} />
      </form>
    </li>
  );
}
