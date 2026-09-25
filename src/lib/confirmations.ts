import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { expireOverdueRequests, getOrderPosition } from "./allocations";
import { allocatedQty, latestStock } from "./stock";
import { notify } from "./notifications";

type Tx = Prisma.TransactionClient;

export type FarmRequest = {
  id: string;
  varietyName: string;
  varietyId: string;
  requestedQty: number;
  responseDeadline: Date;
  deliveryDate: Date;
  exporterName: string;
  atp: number;
};

/** Pending requests for a farm, most urgent deadline first. */
export async function listPendingRequests(farmId: string): Promise<FarmRequest[]> {
  await expireOverdueRequests();
  const requests = await db.allocationRequest.findMany({
    where: { farmId, status: "PENDING" },
    orderBy: { responseDeadline: "asc" },
    include: { variety: true, order: { include: { exporter: true } } },
  });

  return Promise.all(
    requests.map(async (r) => {
      const [entry, allocated] = await Promise.all([latestStock(db, r.varietyId), allocatedQty(db, r.varietyId)]);
      return {
        id: r.id,
        varietyName: r.variety.name,
        varietyId: r.varietyId,
        requestedQty: r.requestedQty,
        responseDeadline: r.responseDeadline,
        deliveryDate: r.order.deliveryDate,
        exporterName: r.order.exporter.name,
        atp: (entry?.quantity ?? 0) - allocated,
      };
    }),
  );
}

export type RespondResult = { ok: true; confirmedQty: number } | { ok: false; error: string };

/**
 * A farm's answer to one request: confirm in full, confirm less, or reject.
 *
 * This is where the one invariant is enforced. Everything happens in a single
 * transaction that locks the order row, then the variety row, then the request
 * row, always in that order. Inside those locks ATP is recomputed from the
 * database, never from anything the client sent, and confirming more than is
 * available is refused. Two people confirming at the same moment therefore
 * cannot both promise the same stems.
 */
export async function respondToRequest(
  input: {
    farmId: string;
    requestId: string;
    action: "CONFIRM" | "MODIFY" | "REJECT";
    quantity?: number;
  },
  /** Test seam: lets the concurrency tests pause between reading ATP and writing. */
  hooks?: { afterReadingAtp?: () => Promise<void> },
): Promise<RespondResult> {
  const now = new Date();

  return db.$transaction(async (tx) => {
    const request = await tx.allocationRequest.findUnique({ where: { id: input.requestId } });
    if (!request || request.farmId !== input.farmId) {
      return { ok: false, error: "Request not found." } as const;
    }

    // Locks, always in this order: order, variety, request.
    const orders = await tx.$queryRaw<{ id: string; status: string; quantity: number }[]>`
      SELECT id, status, quantity FROM "Order" WHERE id = ${request.orderId} FOR UPDATE`;
    const order = orders[0];
    await tx.$queryRaw`SELECT id FROM "Variety" WHERE id = ${request.varietyId} FOR UPDATE`;
    const locked = await tx.$queryRaw<
      { id: string; status: string; requestedQty: number; responseDeadline: Date }[]
    >`SELECT id, status, "requestedQty", "responseDeadline" FROM "AllocationRequest"
      WHERE id = ${input.requestId} FOR UPDATE`;
    const current = locked[0];

    if (current.status !== "PENDING") {
      return { ok: false, error: "This request has already been answered." } as const;
    }
    if (order.status === "FULFILLED") {
      return { ok: false, error: "This order is closed." } as const;
    }
    if (current.responseDeadline < now) {
      await tx.allocationRequest.update({
        where: { id: current.id },
        data: { status: "EXPIRED", expiredAt: now },
      });
      return { ok: false, error: "The deadline for this request has passed." } as const;
    }

    if (input.action === "REJECT") {
      await tx.allocationRequest.update({
        where: { id: current.id },
        data: { status: "REJECTED", confirmedQty: 0, respondedAt: now },
      });
      await notifyExporter(tx, request.orderId, input.farmId, "rejected the request");
      return { ok: true, confirmedQty: 0 } as const;
    }

    const quantity = input.action === "CONFIRM" ? current.requestedQty : (input.quantity ?? 0);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { ok: false, error: "Enter a whole number of stems." } as const;
    }
    if (quantity > current.requestedQty) {
      return {
        ok: false,
        error: `You can confirm at most ${current.requestedQty.toLocaleString("en-KE")} stems.`,
      } as const;
    }

    // ATP recomputed inside the lock. This is the check that must never be skipped.
    const [entry, allocated] = await Promise.all([
      latestStock(tx, request.varietyId),
      allocatedQty(tx, request.varietyId),
    ]);
    const atp = (entry?.quantity ?? 0) - allocated;
    if (quantity > atp) {
      return {
        ok: false,
        error:
          atp <= 0
            ? "You have no stock available. Log today's stock first."
            : `You only have ${atp.toLocaleString("en-KE")} stems available.`,
      } as const;
    }

    if (hooks?.afterReadingAtp) await hooks.afterReadingAtp();

    // Belt and braces: an order can never end up over-confirmed.
    const position = await getOrderPosition(tx, request.orderId);
    if (position.confirmed + quantity > order.quantity) {
      return { ok: false, error: "That is more than this order still needs." } as const;
    }

    await tx.allocationRequest.update({
      where: { id: current.id },
      data: {
        status: quantity === current.requestedQty ? "CONFIRMED" : "PARTIAL",
        confirmedQty: quantity,
        respondedAt: now,
      },
    });

    if (position.confirmed + quantity >= order.quantity) {
      const confirmedOrder = await tx.order.update({
        where: { id: request.orderId },
        data: { status: "CONFIRMED", confirmedAt: now },
      });
      await notify(tx, {
        organizationId: confirmedOrder.exporterId,
        type: "ORDER_STATUS",
        message: `Order fully confirmed: ${confirmedOrder.quantity.toLocaleString("en-KE")} ${confirmedOrder.varietyName} for ${confirmedOrder.buyerName}.`,
        link: `/exporter/orders/${confirmedOrder.id}`,
      });
    }

    await notifyExporter(tx, request.orderId, input.farmId, `confirmed ${quantity.toLocaleString("en-KE")} stems`);
    return { ok: true, confirmedQty: quantity } as const;
  });
}

async function notifyExporter(tx: Tx, orderId: string, farmId: string, what: string) {
  const [order, farm] = await Promise.all([
    tx.order.findUniqueOrThrow({ where: { id: orderId } }),
    tx.organization.findUniqueOrThrow({ where: { id: farmId } }),
  ]);
  await notify(tx, {
    organizationId: order.exporterId,
    type: "FARM_RESPONSE",
    message: `${farm.name} ${what} for ${order.quantity.toLocaleString("en-KE")} ${order.varietyName}.`,
    link: `/exporter/orders/${orderId}`,
  });
}

export type FulfilResult = { ok: true } | { ok: false; error: string };

/**
 * Marks an order delivered. Its allocations stop counting against ATP straight
 * away, because ATP only subtracts confirmations on orders that are not
 * fulfilled. Any request still waiting is closed at the same time.
 */
export async function markOrderFulfilled(input: {
  exporterId: string;
  orderId: string;
  deliveredQuantity: number;
}): Promise<FulfilResult> {
  if (!Number.isInteger(input.deliveredQuantity) || input.deliveredQuantity < 0) {
    return { ok: false, error: "Enter a whole number of stems (0 or more)." };
  }
  const now = new Date();

  return db.$transaction(async (tx) => {
    const orders = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM "Order"
      WHERE id = ${input.orderId} AND "exporterId" = ${input.exporterId} FOR UPDATE`;
    const order = orders[0];
    if (!order) return { ok: false, error: "Order not found." } as const;
    if (order.status === "FULFILLED") return { ok: false, error: "This order is already fulfilled." } as const;
    if (order.status === "NEW") {
      return { ok: false, error: "Nothing has been confirmed for this order yet." } as const;
    }

    await tx.allocationRequest.updateMany({
      where: { orderId: input.orderId, status: "PENDING" },
      data: { status: "EXPIRED", expiredAt: now },
    });
    const fulfilled = await tx.order.update({
      where: { id: input.orderId },
      data: { status: "FULFILLED", fulfilledAt: now, deliveredQuantity: input.deliveredQuantity },
    });

    // Tell the farms that supplied it: their locked stock is free again.
    const farms = await tx.allocationRequest.findMany({
      where: { orderId: input.orderId, confirmedQty: { gt: 0 } },
      select: { farmId: true, confirmedQty: true },
    });
    for (const f of farms) {
      await notify(tx, {
        organizationId: f.farmId,
        type: "ORDER_STATUS",
        message: `Order delivered. Your ${f.confirmedQty.toLocaleString("en-KE")} ${fulfilled.varietyName} stems are no longer held.`,
        link: "/farm",
      });
    }
    return { ok: true } as const;
  });
}

export type Commitment = {
  id: string;
  varietyName: string;
  confirmedQty: number;
  deliveryDate: Date;
  exporterName: string;
};

/** Stock this farm has promised on orders that aren't delivered yet. */
export async function listCommitments(farmId: string): Promise<Commitment[]> {
  const rows = await db.allocationRequest.findMany({
    where: { farmId, confirmedQty: { gt: 0 }, order: { status: { not: "FULFILLED" } } },
    include: { variety: true, order: { include: { exporter: true } } },
  });
  return rows
    .map((r) => ({
      id: r.id,
      varietyName: r.variety.name,
      confirmedQty: r.confirmedQty,
      deliveryDate: r.order.deliveryDate,
      exporterName: r.order.exporter.name,
    }))
    .sort((a, b) => a.deliveryDate.getTime() - b.deliveryDate.getTime());
}
