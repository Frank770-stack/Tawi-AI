import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addVariety } from "@/lib/farm";
import { getStockPositions, lockVariety, logStock, startOfTodayNairobi } from "@/lib/stock";
import { createFarm, resetDb } from "./helpers";

beforeEach(resetDb);

async function setup() {
  const farm = await createFarm();
  await addVariety(farm.id, "Roses");
  const variety = await db.variety.findFirstOrThrow({ where: { farmId: farm.id } });
  const exporter = await db.organization.create({
    data: { name: "Exp", type: "EXPORTER", contactPerson: "E", phone: "+254711111111" },
  });
  const log = (quantity: number) =>
    logStock({ farmId: farm.id, varietyId: variety.id, quantity, location: "Cold store", userId: "u1" });

  /** A confirmed allocation of `qty` stems on a new order for this variety. */
  async function confirmed(qty: number, orderStatus: "CONFIRMED" | "FULFILLED" = "CONFIRMED") {
    const order = await db.order.create({
      data: {
        exporterId: exporter.id, varietyName: "Roses", quantity: qty, status: orderStatus,
        deliveryDate: new Date(), buyerName: "B", buyerContact: "x",
      },
    });
    return db.allocationRequest.create({
      data: {
        orderId: order.id, farmId: farm.id, varietyId: variety.id, requestedQty: qty,
        confirmedQty: qty, status: "CONFIRMED", responseDeadline: new Date(),
      },
    });
  }
  return { farm, variety, exporter, log, confirmed };
}

describe("stock positions", () => {
  it("latest entry is current stock, history is kept", async () => {
    const { farm, log } = await setup();
    await log(1000);
    await new Promise((r) => setTimeout(r, 5));
    await log(2500);
    const [p] = await getStockPositions(farm.id);
    expect(p).toMatchObject({ name: "Roses", stock: 2500, allocated: 0, atp: 2500, updatedToday: true });
    expect(p.history.map((h) => h.quantity)).toEqual([2500, 1000]);
  });

  it("ATP subtracts confirmed allocations on unfulfilled orders only", async () => {
    const { farm, log, confirmed } = await setup();
    await log(3000);
    await confirmed(1200);
    await confirmed(500, "FULFILLED"); // released
    const [p] = await getStockPositions(farm.id);
    expect(p).toMatchObject({ stock: 3000, allocated: 1200, atp: 1800 });
  });

  it("pending and rejected requests don't reduce ATP", async () => {
    const { farm, variety, log, confirmed } = await setup();
    await log(1000);
    const req = await confirmed(1);
    await db.allocationRequest.update({ where: { id: req.id }, data: { confirmedQty: 0, status: "PENDING" } });
    expect((await getStockPositions(farm.id))[0].atp).toBe(1000);
    expect(variety.id).toBeTruthy();
  });

  it("flags stock not updated today", async () => {
    const { farm, variety, log } = await setup();
    let [p] = await getStockPositions(farm.id);
    expect(p).toMatchObject({ stock: 0, lastUpdated: null, updatedToday: false });

    await log(100);
    await db.stockEntry.updateMany({
      where: { varietyId: variety.id },
      data: { loggedAt: new Date(startOfTodayNairobi().getTime() - 60_000) }, // 23:59 yesterday, Kenya time
    });
    [p] = await getStockPositions(farm.id);
    expect(p.updatedToday).toBe(false);
  });
});

describe("logStock", () => {
  it("rejects a count below what's already promised", async () => {
    const { log, confirmed } = await setup();
    await log(2000);
    await confirmed(1500);
    expect(await log(1400)).toMatchObject({ ok: false, error: expect.stringMatching(/1,500 stems are already promised/) });
    expect(await log(1500)).toEqual({ ok: true }); // exactly allocated is fine (ATP 0)
  });

  it("rejects negative or fractional quantities", async () => {
    const { log } = await setup();
    expect((await log(-1)).ok).toBe(false);
    expect((await log(1.5)).ok).toBe(false);
  });

  it("rejects another farm's variety and archived varieties", async () => {
    const { variety } = await setup();
    const other = await createFarm("Other");
    const res = await logStock({ farmId: other.id, varietyId: variety.id, quantity: 10, location: "x", userId: "u" });
    expect(res.ok).toBe(false);

    await db.variety.update({ where: { id: variety.id }, data: { archivedAt: new Date() } });
    const res2 = await logStock({ farmId: variety.farmId, varietyId: variety.id, quantity: 10, location: "x", userId: "u" });
    expect(res2.ok).toBe(false);
  });

  it("waits for a concurrent confirmation's lock, then refuses to drop below the new allocation", async () => {
    const { variety, log, confirmed } = await setup();
    await log(1000);
    // An 800-stem request that isn't confirmed yet; A confirms it inside the lock.
    const req = await confirmed(800);
    await db.allocationRequest.update({ where: { id: req.id }, data: { confirmedQty: 0, status: "PENDING" } });

    // Transaction A: take the variety lock, confirm 800 stems, hold the lock a moment.
    let lockTaken!: () => void;
    const locked = new Promise<void>((r) => (lockTaken = r));
    const confirmation = db.$transaction(async (tx) => {
      await lockVariety(tx, variety.id);
      lockTaken();
      await tx.allocationRequest.update({ where: { id: req.id }, data: { confirmedQty: 800, status: "CONFIRMED" } });
      await new Promise((r) => setTimeout(r, 300));
    });

    // Transaction B: starts while A holds the lock and tries to drop stock to 500.
    await locked;
    const stockUpdate = log(500);

    await confirmation;
    expect(await stockUpdate).toMatchObject({ ok: false, error: expect.stringMatching(/800 stems/) });
    const latest = await db.stockEntry.findFirstOrThrow({ where: { varietyId: variety.id }, orderBy: { loggedAt: "desc" } });
    expect(latest.quantity).toBe(1000);
  });
});

describe("startOfTodayNairobi", () => {
  it("uses Kenyan midnight (21:00 UTC the day before)", () => {
    expect(startOfTodayNairobi(new Date("2026-09-22T05:00:00Z")).toISOString()).toBe("2026-09-21T21:00:00.000Z");
    expect(startOfTodayNairobi(new Date("2026-09-21T22:30:00Z")).toISOString()).toBe("2026-09-21T21:00:00.000Z");
    expect(startOfTodayNairobi(new Date("2026-09-21T20:59:00Z")).toISOString()).toBe("2026-09-20T21:00:00.000Z");
  });
});
