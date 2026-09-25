import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { nairobiDateISO } from "@/lib/format";
import { createOrder, type OrderInput } from "@/lib/orders";
import { resetDb } from "./helpers";

beforeEach(resetDb);

const tomorrow = nairobiDateISO(new Date(Date.now() + 86_400_000));
const valid: OrderInput = {
  varietyName: "Roses",
  quantity: "2,000",
  deliveryDate: tomorrow,
  buyerName: "Amsterdam Flower Traders",
  buyerContact: "+31 20 123 4567",
};

async function exporter() {
  return db.organization.create({
    data: { name: "Exp", type: "EXPORTER", contactPerson: "E", phone: "+254711111111" },
  });
}

describe("createOrder", () => {
  it("creates a NEW order with the parsed quantity and a calendar delivery date", async () => {
    const exp = await exporter();
    const result = await createOrder(exp.id, valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order).toMatchObject({
      exporterId: exp.id,
      varietyName: "Roses",
      quantity: 2000,
      status: "NEW",
      buyerName: "Amsterdam Flower Traders",
      firstRequestAt: null,
      confirmedAt: null,
      fulfilledAt: null,
      deliveredQuantity: null,
    });
    expect(result.order.deliveryDate.toISOString().slice(0, 10)).toBe(tomorrow);
  });

  it("accepts today (Kenyan time) as the delivery date", async () => {
    const exp = await exporter();
    expect((await createOrder(exp.id, { ...valid, deliveryDate: nairobiDateISO(new Date()) })).ok).toBe(true);
  });

  it.each<[string, Partial<OrderInput>, RegExp]>([
    ["unknown variety", { varietyName: "Tulips" }, /variety/i],
    ["zero quantity", { quantity: "0" }, /at least 1/i],
    ["non-numeric quantity", { quantity: "lots" }, /number of stems/i],
    ["negative quantity", { quantity: "-5" }, /number of stems/i],
    ["fractional quantity", { quantity: "10.5" }, /number of stems/i],
    ["past delivery date", { deliveryDate: "2020-01-01" }, /past/i],
    ["malformed date", { deliveryDate: "25/09/2026" }, /delivery date/i],
    ["impossible date", { deliveryDate: "2099-13-45" }, /valid delivery date/i],
    ["missing buyer", { buyerName: " " }, /buyer's name/i],
    ["missing contact", { buyerContact: "" }, /phone or email/i],
  ])("rejects %s", async (_label, change, message) => {
    const exp = await exporter();
    const result = await createOrder(exp.id, { ...valid, ...change });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(message) });
    expect(await db.order.count()).toBe(0);
  });
});
