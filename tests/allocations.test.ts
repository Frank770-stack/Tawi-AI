import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  expireOverdueRequests,
  getOrderPosition,
  listCandidateFarms,
  sendAllocationRequests,
} from "@/lib/allocations";
import { addVariety } from "@/lib/farm";
import { respondToRequest } from "@/lib/confirmations";
import { logStock } from "@/lib/stock";
import { nairobiDateISO } from "@/lib/format";
import { createOrder } from "@/lib/orders";
import { resetDb } from "./helpers";

beforeEach(resetDb);

/** Two farms with Roses stock, one exporter, one 2,000-stem order. */
async function scenario() {
  const exporter = await db.organization.create({
    data: { name: "Nairobi Blooms", type: "EXPORTER", contactPerson: "E", phone: "+254711111111" },
  });
  const farms = [];
  for (const [name, qty] of [["Farm A", 1200], ["Farm B", 900]] as const) {
    const farm = await db.organization.create({
      data: { name, type: "FARM", contactPerson: "F", phone: "+254700000000", location: "Naivasha" },
    });
    await addVariety(farm.id, "Roses");
    const variety = await db.variety.findFirstOrThrow({ where: { farmId: farm.id } });
    await logStock({ farmId: farm.id, varietyId: variety.id, quantity: qty, location: "Store", userId: "u" });
    farms.push({ farm, variety });
  }
  const created = await createOrder(exporter.id, {
    varietyName: "Roses",
    quantity: "2000",
    deliveryDate: nairobiDateISO(new Date()),
    buyerName: "Buyer",
    buyerContact: "+31 20 123 4567",
  });
  if (!created.ok) throw new Error(created.error);
  const send = (lines: { varietyId: string; quantity: number }[], deadlineMinutes = 30) =>
    sendAllocationRequests({ exporterId: exporter.id, orderId: created.order.id, deadlineMinutes, lines });
  return { exporter, order: created.order, a: farms[0], b: farms[1], send };
}

describe("listCandidateFarms", () => {
  it("lists farms growing the variety with their ATP, most available first", async () => {
    const { order, a, b } = await scenario();
    const farms = await listCandidateFarms(order.varietyName, order.id);
    expect(farms.map((f) => [f.farmName, f.atp])).toEqual([
      ["Farm A", 1200],
      ["Farm B", 900],
    ]);
    expect(farms[0]).toMatchObject({ farmId: a.farm.id, varietyId: a.variety.id, updatedToday: true });
    expect(farms[1].farmId).toBe(b.farm.id);
  });

  it("excludes farms that removed the variety, and shows confirmed stock as unavailable", async () => {
    const { order, a, b, send } = await scenario();
    await db.variety.update({ where: { id: b.variety.id }, data: { archivedAt: new Date() } });
    await send([{ varietyId: a.variety.id, quantity: 500 }]);
    const req = await db.allocationRequest.findFirstOrThrow({ where: { varietyId: a.variety.id } });
    await respondToRequest({ farmId: a.farm.id, requestId: req.id, action: "CONFIRM" });

    const farms = await listCandidateFarms(order.varietyName, order.id);
    expect(farms.map((f) => f.farmName)).toEqual(["Farm A"]);
    expect(farms[0].atp).toBe(700); // 1200 stock − 500 confirmed
  });

  it("reports pending requests for this order", async () => {
    const { order, a, send } = await scenario();
    await send([{ varietyId: a.variety.id, quantity: 400 }]);
    const farms = await listCandidateFarms(order.varietyName, order.id);
    expect(farms.find((f) => f.varietyId === a.variety.id)?.pendingForThisOrder).toBe(400);
  });
});

describe("sendAllocationRequests", () => {
  it("splits one order across farms and moves it to AWAITING_CONFIRMATION", async () => {
    const { order, a, b, send } = await scenario();
    const result = await send([
      { varietyId: a.variety.id, quantity: 1200 },
      { varietyId: b.variety.id, quantity: 800 },
    ]);
    expect(result).toEqual({ ok: true, count: 2 });

    const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(saved.status).toBe("AWAITING_CONFIRMATION");
    expect(saved.firstRequestAt).not.toBeNull();

    const requests = await db.allocationRequest.findMany({ where: { orderId: order.id } });
    expect(requests.map((r) => r.requestedQty).sort((x, y) => x - y)).toEqual([800, 1200]);
    expect(requests.every((r) => r.status === "PENDING" && r.confirmedQty === 0)).toBe(true);
    expect(requests.map((r) => r.farmId).sort()).toEqual([a.farm.id, b.farm.id].sort());

    // Deadline is roughly 30 minutes out.
    const minutes = (requests[0].responseDeadline.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
  });

  it("notifies each farm", async () => {
    const { a, b, send } = await scenario();
    await send([
      { varietyId: a.variety.id, quantity: 100 },
      { varietyId: b.variety.id, quantity: 200 },
    ]);
    const notes = await db.notification.findMany();
    expect(notes).toHaveLength(2);
    expect(notes.map((n) => n.organizationId).sort()).toEqual([a.farm.id, b.farm.id].sort());
    expect(notes[0].message).toContain("Nairobi Blooms");
  });

  it("keeps firstRequestAt from the first send", async () => {
    const { order, a, b, send } = await scenario();
    await send([{ varietyId: a.variety.id, quantity: 100 }]);
    const first = (await db.order.findUniqueOrThrow({ where: { id: order.id } })).firstRequestAt;
    await new Promise((r) => setTimeout(r, 5));
    await send([{ varietyId: b.variety.id, quantity: 100 }]);
    const second = (await db.order.findUniqueOrThrow({ where: { id: order.id } })).firstRequestAt;
    expect(second).toEqual(first);
  });

  it("refuses to request more than the order still needs", async () => {
    const { a, b, send } = await scenario();
    const result = await send([
      { varietyId: a.variety.id, quantity: 1200 },
      { varietyId: b.variety.id, quantity: 900 },
    ]);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/2,100 stems but only 2,000/) });
    expect(await db.allocationRequest.count()).toBe(0);
  });

  it("counts pending requests against what's left to request", async () => {
    const { a, b, send } = await scenario();
    await send([{ varietyId: a.variety.id, quantity: 1200 }]);
    const result = await send([{ varietyId: b.variety.id, quantity: 900 }]);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/only 800/) });
  });

  it("allows requesting more than a farm's ATP (the farm decides)", async () => {
    const { a, send } = await scenario();
    expect(await send([{ varietyId: a.variety.id, quantity: 2000 }])).toEqual({ ok: true, count: 1 });
  });

  it("rejects empty, duplicate, negative and fractional lines", async () => {
    const { a, send } = await scenario();
    expect(await send([])).toMatchObject({ ok: false, error: expect.stringMatching(/at least one farm/i) });
    expect(await send([{ varietyId: a.variety.id, quantity: 0 }])).toMatchObject({ ok: false });
    expect(
      await send([
        { varietyId: a.variety.id, quantity: 10 },
        { varietyId: a.variety.id, quantity: 20 },
      ]),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/once/i) });
    expect(await send([{ varietyId: a.variety.id, quantity: -5 }])).toMatchObject({ ok: false });
    expect(await send([{ varietyId: a.variety.id, quantity: 1.5 }])).toMatchObject({ ok: false });
    expect(await db.allocationRequest.count()).toBe(0);
  });

  it("refuses another exporter's order and a variety of the wrong type", async () => {
    const { order, a } = await scenario();
    const other = await db.organization.create({
      data: { name: "Other", type: "EXPORTER", contactPerson: "O", phone: "+254722222222" },
    });
    const stolen = await sendAllocationRequests({
      exporterId: other.id,
      orderId: order.id,
      deadlineMinutes: 30,
      lines: [{ varietyId: a.variety.id, quantity: 100 }],
    });
    expect(stolen).toMatchObject({ ok: false, error: expect.stringMatching(/not found/i) });

    await addVariety(a.farm.id, "Lilies");
    const lilies = await db.variety.findFirstOrThrow({ where: { farmId: a.farm.id, name: "Lilies" } });
    const wrong = await sendAllocationRequests({
      exporterId: order.exporterId,
      orderId: order.id,
      deadlineMinutes: 30,
      lines: [{ varietyId: lilies.id, quantity: 100 }],
    });
    expect(wrong).toMatchObject({ ok: false, error: expect.stringMatching(/no longer grows/i) });
    expect(await db.allocationRequest.count()).toBe(0);
  });
});

describe("expireOverdueRequests", () => {
  it("expires pending requests past their deadline and frees them to be re-requested", async () => {
    const { order, a, send } = await scenario();
    await send([{ varietyId: a.variety.id, quantity: 500 }]);
    expect((await getOrderPosition(db, order.id)).remaining).toBe(1500);

    await db.allocationRequest.updateMany({
      where: { orderId: order.id },
      data: { responseDeadline: new Date(Date.now() - 1000) },
    });
    expect(await expireOverdueRequests()).toBe(1);

    const req = await db.allocationRequest.findFirstOrThrow({ where: { orderId: order.id } });
    expect(req).toMatchObject({ status: "EXPIRED", confirmedQty: 0 });
    expect(req.expiredAt).not.toBeNull();
    expect((await getOrderPosition(db, order.id)).remaining).toBe(2000);
    expect(await expireOverdueRequests()).toBe(0); // idempotent

    // The exporter is told once, not once per page load.
    const notes = await db.notification.findMany({ where: { type: "REQUEST_EXPIRED" } });
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toMatch(/did not reply in time/i);
  });
});
