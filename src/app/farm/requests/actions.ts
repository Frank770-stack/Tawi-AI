"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth";
import { respondToRequest } from "@/lib/confirmations";

export type RespondState = { error?: string; done?: string };

export async function respondAction(_prev: RespondState, formData: FormData): Promise<RespondState> {
  const user = await requireOrg("FARM");
  const requestId = String(formData.get("requestId") ?? "");
  const action = String(formData.get("action") ?? "");
  if (action !== "CONFIRM" && action !== "MODIFY" && action !== "REJECT") {
    return { error: "Choose confirm, change the amount, or reject." };
  }

  let quantity: number | undefined;
  if (action === "MODIFY") {
    const raw = String(formData.get("quantity") ?? "").replace(/[\s,]/g, "");
    if (!/^\d{1,9}$/.test(raw)) return { error: "Enter the number of stems you can supply." };
    quantity = Number(raw);
  }

  const result = await respondToRequest({ farmId: user.organization.id, requestId, action, quantity });
  if (!result.ok) return { error: result.error };

  revalidatePath("/farm", "layout");
  return {
    done:
      action === "REJECT"
        ? "Rejected."
        : `Confirmed ${result.confirmedQty.toLocaleString("en-KE")} stems. That stock is now locked.`,
  };
}
