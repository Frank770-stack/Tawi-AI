"use client";

import { useActionState, useState } from "react";
import { completeOnboarding, type OnboardingState } from "./actions";
import { Field, FormError, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const types = [
  { value: "FARM", title: "Farm", text: "I grow flowers and log stock" },
  { value: "EXPORTER", title: "Exporter", text: "I take buyer orders and source from farms" },
] as const;

export function OnboardingForm() {
  const [state, action] = useActionState<OnboardingState, FormData>(completeOnboarding, {});
  const [orgType, setOrgType] = useState<string>("");
  const v = state.values ?? {};

  return (
    <form action={action} className="space-y-5">
      <Field label="Your name">
        <Input name="name" autoComplete="name" placeholder="e.g. Wanjiku Kamau" defaultValue={v.name} required />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Your organization is a…</legend>
        <div className="grid grid-cols-2 gap-3">
          {types.map((t) => (
            <label
              key={t.value}
              className={`flex min-h-24 cursor-pointer flex-col rounded-xl border-2 p-3 ${
                orgType === t.value ? "border-brand-700 bg-brand-50" : "border-line bg-surface"
              }`}
            >
              <input
                type="radio"
                name="orgType"
                value={t.value}
                className="sr-only"
                defaultChecked={orgType === t.value}
                onChange={() => setOrgType(t.value)}
                required
              />
              <span className="text-lg font-bold">{t.title}</span>
              <span className="text-sm text-muted">{t.text}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label={orgType === "EXPORTER" ? "Company name" : "Farm name"}>
        <Input name="orgName" placeholder={orgType === "EXPORTER" ? "e.g. Nairobi Blooms Ltd" : "e.g. Naivasha Roses"} defaultValue={v.orgName} required />
      </Field>

      {orgType === "FARM" && (
        <Field label="Farm location" hint="Optional. Town or area.">
          <Input name="location" placeholder="e.g. Naivasha" defaultValue={v.location} />
        </Field>
      )}

      <FormError message={state.error} />
      <SubmitButton pendingText="Saving…">Continue</SubmitButton>
    </form>
  );
}
