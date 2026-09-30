"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import { Field, FormError, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatPhone } from "@/lib/phone";

export function LoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, { step: "phone" });

  if (state.step === "phone") {
    return (
      <form action={action} className="space-y-4">
        <Field label="Phone number" hint="We'll send you a 6-digit code by SMS.">
          <Input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0712 345 678"
            defaultValue={state.rawPhone ?? (state.phone ? formatPhone(state.phone) : "")}
            required
            autoFocus
          />
        </Field>
        <FormError message={state.error} />
        <SubmitButton name="intent" value="send" pendingText="Sending code…">
          Send code
        </SubmitButton>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="phone" value={state.phone} />
      <p className="text-muted">
        Code sent to <strong className="text-ink">{formatPhone(state.phone!)}</strong>
      </p>

      {/* Testing aid, only when SHOW_OTP_ON_SCREEN is on. Never for real users. */}
      {state.devCode && (
        <div className="rounded-xl border-2 border-dashed border-warn bg-warn-50 px-4 py-3">
          <p className="text-sm font-bold text-warn">Test mode — no SMS sent</p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-[0.2em] text-ink">{state.devCode}</p>
          <p className="mt-1 text-sm text-muted">Already filled in below. Just tap Log in.</p>
        </div>
      )}
      <Field label="6-digit code">
        <Input
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          placeholder="123456"
          defaultValue={state.devCode ?? ""}
          className="text-center text-2xl tracking-[0.4em]"
          autoFocus
        />
      </Field>
      <FormError message={state.error} />
      {state.info && <p className="text-sm font-medium text-brand-700">{state.info}</p>}
      <SubmitButton name="intent" value="verify" pendingText="Checking…">
        Log in
      </SubmitButton>
      <div className="flex justify-between gap-2">
        <SubmitButton name="intent" value="resend" variant="ghost" className="px-2" pendingText="…">
          Resend code
        </SubmitButton>
        <SubmitButton name="intent" value="change-number" variant="ghost" className="px-2" pendingText="…">
          Change number
        </SubmitButton>
      </div>
    </form>
  );
}
