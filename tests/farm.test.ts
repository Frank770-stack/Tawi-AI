import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addVariety, removeVariety } from "@/lib/farm";
import { createFarm, resetDb } from "./helpers";

beforeEach(resetDb);

describe("varieties", () => {
  it("adds a variety from the fixed list only", async () => {
    const farm = await createFarm();
    expect(await addVariety(farm.id, "Roses")).toEqual({ ok: true });
    expect((await addVariety(farm.id, "Tulips")).ok).toBe(false);
    expect(await db.variety.count({ where: { farmId: farm.id } })).toBe(1);
  });

  it("adding twice does not duplicate", async () => {
    const farm = await createFarm();
    await addVariety(farm.id, "Roses");
    await addVariety(farm.id, "Roses");
    expect(await db.variety.count({ where: { farmId: farm.id } })).toBe(1);
  });

  it("remove archives, and re-adding restores the same row", async () => {
    const farm = await createFarm();
    await addVariety(farm.id, "Mums");
    const v = await db.variety.findFirstOrThrow({ where: { farmId: farm.id } });

    expect(await removeVariety(farm.id, v.id)).toEqual({ ok: true });
    expect((await db.variety.findUniqueOrThrow({ where: { id: v.id } })).archivedAt).not.toBeNull();

    await addVariety(farm.id, "Mums");
    const restored = await db.variety.findUniqueOrThrow({ where: { id: v.id } });
    expect(restored.archivedAt).toBeNull();
  });

  it("a farm cannot remove another farm's variety", async () => {
    const farmA = await createFarm("A");
    const farmB = await createFarm("B");
    await addVariety(farmA.id, "Lilies");
    const v = await db.variety.findFirstOrThrow({ where: { farmId: farmA.id } });
    expect((await removeVariety(farmB.id, v.id)).ok).toBe(false);
  });

  it("cannot remove a variety with a pending request", async () => {
    const farm = await createFarm();
    const exporter = await db.organization.create({
      data: { name: "Exp", type: "EXPORTER", contactPerson: "E", phone: "+254711111111" },
    });
    await addVariety(farm.id, "Roses");
    const v = await db.variety.findFirstOrThrow({ where: { farmId: farm.id } });
    const order = await db.order.create({
      data: {
        exporterId: exporter.id, varietyName: "Roses", quantity: 100,
        deliveryDate: new Date(), buyerName: "B", buyerContact: "x",
      },
    });
    await db.allocationRequest.create({
      data: {
        orderId: order.id, farmId: farm.id, varietyId: v.id, requestedQty: 100,
        responseDeadline: new Date(Date.now() + 3600_000),
      },
    });
    expect((await removeVariety(farm.id, v.id)).ok).toBe(false);
  });
});
