"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/auth";
import { addVariety, removeVariety } from "@/lib/farm";
import { normalizeKenyanPhone } from "@/lib/phone";
import { formValues } from "@/lib/form";

export type FormState = { error?: string; saved?: boolean; values?: Record<string, string> };

const detailsSchema = z.object({
  name: z.string().trim().min(2, "Enter the farm name.").max(120),
  contactPerson: z.string().trim().min(2, "Enter a contact person.").max(80),
  phone: z.string().transform((v, ctx) => {
    const phone = normalizeKenyanPhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Enter a Kenyan mobile number, e.g. 0712 345 678." });
      return z.NEVER;
    }
    return phone;
  }),
  location: z.string().trim().max(120),
});

export async function updateFarmDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireOrg("FARM");
  const parsed = detailsSchema.safeParse({
    name: formData.get("name"),
    contactPerson: formData.get("contactPerson"),
    phone: formData.get("phone") ?? "",
    location: formData.get("location") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: formValues(formData) };

  await db.organization.update({
    where: { id: user.organization.id },
    data: { ...parsed.data, location: parsed.data.location || null },
  });
  revalidatePath("/farm", "layout");
  return { saved: true };
}

export async function addVarietyAction(formData: FormData) {
  const user = await requireOrg("FARM");
  await addVariety(user.organization.id, String(formData.get("name") ?? ""));
  revalidatePath("/farm", "layout");
}

export async function removeVarietyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireOrg("FARM");
  const result = await removeVariety(user.organization.id, String(formData.get("varietyId") ?? ""));
  revalidatePath("/farm", "layout");
  return result.ok ? {} : { error: result.error };
}
