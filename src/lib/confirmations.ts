import type { Order, Prisma } from "@prisma/client";
import { db, TX_OPTIONS } from "./db";
import { expireOverdueRequests, getOrderPosition } from "./allocations";
import { compareAndSetAllocated, ConflictError, withRetry } from "./stock";
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

  return requests.map((r) => ({
    id: r.id,
    varietyName: r.variety.name,
    varietyId: r.varietyId,
    requestedQty: r.requestedQty,
    responseDeadline: r.responseDeadline,
    deliveryDate: r.order.deliveryDate,
    exporterName: r.order.exporter.name,
    atp: r.variety.stock - r.variety.allocated,
  }));
}

export type RespondResult = { ok: true; confirmedQty: number } | { ok: false; error: string };

/**
 * A farm's answer to one request: confirm in full, confirm less, or reject.
 *
 * This is where the one invariant is enforced. Everything happens in one
 * transaction, and the confirmed stems are added to the variety's `allocated`
 * counter with a compare-and-set: the update only applies if the document
 * still holds the stock and allocated values we just validated against.
 * MongoDB applies that document update atomically, so two people confirming at
 * the same moment cannot both promise the same stems. The loser gets a
 * conflict, retries against fresh numbers, and is refused if nothing is left.
 *
 * ATP is always recomputed from the database here, never taken from the client.
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
  try {
    return await withRetry(() => respondOnce(input, hooks));
  } catch (error) {
    if (error instanceof ConflictError) {
      return { ok: false, error: "Someone else answered first. Check what's left and try again." };
    }
    throw error;
  }
}

async function respondOnce(
  input: {
    farmId: string;
    requestId: string;
    action: "CONFIRM" | "MODIFY" | "REJECT";
    quantity?: number;
  },
  hooks?: { afterReadingAtp?: () => Promise<void> },
): Promise<RespondResult> {
  const now = new Date();

  return db.$transaction(async (tx) => {
    const request = await tx.allocationRequest.findUnique({ where: { id: input.requestId } });
    if (!request || request.farmId !== input.farmId) {
      return { ok: false, error: "Request not found." } as const;
    }
    if (request.status !== "PENDING") {
      return { ok: false, error: "This request has already been answered." } as const;
    }

    const order = await tx.order.findUniqueOrThrow({ where: { id: request.orderId } });
    if (order.status === "FULFILLED") {
      return { ok: false, error: "This order is closed." } as const;
    }
    if (request.responseDeadline < now) {
      await tx.allocationRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: "EXPIRED", expiredAt: now },
      });
      return { ok: false, error: "The deadline for this request has passed." } as const;
    }

    if (input.action === "REJECT") {
      const { count } = await tx.allocationRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: "REJECTED", confirmedQty: 0, respondedAt: now },
      });
      if (count === 0) throw new ConflictError();
      await notifyExporter(tx, order, input.farmId, "rejected the request");
      return { ok: true, confirmedQty: 0 } as const;
    }

    const quantity = input.action === "CONFIRM" ? request.requestedQty : (input.quantity ?? 0);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { ok: false, error: "Enter a whole number of stems." } as const;
    }
    if (quantity > request.requestedQty) {
      return {
        ok: false,
        error: `You can confirm at most ${request.requestedQty.toLocaleString("en-KE")} stems.`,
      } as const;
    }

    // ATP read from the database. The compare-and-set below re-checks it.
    const variety = await tx.variety.findUniqueOrThrow({ where: { id: request.varietyId } });
    const atp = variety.stock - variety.allocated;
    if (quantity > atp) {
      return {
        ok: false,
        error:
          atp <= 0
            ? "You have no stock available. Log today's stock first."
            : `You only have ${atp.toLocaleString("en-KE")} stems available.`,
      } as const;
    }

    // Belt and braces: an order can never end up over-confirmed.
    const position = await getOrderPosition(tx, request.orderId);
    if (position.confirmed + quantity > order.quantity) {
      return { ok: false, error: "That is more than this order still needs." } as const;
    }

    if (hooks?.afterReadingAtp) await hooks.afterReadingAtp();

    // Claim the request, then move the counter. Both writes are conditional,
    // and the transaction rolls both back if either no longer matches.
    const claimed = await tx.allocationRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        status: quantity === request.requestedQty ? "CONFIRMED" : "PARTIAL",
        confirmedQty: quantity,
        respondedAt: now,
      },
    });
    if (claimed.count === 0) throw new ConflictError();

    await compareAndSetAllocated(tx, {
      varietyId: variety.id,
      expectedStock: variety.stock,
      expectedAllocated: variety.allocated,
      delta: quantity,
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

    await notifyExporter(tx, order, input.farmId, `confirmed ${quantity.toLocaleString("en-KE")} stems`);
    return { ok: true, confirmedQty: quantity } as const;
  }, TX_OPTIONS);
}

async function notifyExporter(tx: Tx, order: Order, farmId: string, what: string) {
  const farm = await tx.organization.findUniqueOrThrow({
    where: { id: farmId },
    select: { name: true },
  });
  await notify(tx, {
    organizationId: order.exporterId,
    type: "FARM_RESPONSE",
    message: `${farm.name} ${what} for ${order.quantity.toLocaleString("en-KE")} ${order.varietyName}.`,
    link: `/exporter/orders/${order.id}`,
  });
}

export type FulfilResult = { ok: true } | { ok: false; error: string };

/**
 * Marks an order delivered. Its confirmed stems are subtracted from each
 * variety's allocated counter, which releases them back into ATP. Any request
 * still waiting is closed at the same time.
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

  try {
    return await withRetry(() =>
      db.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: input.orderId, exporterId: input.exporterId },
        });
        if (!order) return { ok: false, error: "Order not found." } as const;
        if (order.status === "FULFILLED") {
          return { ok: false, error: "This order is already fulfilled." } as const;
        }
        if (order.status === "NEW") {
          return { ok: false, error: "Nothing has been confirmed for this order yet." } as const;
        }

        const confirmed = await tx.allocationRequest.findMany({
          where: { orderId: input.orderId, confirmedQty: { gt: 0 } },
          select: { farmId: true, varietyId: true, confirmedQty: true },
        });

        // Release the promised stems, variety by variety.
        for (const r of confirmed) {
          const variety = await tx.variety.findUniqueOrThrow({ where: { id: r.varietyId } });
          await compareAndSetAllocated(tx, {
            varietyId: r.varietyId,
            expectedStock: variety.stock,
            expectedAllocated: variety.allocated,
            delta: -r.confirmedQty,
          });
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
        for (const r of confirmed) {
          await notify(tx, {
            organizationId: r.farmId,
            type: "ORDER_STATUS",
            message: `Order delivered. Your ${r.confirmedQty.toLocaleString("en-KE")} ${fulfilled.varietyName} stems are no longer held.`,
            link: "/farm",
          });
        }
        return { ok: true } as const;
      }, TX_OPTIONS),
    );
  } catch (error) {
    if (error instanceof ConflictError) {
      return { ok: false, error: "Someone else was updating this stock. Try again." };
    }
    throw error;
  }
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
    where: { farmId, confirmedQty: { gt: 0 }, order: { is: { status: { not: "FULFILLED" } } } },
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
