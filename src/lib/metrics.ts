import { db } from "./db";

export type Metrics = {
  avgConfirmationMinutes: number | null;
  responseRate30: number | null;
  respondedWithin30: number;
  answeredOrExpired: number;
  fulfillmentAccuracy: number | null;
  ordersCompleted: number;
  ordersTotal: number;
  farmsRegistered: number;
  exportersRegistered: number;
  duplicatePromises: DuplicatePromise[];
};

export type DuplicatePromise = {
  kind: "OVER_PROMISED_STOCK" | "OVER_CONFIRMED_ORDER" | "COUNTER_DRIFT";
  label: string;
  promised: number;
  limit: number;
};

/**
 * The integrity check. All three lists must always be empty:
 *  1. a farm + variety whose allocated stems exceed its logged stock,
 *  2. an order confirmed for more than it asked for,
 *  3. a variety whose allocated counter disagrees with the confirmed requests
 *     it is derived from.
 *
 * The third case matters on MongoDB specifically: `allocated` is a counter
 * guarding the invariant, so this re-derives it from the requests themselves
 * and shouts if the two ever drift apart.
 */
export async function findDuplicatePromises(): Promise<DuplicatePromise[]> {
  const [varieties, requests, orders] = await Promise.all([
    db.variety.findMany({ include: { farm: { select: { name: true } } } }),
    db.allocationRequest.findMany({
      where: { confirmedQty: { gt: 0 } },
      select: { varietyId: true, orderId: true, confirmedQty: true },
    }),
    db.order.findMany({ select: { id: true, status: true, quantity: true, buyerName: true, varietyName: true } }),
  ]);

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const found: DuplicatePromise[] = [];

  // Confirmed stems per variety, counting only orders that aren't fulfilled.
  const derived = new Map<string, number>();
  for (const r of requests) {
    if (orderById.get(r.orderId)?.status === "FULFILLED") continue;
    derived.set(r.varietyId, (derived.get(r.varietyId) ?? 0) + r.confirmedQty);
  }

  for (const v of varieties) {
    const label = `${v.farm.name} · ${v.name}`;
    if (v.allocated > v.stock) {
      found.push({ kind: "OVER_PROMISED_STOCK", label, promised: v.allocated, limit: v.stock });
    }
    const fromRequests = derived.get(v.id) ?? 0;
    if (fromRequests !== v.allocated) {
      found.push({ kind: "COUNTER_DRIFT", label, promised: v.allocated, limit: fromRequests });
    }
  }

  // Confirmed stems per order.
  const perOrder = new Map<string, number>();
  for (const r of requests) perOrder.set(r.orderId, (perOrder.get(r.orderId) ?? 0) + r.confirmedQty);
  for (const [orderId, confirmed] of perOrder) {
    const order = orderById.get(orderId);
    if (order && confirmed > order.quantity) {
      found.push({
        kind: "OVER_CONFIRMED_ORDER",
        label: `${order.buyerName} · ${order.varietyName}`,
        promised: confirmed,
        limit: order.quantity,
      });
    }
  }

  return found;
}

export async function getMetrics(): Promise<Metrics> {
  const [answered, allRequests, fulfilledOrders, farms, exporters, ordersTotal, ordersCompleted, duplicatePromises] =
    await Promise.all([
      db.allocationRequest.findMany({
        where: { respondedAt: { not: null } },
        select: { requestedAt: true, respondedAt: true },
      }),
      db.allocationRequest.findMany({ where: { status: { not: "PENDING" } }, select: { id: true } }),
      db.order.findMany({
        where: { status: "FULFILLED", deliveredQuantity: { not: null } },
        select: { id: true, deliveredQuantity: true, requests: { select: { confirmedQty: true } } },
      }),
      db.organization.count({ where: { type: "FARM" } }),
      db.organization.count({ where: { type: "EXPORTER" } }),
      db.order.count(),
      db.order.count({ where: { status: "FULFILLED" } }),
      findDuplicatePromises(),
    ]);

  const minutes = answered.map((r) => (r.respondedAt!.getTime() - r.requestedAt.getTime()) / 60_000);
  const within30 = minutes.filter((m) => m <= 30).length;
  const answeredOrExpired = allRequests.length;

  // Accuracy penalises delivering less or more than was confirmed.
  const accuracies = fulfilledOrders
    .map((o) => ({ confirmed: o.requests.reduce((s, r) => s + r.confirmedQty, 0), delivered: o.deliveredQuantity! }))
    .filter((o) => o.confirmed > 0)
    .map((o) => Math.max(0, 1 - Math.abs(o.delivered - o.confirmed) / o.confirmed));

  return {
    avgConfirmationMinutes: minutes.length === 0 ? null : minutes.reduce((a, b) => a + b, 0) / minutes.length,
    responseRate30: answeredOrExpired === 0 ? null : (within30 / answeredOrExpired) * 100,
    respondedWithin30: within30,
    answeredOrExpired,
    fulfillmentAccuracy:
      accuracies.length === 0 ? null : (accuracies.reduce((a, b) => a + b, 0) / accuracies.length) * 100,
    ordersCompleted,
    ordersTotal,
    farmsRegistered: farms,
    exportersRegistered: exporters,
    duplicatePromises,
  };
}
