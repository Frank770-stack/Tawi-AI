"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, homePathFor } from "@/lib/auth";
import { requestOtp, verifyOtp } from "@/lib/otp";
import { normalizeKenyanPhone } from "@/lib/phone";

export type LoginState = {
  step: "phone" | "code";
  phone?: string;
  /** What the user typed, kept when the number is invalid. */
  rawPhone?: string;
  error?: string;
  info?: string;
};

/** One action for the whole login form; `intent` says which button was pressed. */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const intent = String(formData.get("intent") ?? "");

  if (intent === "change-number") return { step: "phone" };

  if (intent === "send" || intent === "resend") {
    const rawPhone = String(formData.get("phone") ?? "");
    const phone = normalizeKenyanPhone(rawPhone);
    if (!phone) {
      return { step: "phone", rawPhone, error: "Enter a Kenyan mobile number, e.g. 0712 345 678." };
    }
    const result = await requestOtp(phone);
    if (!result.ok) return { step: intent === "resend" ? "code" : "phone", phone, error: result.error };
    return { step: "code", phone, info: intent === "resend" ? "New code sent." : undefined };
  }

  if (intent === "verify") {
    const phone = normalizeKenyanPhone(String(formData.get("phone") ?? ""));
    const code = String(formData.get("code") ?? "").replace(/\D/g, "");
    if (!phone) return { step: "phone", error: "Enter your phone number again." };
    if (code.length !== 6) return { step: "code", phone, error: "Enter the 6-digit code." };

    const result = await verifyOtp(phone, code);
    if (!result.ok) return { step: "code", phone, error: result.error };

    const user = await db.user.upsert({
      where: { phone },
      create: { phone, name: null, organizationId: null },
      update: {},
      include: { organization: true },
    });
    await createSession(user.id);
    redirect(homePathFor(user));
  }

  return { step: "phone" };
}
