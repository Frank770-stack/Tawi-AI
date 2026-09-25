"use client";

import { useActionState } from "react";
import { updateFarmDetails, type FormState } from "../actions";
import { Field, FormError, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatPhone } from "@/lib/phone";

export function FarmDetailsForm({
  farm,
}: {
  farm: { name: string; contactPerson: string; phone: string; location: string | null };
}) {
  const [state, action] = useActionState<FormState, FormData>(updateFarmDetails, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-4">
      <Field label="Farm name">
        <Input name="name" defaultValue={v.name ?? farm.name} required />
      </Field>
      <Field label="Contact person">
        <Input name="contactPerson" defaultValue={v.contactPerson ?? farm.contactPerson} autoComplete="name" required />
      </Field>
      <Field label="Contact phone">
        <Input name="phone" type="tel" inputMode="tel" defaultValue={v.phone ?? formatPhone(farm.phone)} required />
      </Field>
      <Field label="Location" hint="Town or area, e.g. Naivasha">
        <Input name="location" defaultValue={v.location ?? farm.location ?? ""} />
      </Field>
      <FormError message={state.error} />
      {state.saved && <p className="text-sm font-medium text-brand-700">Saved.</p>}
      <SubmitButton pendingText="Saving…">Save farm details</SubmitButton>
    </form>
  );
}
