import { db } from "./db";
import { isVarietyName } from "./varieties";

export type Result = { ok: true } | { ok: false; error: string };

/** Adds a variety to a farm, or restores it if it was removed before. */
export async function addVariety(farmId: string, name: string): Promise<Result> {
  if (!isVarietyName(name)) return { ok: false, error: "Unknown variety." };
  await db.variety.upsert({
    where: { farmId_name: { farmId, name } },
    create: { farmId, name },
    update: { archivedAt: null },
  });
  return { ok: true };
}

/**
 * Removes (archives) a variety. Refused while it has pending requests or stock
 * promised to orders that aren't fulfilled yet. Locks the variety row, the same
 * lock that confirmations take, so the check can't race a confirmation.
 */
export async function removeVariety(farmId: string, varietyId: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Variety"
      WHERE id = ${varietyId} AND "farmId" = ${farmId} AND "archivedAt" IS NULL
      FOR UPDATE`;
    if (locked.length === 0) return { ok: false, error: "Variety not found." } as const;

    const openRequests = await tx.allocationRequest.count({
      where: {
        varietyId,
        OR: [
          { status: "PENDING" },
          { status: { in: ["CONFIRMED", "PARTIAL"] }, order: { status: { not: "FULFILLED" } } },
        ],
      },
    });
    if (openRequests > 0) {
      return {
        ok: false,
        error: "This variety has open requests or promised stock. Finish those orders first.",
      } as const;
    }

    await tx.variety.update({ where: { id: varietyId }, data: { archivedAt: new Date() } });
    return { ok: true } as const;
  });
}
