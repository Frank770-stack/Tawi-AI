"use client";

import { useActionState } from "react";
import { createOrderAction, type CreateOrderState } from "../actions";
import { Field, FormError, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { VARIETY_NAMES } from "@/lib/varieties";

export function NewOrderForm({ today }: { today: string }) {
  const [state, action] = useActionState<CreateOrderState, FormData>(createOrderAction, {});
  const v = state.values ?? {};

  return (
    <form action={action} className="space-y-5">
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Variety</legend>
        <div className="grid grid-cols-3 gap-2">
          {VARIETY_NAMES.map((name) => (
            <label
              key={name}
              className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-line bg-surface px-2 font-semibold has-[:checked]:border-brand-700 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-600"
            >
              <input
                type="radio"
                name="varietyName"
                value={name}
                defaultChecked={v.varietyName === name}
                required
                className="sr-only"
              />
              {name}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Quantity (stems)">
        <Input name="quantity" inputMode="numeric" pattern="[0-9, ]*" placeholder="e.g. 2000" defaultValue={v.quantity} required />
      </Field>

      <Field label="Delivery date">
        <Input name="deliveryDate" type="date" min={today} defaultValue={v.deliveryDate} required />
      </Field>

      <Field label="Buyer name">
        <Input name="buyerName" placeholder="e.g. Amsterdam Flower Traders" defaultValue={v.buyerName} required />
      </Field>

      <Field label="Buyer contact" hint="Phone or email">
        <Input name="buyerContact" placeholder="e.g. +31 20 123 4567" defaultValue={v.buyerContact} required />
      </Field>

      <FormError message={state.error} />
      <SubmitButton pendingText="Creating order…">Create order</SubmitButton>
    </form>
  );
}
