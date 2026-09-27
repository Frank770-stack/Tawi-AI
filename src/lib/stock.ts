import type { Prisma } from "@prisma/client";
import { db, TX_OPTIONS } from "./db";

type Tx = Prisma.TransactionClient;

/**
 * Raised when another writer changed a variety between our read and our write.
 * The caller retries; see `withRetry`.
 */
export class ConflictError extends Error {
  constructor() {
    super("Conflicting update, retry");
  }
}

/**
 * True for the two ways a collision shows up: our own compare-and-set failing,
 * and MongoDB aborting one side of a write conflict (Prisma code P2034).
 * Both mean "someone else got there first", and both are safe to retry.
 */
function isCollision(error: unknown) {
  if (error instanceof ConflictError) return true;
  if ((error as { code?: string })?.code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return /write conflict|WriteConflict|TransientTransaction/i.test(message);
}

/** Retries a transaction a few times when two writers collide. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!isCollision(error)) throw error;
      lastError = error;
      // Back off a little, with jitter, so retries don't collide again.
      await new Promise((r) => setTimeout(r, 25 * (i + 1) + Math.random() * 50));
    }
  }
  throw lastError instanceof ConflictError ? lastError : new ConflictError();
}

/**
 * Moves a variety's `allocated` counter by `delta`, but only if the document
 * still holds exactly the stock and allocated values we validated against.
 *
 * This is the whole safety mechanism. MongoDB applies a single document update
 * atomically, so the condition and the write cannot interleave with another
 * confirmation. If anything changed underneath us, nothing is written and the
 * caller retries against fresh numbers.
 */
export async function compareAndSetAllocated(
  tx: Tx,
  input: { varietyId: string; expectedStock: number; expectedAllocated: number; delta: number },
) {
  const next = input.expectedAllocated + input.delta;
  if (next < 0 || next > input.expectedStock) throw new ConflictError();

  const { count } = await tx.variety.updateMany({
    where: { id: input.varietyId, stock: input.expectedStock, allocated: input.expectedAllocated },
    data: { allocated: next },
  });
  if (count === 0) throw new ConflictError();
}

/** Sets a variety's stock, only if it hasn't changed since we read it. */
export async function compareAndSetStock(
  tx: Tx,
  input: { varietyId: string; expectedStock: number; expectedAllocated: number; stock: number },
) {
  if (input.stock < input.expectedAllocated) throw new ConflictError();

  const { count } = await tx.variety.updateMany({
    where: { id: input.varietyId, stock: input.expectedStock, allocated: input.expectedAllocated },
    data: { stock: input.stock },
  });
  if (count === 0) throw new ConflictError();
}

/** Latest stock entry for a variety, or null if never logged. */
export async function latestStock(tx: Tx, varietyId: string) {
  return tx.stockEntry.findFirst({ where: { varietyId }, orderBy: { loggedAt: "desc" } });
}

/** Stems promised on this variety, from the counter on the variety document. */
export async function allocatedQty(tx: Tx, varietyId: string): Promise<number> {
  const variety = await tx.variety.findUnique({ where: { id: varietyId }, select: { allocated: true } });
  return variety?.allocated ?? 0;
}

/** ATP = logged stock − confirmed allocations on orders that aren't fulfilled. */
export async function availableToPromise(tx: Tx, varietyId: string) {
  const variety = await tx.variety.findUnique({
    where: { id: varietyId },
    select: { stock: true, allocated: true },
  });
  const stock = variety?.stock ?? 0;
  const allocated = variety?.allocated ?? 0;
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

  try {
    return await withRetry(() =>
      db.$transaction(async (tx) => {
        const variety = await tx.variety.findUnique({ where: { id: input.varietyId } });
        if (!variety || variety.farmId !== input.farmId || variety.archivedAt) {
          return { ok: false, error: "Variety not found." } as const;
        }
        if (input.quantity < variety.allocated) {
          return {
            ok: false,
            error: `${variety.allocated.toLocaleString("en-KE")} stems are already promised to exporters. Stock can't go below that.`,
          } as const;
        }

        await compareAndSetStock(tx, {
          varietyId: variety.id,
          expectedStock: variety.stock,
          expectedAllocated: variety.allocated,
          stock: input.quantity,
        });

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
      }, TX_OPTIONS),
    );
  } catch (error) {
    if (error instanceof ConflictError) {
      return { ok: false, error: "Someone else updated this variety. Check the numbers and try again." };
    }
    throw error;
  }
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

  return varieties.map((v) => {
    const latest = v.stockEntries[0] ?? null;
    return {
      varietyId: v.id,
      name: v.name,
      stock: v.stock,
      allocated: v.allocated,
      atp: v.stock - v.allocated,
      location: latest?.location ?? null,
      lastUpdated: latest?.loggedAt ?? null,
      updatedToday: !!latest && latest.loggedAt >= today,
      history: v.stockEntries.map(({ id, quantity, location, loggedAt }) => ({ id, quantity, location, loggedAt })),
    };
  });
}
