import type { Prisma } from "@prisma/client";
import { db } from "./db";

type Tx = Prisma.TransactionClient;

export type NotificationType = "NEW_REQUEST" | "FARM_RESPONSE" | "ORDER_STATUS" | "REQUEST_EXPIRED";

/** In-app notification for a whole organization. There are no per-user roles. */
export async function notify(
  tx: Tx,
  input: { organizationId: string; type: NotificationType; message: string; link: string },
) {
  await tx.notification.create({ data: { ...input, readAt: null } });
}

export async function unreadCount(organizationId: string) {
  return db.notification.count({ where: { organizationId, readAt: null } });
}

export async function listNotifications(organizationId: string, take = 50) {
  return db.notification.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take });
}

export async function markAllRead(organizationId: string) {
  await db.notification.updateMany({
    where: { organizationId, readAt: null },
    data: { readAt: new Date() },
  });
}
