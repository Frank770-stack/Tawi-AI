import { db } from "@/lib/db";

/**
 * Empties every collection. Call in beforeEach. Children are deleted before
 * their parents, because Prisma enforces relations on MongoDB too. Independent
 * collections go together to save round trips to Atlas.
 */
export async function resetDb() {
  await Promise.all([
    db.notification.deleteMany(),
    db.allocationRequest.deleteMany(),
    db.otpCode.deleteMany(),
    db.session.deleteMany(),
    db.accessRequest.deleteMany(),
  ]);
  await Promise.all([db.order.deleteMany(), db.stockEntry.deleteMany()]);
  await db.variety.deleteMany();
  await db.user.deleteMany();
  await db.organization.deleteMany();
}

export async function createFarm(name = "Test Farm") {
  return db.organization.create({
    data: { name, type: "FARM", contactPerson: "Test", phone: "+254700000000" },
  });
}
