import { z } from "zod";
import { db } from "./db";
import { nairobiDateISO } from "./format";
import { VARIETY_NAMES } from "./varieties";

export const orderInputSchema = z.object({
  varietyName: z.enum(VARIETY_NAMES, { error: "Choose a variety." }),
  // Accept "2,000" or "2 000" from the keyboard.
  quantity: z
    .string()
    .transform((v) => v.replace(/[\s,]/g, ""))
    .pipe(
      z
        .string()
        .regex(/^\d{1,9}$/, "Enter the number of stems, e.g. 2000.")
        .transform(Number)
        .refine((n) => n > 0, "Quantity must be at least 1 stem."),
    ),
  deliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a delivery date.")
    .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Choose a valid delivery date.")
    .refine((d) => d >= nairobiDateISO(new Date()), "Delivery date can't be in the past."),
  buyerName: z.string().trim().min(2, "Enter the buyer's name.").max(120),
  buyerContact: z.string().trim().min(3, "Enter the buyer's phone or email.").max(120),
});

/** Raw form input; everything is validated by orderInputSchema. */
export type OrderInput = Record<keyof z.input<typeof orderInputSchema>, string>;

/** Creates an order in status NEW for this exporter. Input is validated here. */
export async function createOrder(exporterId: string, input: OrderInput) {
  const parsed = orderInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const { deliveryDate, ...rest } = parsed.data;
  const order = await db.order.create({
    data: { ...rest, exporterId, deliveryDate: new Date(`${deliveryDate}T00:00:00Z`) },
  });
  return { ok: true as const, order };
}
