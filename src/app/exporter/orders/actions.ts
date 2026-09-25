"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth";
import { formValues } from "@/lib/form";
import { createOrder } from "@/lib/orders";
import { markOrderFulfilled } from "@/lib/confirmations";

export type CreateOrderState = { error?: string; values?: Record<string, string> };

export async function createOrderAction(_prev: CreateOrderState, formData: FormData): Promise<CreateOrderState> {
  const user = await requireOrg("EXPORTER");
  const result = await createOrder(user.organization.id, {
    varietyName: String(formData.get("varietyName") ?? ""),
    quantity: String(formData.get("quantity") ?? ""),
    deliveryDate: String(formData.get("deliveryDate") ?? ""),
    buyerName: String(formData.get("buyerName") ?? ""),
    buyerContact: String(formData.get("buyerContact") ?? ""),
  });
  if (!result.ok) return { error: result.error, values: formValues(formData) };

  revalidatePath("/exporter", "layout");
  redirect(`/exporter/orders/${result.order.id}`);
}

export type FulfilState = { error?: string };

export async function fulfilOrderAction(_prev: FulfilState, formData: FormData): Promise<FulfilState> {
  const user = await requireOrg("EXPORTER");
  const orderId = String(formData.get("orderId") ?? "");
  const raw = String(formData.get("deliveredQuantity") ?? "").replace(/[\s,]/g, "");
  if (!/^\d{1,9}$/.test(raw)) return { error: "Enter the number of stems delivered." };

  const result = await markOrderFulfilled({
    exporterId: user.organization.id,
    orderId,
    deliveredQuantity: Number(raw),
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/exporter", "layout");
  return {};
}
