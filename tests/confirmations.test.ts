import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getOrderPosition, sendAllocationRequests } from "@/lib/allocations";
import { markOrderFulfilled, respondToRequest } from "@/lib/confirmations";
import { addVariety } from "@/lib/farm";
import { nairobiDateISO } from "@/lib/format";
import { createOrder } from "@/lib/orders";
import { availableToPromise, logStock } from "@/lib/stock";
import { resetDb } from "./helpers";

beforeEach(resetDb);

/**
 * Returns a function that blocks until `count` callers have reached it, or
 * `timeoutMs` passes. Used to make the concurrency tests actually overlap
 * instead of relying on timing.
 */
function barrier(count: number, timeoutMs: number) {
  let arrived = 0;
  let release!: () => void;
  const all = new Promise<void>((r) => (release = r));
  return async () => {
    if (++arrived >= count) release();
    await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
  };
}

/** One farm with `stock` Roses, and a helper to raise orders against it. */
async function scenario(stock = 2000) {
  const farm = await db.organization.create({
    data: { name: "Naivasha Roses", type: "FARM", contactPerson: "F", phone: "+254700000001" },
  });
  await addVariety(farm.id, "Roses");
  const variety = await db.variety.findFirstOrThrow({ where: { farmId: farm.id } });
  await logStock({ farmId: farm.id, varietyId: variety.id, quantity: stock, location: "Store", userId: "u" });

  /** An exporter order for `qty` stems with a pending request to this farm. */
  async function request(qty: number, exporterName = "Nairobi Blooms") {
    const exporter = await db.organization.create({
      data: { name: exporterName, type: "EXPORTER", contactPerson: "E", phone: "+254711111111" },
    });
    const created = await createOrder(exporter.id, {
      varietyName: "Roses",
      quantity: String(qty),
      deliveryDate: nairobiDateISO(new Date()),
      buyerName: "Buyer",
      buyerContact: "+31 20 123 4567",
    });
    if (!created.ok) throw new Error(created.error);
    const sent = await sendAllocationRequests({
      exporterId: exporter.id,
      orderId: created.order.id,
      deadlineMinutes: 30,
      lines: [{ varietyId: variety.id, quantity: qty }],
    });
    if (!sent.ok) throw new Error(sent.error);
    const req = await db.allocationRequest.findFirstOrThrow({
      where: { orderId: created.order.id },
      orderBy: { requestedAt: "desc" },
    });
    return { exporter, order: created.order, requestId: req.id };
  }

  const respond = (
    requestId: string,
    action: "CONFIRM" | "MODIFY" | "REJECT",
    quantity?: number,
    hooks?: { afterReadingAtp?: () => Promise<void> },
  ) => respondToRequest({ farmId: farm.id, requestId, action, quantity }, hooks);

  const atp = async () => (await availableToPromise(db, variety.id)).atp;

  return { farm, variety, request, respond, atp };
}

describe("responding to a request", () => {
  it("confirming in full locks the stock and confirms the order", async () => {
    const { request, respond, atp } = await scenario(2000);
    const { order, requestId } = await request(1200);
    expect(await atp()).toBe(2000);

    expect(await respond(requestId, "CONFIRM")).toEqual({ ok: true, confirmedQty: 1200 });
    expect(await atp()).toBe(800); // locked immediately

    const saved = await db.allocationRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(saved).toMatchObject({ status: "CONFIRMED", confirmedQty: 1200 });
    expect(saved.respondedAt).not.toBeNull();

    const savedOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(savedOrder.status).toBe("CONFIRMED");
    expect(savedOrder.confirmedAt).not.toBeNull();
  });

  it("confirming less marks the request PARTIAL and leaves the order short", async () => {
    const { request, respond, atp } = await scenario(2000);
    const { order, requestId } = await request(2000);

    expect(await respond(requestId, "MODIFY", 1500)).toEqual({ ok: true, confirmedQty: 1500 });
    expect(await atp()).toBe(500);

    expect(await db.allocationRequest.findUniqueOrThrow({ where: { id: requestId } })).toMatchObject({
      status: "PARTIAL",
      confirmedQty: 1500,
    });
    const position = await getOrderPosition(db, order.id);
    expect(position).toMatchObject({ confirmed: 1500, shortage: 500, remaining: 500 });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("AWAITING_CONFIRMATION");
  });

  it("rejecting frees nothing and leaves the order short", async () => {
    const { request, respond, atp } = await scenario(2000);
    const { order, requestId } = await request(800);

    expect(await respond(requestId, "REJECT")).toEqual({ ok: true, confirmedQty: 0 });
    expect(await atp()).toBe(2000);
    expect(await db.allocationRequest.findUniqueOrThrow({ where: { id: requestId } })).toMatchObject({
      status: "REJECTED",
      confirmedQty: 0,
    });
    expect((await getOrderPosition(db, order.id)).remaining).toBe(800);
  });

  it("an order becomes CONFIRMED only when the confirmed total reaches the quantity", async () => {
    await scenario(2000);
    const exporter = await db.organization.create({
      data: { name: "Blooms", type: "EXPORTER", contactPerson: "E", phone: "+254712222222" },
    });
    const created = await createOrder(exporter.id, {
      varietyName: "Roses",
      quantity: "1000",
      deliveryDate: nairobiDateISO(new Date()),
      buyerName: "Buyer",
      buyerContact: "+31 20 123 4567",
    });
    if (!created.ok) throw new Error(created.error);
    const variety = await db.variety.findFirstOrThrow({});
    await sendAllocationRequests({
      exporterId: exporter.id,
      orderId: created.order.id,
      deadlineMinutes: 30,
      lines: [{ varietyId: variety.id, quantity: 600 }],
    });
    const first = await db.allocationRequest.findFirstOrThrow({ where: { orderId: created.order.id } });
    await respondToRequest({ farmId: variety.farmId, requestId: first.id, action: "CONFIRM" });
    expect((await db.order.findUniqueOrThrow({ where: { id: created.order.id } })).status).toBe(
      "AWAITING_CONFIRMATION",
    );

    await sendAllocationRequests({
      exporterId: exporter.id,
      orderId: created.order.id,
      deadlineMinutes: 30,
      lines: [{ varietyId: variety.id, quantity: 400 }],
    });
    const second = await db.allocationRequest.findFirstOrThrow({
      where: { orderId: created.order.id, status: "PENDING" },
    });
    await respondToRequest({ farmId: variety.farmId, requestId: second.id, action: "CONFIRM" });
    expect((await db.order.findUniqueOrThrow({ where: { id: created.order.id } })).status).toBe("CONFIRMED");
  });

  it("notifies the exporter", async () => {
    const { request, respond } = await scenario();
    const { exporter, requestId } = await request(500);
    await respond(requestId, "CONFIRM");
    const note = await db.notification.findFirstOrThrow({
      where: { organizationId: exporter.id, type: "FARM_RESPONSE" },
    });
    expect(note.message).toContain("Naivasha Roses");
  });
});

describe("what a farm cannot do", () => {
  it("cannot confirm more than its available stock", async () => {
    const { request, respond, atp } = await scenario(1000);
    const { requestId } = await request(1500);
    expect(await respond(requestId, "CONFIRM")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/only have 1,000 stems/),
    });
    expect(await atp()).toBe(1000);
    expect((await db.allocationRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("PENDING");
  });

  it("cannot confirm more than was requested", async () => {
    const { request, respond } = await scenario(5000);
    const { requestId } = await request(1000);
    expect(await respond(requestId, "MODIFY", 1200)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/at most 1,000/),
    });
  });

  it("cannot confirm zero, negative or fractional amounts", async () => {
    const { request, respond } = await scenario();
    const { requestId } = await request(1000);
    for (const q of [0, -5, 1.5]) expect((await respond(requestId, "MODIFY", q)).ok).toBe(false);
  });

  it("cannot answer the same request twice", async () => {
    const { request, respond } = await scenario();
    const { requestId } = await request(500);
    expect((await respond(requestId, "CONFIRM")).ok).toBe(true);
    expect(await respond(requestId, "REJECT")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/already been answered/),
    });
  });

  it("cannot answer after the deadline, and the request becomes EXPIRED", async () => {
    const { request, respond } = await scenario();
    const { requestId } = await request(500);
    await db.allocationRequest.update({
      where: { id: requestId },
      data: { responseDeadline: new Date(Date.now() - 1000) },
    });
    expect(await respond(requestId, "CONFIRM")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/deadline/i),
    });
    expect((await db.allocationRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("EXPIRED");
  });

  it("cannot answer another farm's request", async () => {
    const { request } = await scenario();
    const { requestId } = await request(500);
    const other = await db.organization.create({
      data: { name: "Other farm", type: "FARM", contactPerson: "O", phone: "+254733333333" },
    });
    expect(await respondToRequest({ farmId: other.id, requestId, action: "CONFIRM" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not found/i),
    });
  });

  it("cannot confirm when stock has never been logged", async () => {
    const farm = await db.organization.create({
      data: { name: "Empty farm", type: "FARM", contactPerson: "F", phone: "+254700000002" },
    });
    await addVariety(farm.id, "Lilies");
    const variety = await db.variety.findFirstOrThrow({ where: { farmId: farm.id } });
    const exporter = await db.organization.create({
      data: { name: "Blooms", type: "EXPORTER", contactPerson: "E", phone: "+254711111112" },
    });
    const created = await createOrder(exporter.id, {
      varietyName: "Lilies",
      quantity: "100",
      deliveryDate: nairobiDateISO(new Date()),
      buyerName: "Buyer",
      buyerContact: "+31 20 123 4567",
    });
    if (!created.ok) throw new Error(created.error);
    await sendAllocationRequests({
      exporterId: exporter.id,
      orderId: created.order.id,
      deadlineMinutes: 30,
      lines: [{ varietyId: variety.id, quantity: 100 }],
    });
    const req = await db.allocationRequest.findFirstOrThrow({});
    expect(await respondToRequest({ farmId: farm.id, requestId: req.id, action: "CONFIRM" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no stock available/i),
    });
  });
});

describe("fulfilling an order", () => {
  it("releases the locked stock and records the delivered quantity", async () => {
    const { request, respond, atp } = await scenario(2000);
    const { exporter, order, requestId } = await request(1200);
    await respond(requestId, "CONFIRM");
    expect(await atp()).toBe(800);

    expect(await markOrderFulfilled({ exporterId: exporter.id, orderId: order.id, deliveredQuantity: 1150 })).toEqual({
      ok: true,
    });
    expect(await atp()).toBe(2000); // released

    const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved).toMatchObject({ status: "FULFILLED", deliveredQuantity: 1150 });
    expect(saved.fulfilledAt).not.toBeNull();
  });

  it("closes requests still waiting and refuses later answers", async () => {
    const { request, respond } = await scenario(3000);
    // Request never answered: fulfilling the order must close it.
    const { exporter, order, requestId } = await request(1000);
    expect((await db.allocationRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("PENDING");

    await markOrderFulfilled({ exporterId: exporter.id, orderId: order.id, deliveredQuantity: 0 });
    expect((await db.allocationRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("EXPIRED");
    expect(await respond(requestId, "CONFIRM")).toMatchObject({ ok: false });
  });

  it("refuses another exporter's order, a second fulfilment and bad quantities", async () => {
    const { request, respond } = await scenario();
    const { exporter, order, requestId } = await request(500);
    await respond(requestId, "CONFIRM");

    const other = await db.organization.create({
      data: { name: "Other", type: "EXPORTER", contactPerson: "O", phone: "+254744444444" },
    });
    expect(
      await markOrderFulfilled({ exporterId: other.id, orderId: order.id, deliveredQuantity: 10 }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/not found/i) });
    expect(
      await markOrderFulfilled({ exporterId: exporter.id, orderId: order.id, deliveredQuantity: -1 }),
    ).toMatchObject({ ok: false });

    expect((await markOrderFulfilled({ exporterId: exporter.id, orderId: order.id, deliveredQuantity: 500 })).ok).toBe(
      true,
    );
    expect(
      await markOrderFulfilled({ exporterId: exporter.id, orderId: order.id, deliveredQuantity: 500 }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/already fulfilled/i) });
  });
});

describe("the invariant under concurrency", () => {
  it("two exporters confirming the same stems at the same moment: only one wins", async () => {
    const { variety, request, respond, atp } = await scenario(1000);
    const a = await request(1000, "Exporter A");
    const b = await request(1000, "Exporter B");

    // Force a real overlap: whoever reads ATP first waits for the other to try.
    // Holding the variety lock, the other cannot get past its own read, so the
    // wait times out and the winner commits. Without the lock both would read
    // 1,000 available and both would confirm, promising the same stems twice.
    const both = barrier(2, 400);
    const results = await Promise.all([
      respond(a.requestId, "CONFIRM", undefined, { afterReadingAtp: both }),
      respond(b.requestId, "CONFIRM", undefined, { afterReadingAtp: both }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);

    expect(await atp()).toBe(0);
    const confirmed = await db.allocationRequest.aggregate({
      where: { varietyId: variety.id },
      _sum: { confirmedQty: true },
    });
    expect(confirmed._sum.confirmedQty).toBe(1000); // never 2000
  });

  it("five simultaneous confirmations never promise more than the stock", async () => {
    const { variety, request, respond, atp } = await scenario(1000);
    const requests = [];
    for (let i = 0; i < 5; i++) requests.push(await request(300, `Exporter ${i}`));

    const all = barrier(5, 400);
    const results = await Promise.all(
      requests.map((r) => respond(r.requestId, "CONFIRM", undefined, { afterReadingAtp: all })),
    );
    const okCount = results.filter((r) => r.ok).length;
    expect(okCount).toBe(3); // 3 × 300 = 900 fits, the 4th would exceed 1000

    const confirmed = await db.allocationRequest.aggregate({
      where: { varietyId: variety.id },
      _sum: { confirmedQty: true },
    });
    expect(confirmed._sum.confirmedQty).toBe(900);
    expect(await atp()).toBe(100);
    expect(await atp()).toBeGreaterThanOrEqual(0); // the invariant, stated plainly
  });

  it("a confirmation racing a stock drop can never leave ATP negative", async () => {
    const { farm, variety, request, respond } = await scenario(1000);
    const { requestId } = await request(1000);

    const [confirmation, drop] = await Promise.all([
      respond(requestId, "CONFIRM"),
      logStock({ farmId: farm.id, varietyId: variety.id, quantity: 400, location: "Store", userId: "u" }),
    ]);

    // Exactly one can win. Confirming 1,000 first leaves the drop to 400 below
    // what is promised, so it is refused; dropping first leaves only 400
    // available, so the confirmation is refused.
    expect([confirmation.ok, drop.ok].filter(Boolean)).toHaveLength(1);

    const { stock, allocated, atp } = await availableToPromise(db, variety.id);
    expect(allocated).toBeLessThanOrEqual(stock);
    expect(atp).toBeGreaterThanOrEqual(0);
  });
});

describe("notifications", () => {
  it("tells the exporter when an order becomes fully confirmed", async () => {
    const { request, respond } = await scenario(2000);
    const { exporter, requestId } = await request(800);
    await respond(requestId, "CONFIRM");

    const note = await db.notification.findFirstOrThrow({
      where: { organizationId: exporter.id, type: "ORDER_STATUS" },
    });
    expect(note.message).toMatch(/fully confirmed/i);
  });

  it("tells the farms when a delivered order releases their stock", async () => {
    const { farm, request, respond } = await scenario(2000);
    const { exporter, order, requestId } = await request(700);
    await respond(requestId, "CONFIRM");
    await markOrderFulfilled({ exporterId: exporter.id, orderId: order.id, deliveredQuantity: 700 });

    const note = await db.notification.findFirstOrThrow({
      where: { organizationId: farm.id, type: "ORDER_STATUS" },
    });
    expect(note.message).toMatch(/no longer held/i);
  });
});
