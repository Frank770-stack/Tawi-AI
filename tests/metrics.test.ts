import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { sendAllocationRequests } from "@/lib/allocations";
import { markOrderFulfilled, respondToRequest } from "@/lib/confirmations";
import { addVariety } from "@/lib/farm";
import { nairobiDateISO } from "@/lib/format";
import { findDuplicatePromises, getMetrics } from "@/lib/metrics";
import { createOrder } from "@/lib/orders";
import { logStock } from "@/lib/stock";
import { resetDb } from "./helpers";

beforeEach(resetDb);

async function scenario(stock = 5000) {
  const farm = await db.organization.create({
    data: { name: "Naivasha Roses", type: "FARM", contactPerson: "F", phone: "+254700000001" },
  });
  await addVariety(farm.id, "Roses");
  const variety = await db.variety.findFirstOrThrow({ where: { farmId: farm.id } });
  await logStock({ farmId: farm.id, varietyId: variety.id, quantity: stock, location: "Store", userId: "u" });
  const exporter = await db.organization.create({
    data: { name: "Blooms", type: "EXPORTER", contactPerson: "E", phone: "+254711111111" },
  });

  async function order(qty: number) {
    const created = await createOrder(exporter.id, {
      varietyName: "Roses",
      quantity: String(qty),
      deliveryDate: nairobiDateISO(new Date()),
      buyerName: "Buyer",
      buyerContact: "+31 20 123 4567",
    });
    if (!created.ok) throw new Error(created.error);
    await sendAllocationRequests({
      exporterId: exporter.id,
      orderId: created.order.id,
      deadlineMinutes: 30,
      lines: [{ varietyId: variety.id, quantity: qty }],
    });
    const request = await db.allocationRequest.findFirstOrThrow({
      where: { orderId: created.order.id, status: "PENDING" },
    });
    return { order: created.order, requestId: request.id };
  }

  return { farm, variety, exporter, order };
}

describe("metrics", () => {
  it("reports no data on an empty database rather than zeros", async () => {
    const m = await getMetrics();
    expect(m.avgConfirmationMinutes).toBeNull();
    expect(m.responseRate30).toBeNull();
    expect(m.fulfillmentAccuracy).toBeNull();
    expect(m).toMatchObject({ ordersCompleted: 0, farmsRegistered: 0, duplicatePromises: [] });
  });

  it("counts farms, exporters and orders", async () => {
    const { order } = await scenario();
    await order(100);
    const m = await getMetrics();
    expect(m).toMatchObject({ farmsRegistered: 1, exportersRegistered: 1, ordersTotal: 1, ordersCompleted: 0 });
  });

  it("measures confirmation time from request sent to farm reply", async () => {
    const { farm, order } = await scenario();
    const a = await order(100);
    await respondToRequest({ farmId: farm.id, requestId: a.requestId, action: "CONFIRM" });

    // Pretend that reply took 4 minutes.
    await db.allocationRequest.update({
      where: { id: a.requestId },
      data: { requestedAt: new Date(Date.now() - 4 * 60_000) },
    });

    const m = await getMetrics();
    expect(m.avgConfirmationMinutes).toBeGreaterThan(3.9);
    expect(m.avgConfirmationMinutes).toBeLessThan(4.2);
  });

  it("counts replies within 30 minutes, with expired requests as misses", async () => {
    const { farm, order } = await scenario();
    const quick = await order(100);
    await respondToRequest({ farmId: farm.id, requestId: quick.requestId, action: "CONFIRM" });

    const slow = await order(100);
    await db.allocationRequest.update({
      where: { id: slow.requestId },
      data: {
        requestedAt: new Date(Date.now() - 90 * 60_000),
        respondedAt: new Date(),
        status: "REJECTED",
      },
    });

    const ignored = await order(100);
    await db.allocationRequest.update({
      where: { id: ignored.requestId },
      data: { status: "EXPIRED", expiredAt: new Date() },
    });

    const m = await getMetrics();
    expect(m.respondedWithin30).toBe(1);
    expect(m.answeredOrExpired).toBe(3);
    expect(m.responseRate30).toBeCloseTo(33.3, 0);
  });

  it("measures delivered against confirmed", async () => {
    const { farm, exporter, order } = await scenario();
    const a = await order(1000);
    await respondToRequest({ farmId: farm.id, requestId: a.requestId, action: "CONFIRM" });
    await markOrderFulfilled({ exporterId: exporter.id, orderId: a.order.id, deliveredQuantity: 900 });

    const m = await getMetrics();
    expect(m.fulfillmentAccuracy).toBeCloseTo(90, 0); // 100 stems short of 1,000
    expect(m.ordersCompleted).toBe(1);
  });

  it("penalises delivering more than was confirmed too", async () => {
    const { farm, exporter, order } = await scenario();
    const a = await order(1000);
    await respondToRequest({ farmId: farm.id, requestId: a.requestId, action: "CONFIRM" });
    await markOrderFulfilled({ exporterId: exporter.id, orderId: a.order.id, deliveredQuantity: 1200 });

    const m = await getMetrics();
    expect(m.fulfillmentAccuracy).toBeCloseTo(80, 0);
  });
});

describe("duplicate promise check", () => {
  it("is empty when the app is behaving", async () => {
    const { farm, order } = await scenario(2000);
    const a = await order(800);
    await respondToRequest({ farmId: farm.id, requestId: a.requestId, action: "CONFIRM" });
    expect(await findDuplicatePromises()).toEqual([]);
  });

  it("catches stock promised beyond what was logged", async () => {
    const { farm, order } = await scenario(1000);
    const a = await order(1000);
    await respondToRequest({ farmId: farm.id, requestId: a.requestId, action: "CONFIRM" });

    // Break the invariant behind the app's back, as a bug or bad data would.
    await db.stockEntry.create({
      data: {
        farmId: farm.id,
        varietyId: (await db.variety.findFirstOrThrow()).id,
        quantity: 400,
        location: "Store",
        loggedById: "u",
      },
    });

    const found = await findDuplicatePromises();
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "OVER_PROMISED_STOCK", promised: 1000, limit: 400 });
    expect(found[0].label).toContain("Naivasha Roses");
  });

  it("catches an order confirmed beyond its quantity", async () => {
    const { farm, order } = await scenario(5000);
    const a = await order(500);
    await respondToRequest({ farmId: farm.id, requestId: a.requestId, action: "CONFIRM" });
    await db.allocationRequest.update({
      where: { id: a.requestId },
      data: { requestedQty: 900, confirmedQty: 900 },
    });

    const found = await findDuplicatePromises();
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "OVER_CONFIRMED_ORDER", promised: 900, limit: 500 });
  });

  it("ignores stock released by fulfilled orders", async () => {
    const { farm, exporter, order } = await scenario(1000);
    const a = await order(1000);
    await respondToRequest({ farmId: farm.id, requestId: a.requestId, action: "CONFIRM" });
    await markOrderFulfilled({ exporterId: exporter.id, orderId: a.order.id, deliveredQuantity: 1000 });

    await logStock({
      farmId: farm.id,
      varietyId: (await db.variety.findFirstOrThrow()).id,
      quantity: 10,
      location: "Store",
      userId: "u",
    });
    expect(await findDuplicatePromises()).toEqual([]);
  });
});
