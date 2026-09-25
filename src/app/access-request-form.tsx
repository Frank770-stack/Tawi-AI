"use client";

import { useActionState } from "react";
import { submitAccessRequest, type AccessRequestState } from "./access-request-actions";
import { Field, FormError, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function AccessRequestForm() {
  const [state, action] = useActionState<AccessRequestState, FormData>(submitAccessRequest, {});
  const v = state.values ?? {};

  if (state.done) {
    return (
      <p role="status" className="rounded-xl bg-brand-50 p-4 font-semibold text-brand-800">
        Thank you. We&apos;ll call you to set up your access.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Field label="Your name">
        <Input name="name" autoComplete="name" defaultValue={v.name} required />
      </Field>
      <Field label="Phone number">
        <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" defaultValue={v.phone} required />
      </Field>
      <Field label="Farm or company name">
        <Input name="organizationName" autoComplete="organization" defaultValue={v.organizationName} required />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">You are a…</legend>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["FARM", "Farm"],
            ["EXPORTER", "Exporter"],
          ].map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-line bg-surface px-4 font-semibold has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50"
            >
              <input type="radio" name="orgType" value={value} defaultChecked={v.orgType === value} required className="h-5 w-5 accent-brand-700" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <FormError message={state.error} />
      <SubmitButton pendingText="Sending…">Request access</SubmitButton>
    </form>
  );
}
