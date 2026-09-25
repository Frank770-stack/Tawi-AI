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
  kind: "OVER_PROMISED_STOCK" | "OVER_CONFIRMED_ORDER";
  label: string;
  promised: number;
  limit: number;
};

/**
 * The integrity check. Both lists must always be empty:
 *  1. a farm + variety whose confirmed allocations exceed its logged stock,
 *  2. an order confirmed for more than it asked for.
 * This reads the live tables rather than any counter, so it catches a broken
 * invariant however it happened.
 */
export async function findDuplicatePromises(): Promise<DuplicatePromise[]> {
  const overStock = await db.$queryRaw<
    { farm: string; variety: string; promised: number; stock: number }[]
  >`
    SELECT f.name AS farm, v.name AS variety,
           COALESCE(a.allocated, 0)::int AS promised,
           COALESCE(s.quantity, 0)::int AS stock
    FROM "Variety" v
    JOIN "Organization" f ON f.id = v."farmId"
    LEFT JOIN LATERAL (
      SELECT quantity FROM "StockEntry"
      WHERE "varietyId" = v.id ORDER BY "loggedAt" DESC LIMIT 1
    ) s ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(ar."confirmedQty") AS allocated
      FROM "AllocationRequest" ar
      JOIN "Order" o ON o.id = ar."orderId"
      WHERE ar."varietyId" = v.id AND o.status <> 'FULFILLED'
    ) a ON TRUE
    WHERE COALESCE(a.allocated, 0) > COALESCE(s.quantity, 0)`;

  const overOrder = await db.$queryRaw<
    { buyer: string; variety: string; promised: number; ordered: number }[]
  >`
    SELECT o."buyerName" AS buyer, o."varietyName" AS variety,
           SUM(ar."confirmedQty")::int AS promised, o.quantity::int AS ordered
    FROM "Order" o
    JOIN "AllocationRequest" ar ON ar."orderId" = o.id
    GROUP BY o.id, o."buyerName", o."varietyName", o.quantity
    HAVING SUM(ar."confirmedQty") > o.quantity`;

  return [
    ...overStock.map((r) => ({
      kind: "OVER_PROMISED_STOCK" as const,
      label: `${r.farm} · ${r.variety}`,
      promised: r.promised,
      limit: r.stock,
    })),
    ...overOrder.map((r) => ({
      kind: "OVER_CONFIRMED_ORDER" as const,
      label: `${r.buyer} · ${r.variety}`,
      promised: r.promised,
      limit: r.ordered,
    })),
  ];
}

export async function getMetrics(): Promise<Metrics> {
  const [
    timings,
    rates,
    orders,
    farms,
    exporters,
    ordersTotal,
    ordersCompleted,
    duplicatePromises,
  ] = await Promise.all([
    // Request sent -> farm answered, in minutes.
    db.$queryRaw<{ avg_minutes: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM ("respondedAt" - "requestedAt")) / 60) AS avg_minutes
      FROM "AllocationRequest" WHERE "respondedAt" IS NOT NULL`,
    // Answered within 30 minutes. Requests that expired count as misses.
    db.$queryRaw<{ within: number; total: number }[]>`
      SELECT
        COUNT(*) FILTER (
          WHERE "respondedAt" IS NOT NULL
          AND "respondedAt" - "requestedAt" <= INTERVAL '30 minutes'
        )::int AS within,
        COUNT(*) FILTER (WHERE status <> 'PENDING')::int AS total
      FROM "AllocationRequest"`,
    // Delivered vs confirmed, per fulfilled order.
    db.$queryRaw<{ confirmed: number; delivered: number }[]>`
      SELECT SUM(ar."confirmedQty")::int AS confirmed, o."deliveredQuantity"::int AS delivered
      FROM "Order" o
      JOIN "AllocationRequest" ar ON ar."orderId" = o.id
      WHERE o.status = 'FULFILLED' AND o."deliveredQuantity" IS NOT NULL
      GROUP BY o.id, o."deliveredQuantity"
      HAVING SUM(ar."confirmedQty") > 0`,
    db.organization.count({ where: { type: "FARM" } }),
    db.organization.count({ where: { type: "EXPORTER" } }),
    db.order.count(),
    db.order.count({ where: { status: "FULFILLED" } }),
    findDuplicatePromises(),
  ]);

  const { within, total } = rates[0];
  // Accuracy penalises delivering less or more than was confirmed.
  const accuracies = orders.map((o) =>
    Math.max(0, 1 - Math.abs(o.delivered - o.confirmed) / o.confirmed),
  );

  return {
    avgConfirmationMinutes:
      timings[0].avg_minutes === null ? null : Number(timings[0].avg_minutes),
    responseRate30: total === 0 ? null : (within / total) * 100,
    respondedWithin30: within,
    answeredOrExpired: total,
    fulfillmentAccuracy:
      accuracies.length === 0
        ? null
        : (accuracies.reduce((a, b) => a + b, 0) / accuracies.length) * 100,
    ordersCompleted,
    ordersTotal,
    farmsRegistered: farms,
    exportersRegistered: exporters,
    duplicatePromises,
  };
}
