"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth";
import { sendAllocationRequests } from "@/lib/allocations";

export type SendRequestsState = { error?: string };

const DEADLINE_CHOICES = [30, 60, 180, 360];

export async function sendRequestsAction(
  _prev: SendRequestsState,
  formData: FormData,
): Promise<SendRequestsState> {
  const user = await requireOrg("EXPORTER");
  const orderId = String(formData.get("orderId") ?? "");

  const deadlineMinutes = Number(formData.get("deadlineMinutes"));
  if (!DEADLINE_CHOICES.includes(deadlineMinutes)) return { error: "Choose a response deadline." };

  // Quantity inputs are named qty:<varietyId>.
  const lines: { varietyId: string; quantity: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty:") || typeof value !== "string") continue;
    const raw = value.replace(/[\s,]/g, "");
    if (raw === "") continue;
    if (!/^\d{1,9}$/.test(raw)) return { error: "Quantities must be whole numbers of stems." };
    lines.push({ varietyId: key.slice(4), quantity: Number(raw) });
  }

  const result = await sendAllocationRequests({
    exporterId: user.organization.id,
    orderId,
    deadlineMinutes,
    lines,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/exporter", "layout");
  redirect(`/exporter/orders/${orderId}`);
}
