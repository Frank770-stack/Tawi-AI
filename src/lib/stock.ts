import type { Prisma } from "@prisma/client";
import { db } from "./db";

type Tx = Prisma.TransactionClient;

/**
 * Stems promised on this variety: confirmed quantities on requests whose order
 * isn't fulfilled yet. Rejected/expired requests have confirmedQty 0.
 */
export async function allocatedQty(tx: Tx, varietyId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ allocated: number }[]>`
    SELECT COALESCE(SUM(ar."confirmedQty"), 0)::int AS allocated
    FROM "AllocationRequest" ar
    JOIN "Order" o ON o.id = ar."orderId"
    WHERE ar."varietyId" = ${varietyId} AND o.status <> 'FULFILLED'`;
  return rows[0].allocated;
}

/** Latest stock entry for a variety, or null if never logged. */
export async function latestStock(tx: Tx, varietyId: string) {
  return tx.stockEntry.findFirst({ where: { varietyId }, orderBy: { loggedAt: "desc" } });
}

/**
 * Locks the variety row for the rest of the transaction. Every write that can
 * change stock or allocations for a farm + variety takes this lock first, so
 * they run one at a time and ATP checks can't race.
 */
export async function lockVariety(tx: Tx, varietyId: string) {
  const rows = await tx.$queryRaw<{ id: string; farmId: string; archivedAt: Date | null }[]>`
    SELECT id, "farmId", "archivedAt" FROM "Variety" WHERE id = ${varietyId} FOR UPDATE`;
  return rows[0] ?? null;
}

/** ATP = current stock − allocated. Only trustworthy inside a lockVariety transaction. */
export async function availableToPromise(tx: Tx, varietyId: string) {
  const [entry, allocated] = await Promise.all([latestStock(tx, varietyId), allocatedQty(tx, varietyId)]);
  const stock = entry?.quantity ?? 0;
  return { stock, allocated, atp: stock - allocated };
}

export type LogStockResult = { ok: true } | { ok: false; error: string };

/**
 * Logs a new stock count. Refused if it's below what is already promised,
 * because confirmed allocations must never exceed logged stock.
 */
export async function logStock(input: {
  farmId: string;
  varietyId: string;
  quantity: number;
  location: string;
  userId: string;
}): Promise<LogStockResult> {
  if (!Number.isInteger(input.quantity) || input.quantity < 0) {
    return { ok: false, error: "Enter a whole number of stems (0 or more)." };
  }
  return db.$transaction(async (tx) => {
    const variety = await lockVariety(tx, input.varietyId);
    if (!variety || variety.farmId !== input.farmId || variety.archivedAt) {
      return { ok: false, error: "Variety not found." } as const;
    }
    const allocated = await allocatedQty(tx, input.varietyId);
    if (input.quantity < allocated) {
      return {
        ok: false,
        error: `${allocated.toLocaleString("en-KE")} stems are already promised to exporters. Stock can't go below that.`,
      } as const;
    }
    await tx.stockEntry.create({
      data: {
        farmId: input.farmId,
        varietyId: input.varietyId,
        quantity: input.quantity,
        location: input.location,
        loggedById: input.userId,
      },
    });
    return { ok: true } as const;
  });
}

/** Start of today in Kenya (EAT, UTC+3, no daylight saving). */
export function startOfTodayNairobi(now = new Date()) {
  const EAT_MS = 3 * 60 * 60 * 1000;
  const day = Math.floor((now.getTime() + EAT_MS) / 86_400_000) * 86_400_000;
  return new Date(day - EAT_MS);
}

export type StockPosition = {
  varietyId: string;
  name: string;
  stock: number;
  allocated: number;
  atp: number;
  location: string | null;
  lastUpdated: Date | null;
  updatedToday: boolean;
  history: { id: string; quantity: number; location: string; loggedAt: Date }[];
};

/** Stock, allocated and ATP for each active variety of a farm (read-only view). */
export async function getStockPositions(farmId: string): Promise<StockPosition[]> {
  const varieties = await db.variety.findMany({
    where: { farmId, archivedAt: null },
    orderBy: { name: "asc" },
    include: { stockEntries: { orderBy: { loggedAt: "desc" }, take: 5 } },
  });
  const today = startOfTodayNairobi();

  return Promise.all(
    varieties.map(async (v) => {
      const latest = v.stockEntries[0] ?? null;
      const allocated = await allocatedQty(db, v.id);
      const stock = latest?.quantity ?? 0;
      return {
        varietyId: v.id,
        name: v.name,
        stock,
        allocated,
        atp: stock - allocated,
        location: latest?.location ?? null,
        lastUpdated: latest?.loggedAt ?? null,
        updatedToday: !!latest && latest.loggedAt >= today,
        history: v.stockEntries.map(({ id, quantity, location, loggedAt }) => ({ id, quantity, location, loggedAt })),
      };
    }),
  );
}
