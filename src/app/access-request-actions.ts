"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { normalizeKenyanPhone } from "@/lib/phone";
import { formValues } from "@/lib/form";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  phone: z.string().transform((v, ctx) => {
    const phone = normalizeKenyanPhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Enter a Kenyan mobile number, e.g. 0712 345 678." });
      return z.NEVER;
    }
    return phone;
  }),
  organizationName: z.string().trim().min(2, "Enter your farm or company name.").max(120),
  orgType: z.enum(["FARM", "EXPORTER"], { error: "Choose farm or exporter." }),
});

export type AccessRequestState = { error?: string; done?: boolean; values?: Record<string, string> };

export async function submitAccessRequest(
  _prev: AccessRequestState,
  formData: FormData,
): Promise<AccessRequestState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    organizationName: formData.get("organizationName"),
    orgType: formData.get("orgType"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: formValues(formData) };

  // Ignore repeat submissions from the same phone within a day.
  const recent = await db.accessRequest.findFirst({
    where: { phone: parsed.data.phone, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  if (!recent) await db.accessRequest.create({ data: parsed.data });

  return { done: true };
}
