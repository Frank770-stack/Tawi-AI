"use server";

import { requireUser } from "@/lib/auth";
import { markAllRead } from "@/lib/notifications";

export async function markNotificationsRead() {
  const user = await requireUser();
  if (user.organizationId) await markAllRead(user.organizationId);
}
