import { db } from "@/lib/db";

/** Empties every table. Call in beforeEach. */
export async function resetDb() {
  await db.$executeRawUnsafe(`
    TRUNCATE "Notification", "AllocationRequest", "Order", "StockEntry", "Variety",
             "Session", "OtpCode", "User", "Organization", "AccessRequest" CASCADE`);
}

export async function createFarm(name = "Test Farm") {
  return db.organization.create({
    data: { name, type: "FARM", contactPerson: "Test", phone: "+254700000000" },
  });
}
