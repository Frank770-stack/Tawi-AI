"use client";

import { useActionState } from "react";
import { removeVarietyAction, type FormState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

export function RemoveVarietyButton({ varietyId }: { varietyId: string }) {
  const [state, action] = useActionState<FormState, FormData>(removeVarietyAction, {});
  return (
    <form action={action} className="flex flex-col items-end">
      <input type="hidden" name="varietyId" value={varietyId} />
      <SubmitButton variant="danger" className="min-h-11 px-4 text-sm" pendingText="Removing…">
        Remove
      </SubmitButton>
      {state.error && <p role="alert" className="mt-1 max-w-56 text-right text-sm text-danger">{state.error}</p>}
    </form>
  );
}
