import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { allocatedQty, latestStock, startOfTodayNairobi } from "./stock";
import { notify } from "./notifications";

type Tx = Prisma.TransactionClient;

/**
 * Marks pending requests whose deadline has passed as EXPIRED. Cheap enough to
 * run before reading requests, which saves us a scheduled job.
 */
export async function expireOverdueRequests(now = new Date()) {
  // Expire first, then notify only the rows this call actually changed. Two
  // page loads expiring the same request can't both send a notification,
  // because expiredAt is this call's own timestamp.
  const { count } = await db.allocationRequest.updateMany({
    where: { status: "PENDING", responseDeadline: { lt: now } },
    data: { status: "EXPIRED", expiredAt: now },
  });
  if (count === 0) return 0;

  const expired = await db.allocationRequest.findMany({
    where: { status: "EXPIRED", expiredAt: now },
    include: { farm: true, order: true },
  });

  // Tell each exporter which farm let the deadline pass.
  for (const r of expired) {
    await notify(db, {
      organizationId: r.order.exporterId,
      type: "REQUEST_EXPIRED",
      message: `${r.farm.name} did not reply in time for ${r.requestedQty.toLocaleString("en-KE")} ${r.order.varietyName} stems.`,
      link: `/exporter/orders/${r.orderId}`,
    });
  }
  return count;
}

export type OrderPosition = {
  quantity: number;
  confirmed: number;
  pending: number;
  /** Stems still to be requested: ordered − confirmed − pending. */
  remaining: number;
  shortage: number;
};

/** Totals for one order. Run expireOverdueRequests first for a current view. */
export async function getOrderPosition(tx: Tx, orderId: string): Promise<OrderPosition> {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const rows = await tx.$queryRaw<{ confirmed: number; pending: number }[]>`
    SELECT
      COALESCE(SUM("confirmedQty"), 0)::int AS confirmed,
      COALESCE(SUM(CASE WHEN status = 'PENDING' THEN "requestedQty" ELSE 0 END), 0)::int AS pending
    FROM "AllocationRequest" WHERE "orderId" = ${orderId}`;
  const { confirmed, pending } = rows[0];
  return {
    quantity: order.quantity,
    confirmed,
    pending,
    remaining: Math.max(0, order.quantity - confirmed - pending),
    shortage: Math.max(0, order.quantity - confirmed),
  };
}

export type CandidateFarm = {
  farmId: string;
  farmName: string;
  location: string | null;
  varietyId: string;
  atp: number;
  lastUpdated: Date | null;
  updatedToday: boolean;
  pendingForThisOrder: number;
};

/** Farms growing this variety, with what they can still promise. */
export async function listCandidateFarms(varietyName: string, orderId: string): Promise<CandidateFarm[]> {
  const varieties = await db.variety.findMany({
    where: { name: varietyName, archivedAt: null, farm: { type: "FARM" } },
    include: { farm: true },
  });
  const today = startOfTodayNairobi();

  const farms = await Promise.all(
    varieties.map(async (v) => {
      const [entry, allocated, pending] = await Promise.all([
        latestStock(db, v.id),
        allocatedQty(db, v.id),
        db.allocationRequest.aggregate({
          where: { orderId, varietyId: v.id, status: "PENDING" },
          _sum: { requestedQty: true },
        }),
      ]);
      return {
        farmId: v.farmId,
        farmName: v.farm.name,
        location: v.farm.location,
        varietyId: v.id,
        atp: (entry?.quantity ?? 0) - allocated,
        lastUpdated: entry?.loggedAt ?? null,
        updatedToday: !!entry && entry.loggedAt >= today,
        pendingForThisOrder: pending._sum.requestedQty ?? 0,
      };
    }),
  );
  // Most available first; farms that can't supply anything sink to the bottom.
  return farms.sort((a, b) => b.atp - a.atp || a.farmName.localeCompare(b.farmName));
}

export type SendRequestsResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * Sends allocation requests for one order. Requests are promises to ask, not
 * promises of stock: ATP only moves when a farm confirms. We still cap the
 * total at what the order still needs, so an order can't be over-confirmed.
 */
export async function sendAllocationRequests(input: {
  exporterId: string;
  orderId: string;
  deadlineMinutes: number;
  lines: { varietyId: string; quantity: number }[];
}): Promise<SendRequestsResult> {
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "Enter a quantity for at least one farm." };
  if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 0)) {
    return { ok: false, error: "Quantities must be whole numbers of stems." };
  }
  if (new Set(lines.map((l) => l.varietyId)).size !== lines.length) {
    return { ok: false, error: "Each farm can only appear once." };
  }

  await expireOverdueRequests();
  const now = new Date();
  const responseDeadline = new Date(now.getTime() + input.deadlineMinutes * 60_000);

  return db.$transaction(async (tx) => {
    // Lock the order first, then the varieties in a fixed order. Every write
    // that touches allocations takes these locks the same way, so no deadlocks.
    const locked = await tx.$queryRaw<{ id: string; status: string; varietyName: string }[]>`
      SELECT id, status, "varietyName" FROM "Order"
      WHERE id = ${input.orderId} AND "exporterId" = ${input.exporterId} FOR UPDATE`;
    const order = locked[0];
    if (!order) return { ok: false, error: "Order not found." } as const;
    if (order.status === "FULFILLED" || order.status === "CONFIRMED") {
      return { ok: false, error: "This order is already complete." } as const;
    }

    for (const varietyId of [...lines.map((l) => l.varietyId)].sort()) {
      await tx.$queryRaw`SELECT id FROM "Variety" WHERE id = ${varietyId} FOR UPDATE`;
    }

    const varieties = await tx.variety.findMany({
      where: { id: { in: lines.map((l) => l.varietyId) }, archivedAt: null, name: order.varietyName },
    });
    if (varieties.length !== lines.length) {
      return { ok: false, error: "One of those farms no longer grows this variety." } as const;
    }

    const position = await getOrderPosition(tx, input.orderId);
    const total = lines.reduce((sum, l) => sum + l.quantity, 0);
    if (total > position.remaining) {
      return {
        ok: false,
        error: `That's ${total.toLocaleString("en-KE")} stems but only ${position.remaining.toLocaleString("en-KE")} are still needed.`,
      } as const;
    }

    const byId = new Map(varieties.map((v) => [v.id, v]));
    await tx.allocationRequest.createMany({
      data: lines.map((l) => ({
        orderId: input.orderId,
        farmId: byId.get(l.varietyId)!.farmId,
        varietyId: l.varietyId,
        requestedQty: l.quantity,
        responseDeadline,
        requestedAt: now,
      })),
    });

    await tx.order.update({
      where: { id: input.orderId },
      data: {
        status: "AWAITING_CONFIRMATION",
        firstRequestAt: order.status === "NEW" ? now : undefined,
      },
    });

    // Tell each farm.
    const exporter = await tx.organization.findUniqueOrThrow({ where: { id: input.exporterId } });
    for (const l of lines) {
      await notify(tx, {
        organizationId: byId.get(l.varietyId)!.farmId,
        type: "NEW_REQUEST",
        message: `${exporter.name} needs ${l.quantity.toLocaleString("en-KE")} ${order.varietyName} stems.`,
        link: "/farm/requests",
      });
    }

    return { ok: true, count: lines.length } as const;
  });
}
