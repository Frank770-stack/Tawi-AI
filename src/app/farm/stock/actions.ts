"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { formValues } from "@/lib/form";
import { logStock } from "@/lib/stock";

export type LogStockState = { error?: string; savedAt?: number; values?: Record<string, string> };

const schema = z.object({
  varietyId: z.string().min(1),
  // Accept "2,500" or "2 500" from the keyboard.
  quantity: z
    .string()
    .transform((v) => v.replace(/[\s,]/g, ""))
    .pipe(z.string().regex(/^\d{1,9}$/, "Enter the number of stems, e.g. 2500.").transform(Number)),
  location: z.string().trim().min(1, "Enter where the stock is, e.g. Cold store.").max(80),
});

export async function logStockAction(_prev: LogStockState, formData: FormData): Promise<LogStockState> {
  const user = await requireOrg("FARM");
  const parsed = schema.safeParse({
    varietyId: formData.get("varietyId") ?? "",
    quantity: formData.get("quantity") ?? "",
    location: formData.get("location") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: formValues(formData) };

  const result = await logStock({ ...parsed.data, farmId: user.organization.id, userId: user.id });
  if (!result.ok) return { error: result.error, values: formValues(formData) };

  revalidatePath("/farm", "layout");
  return { savedAt: Date.now() };
}
