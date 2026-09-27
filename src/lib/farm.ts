import { db, TX_OPTIONS } from "./db";
import { isVarietyName } from "./varieties";

export type Result = { ok: true } | { ok: false; error: string };

/** Adds a variety to a farm, or restores it if it was removed before. */
export async function addVariety(farmId: string, name: string): Promise<Result> {
  if (!isVarietyName(name)) return { ok: false, error: "Unknown variety." };
  await db.variety.upsert({
    where: { farmId_name: { farmId, name } },
    create: { farmId, name, archivedAt: null },
    update: { archivedAt: null },
  });
  return { ok: true };
}

/**
 * Removes (archives) a variety. Refused while it has pending requests or stock
 * promised to orders that aren't fulfilled yet. The archive write is
 * conditional on the allocated counter still being zero, so it can't race a
 * confirmation that is committing at the same moment.
 */
export async function removeVariety(farmId: string, varietyId: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const variety = await tx.variety.findFirst({
      where: { id: varietyId, farmId, archivedAt: null },
    });
    if (!variety) return { ok: false, error: "Variety not found." } as const;

    const openRequests = await tx.allocationRequest.count({
      where: { varietyId, status: "PENDING" },
    });
    if (openRequests > 0 || variety.allocated > 0) {
      return {
        ok: false,
        error: "This variety has open requests or promised stock. Finish those orders first.",
      } as const;
    }

    const { count } = await tx.variety.updateMany({
      where: { id: varietyId, allocated: 0, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (count === 0) {
      return { ok: false, error: "This variety was just promised to an exporter. Try again." } as const;
    }
    return { ok: true } as const;
  }, TX_OPTIONS);
}
