import { PrismaClient } from "@prisma/client";

/**
 * Pilot seed data: 5 farms and 2 exporters, each with one user, their
 * varieties and today's stock.
 *
 *   npm run db:seed            fills an empty database
 *   npm run db:seed -- --reset deletes everything first
 *
 * Log in as any phone below; in dev the code is printed by `npm run dev`.
 */
const db = new PrismaClient();

const FARMS = [
  { name: "Naivasha Roses", contact: "Wanjiku Kamau", phone: "+254700000001", location: "Naivasha",
    stock: { Roses: 12_000, Mums: 3_000 } },
  { name: "Lake View Flowers", contact: "Grace Achieng", phone: "+254700000002", location: "Nanyuki",
    stock: { Roses: 8_500, Lilies: 2_400 } },
  { name: "Kinangop Blooms", contact: "Peter Otieno", phone: "+254700000003", location: "Kinangop",
    stock: { Roses: 5_000 } },
  { name: "Thika Flower Farm", contact: "Mary Njeri", phone: "+254700000004", location: "Thika",
    stock: { Mums: 6_000, Lilies: 1_800 } },
  { name: "Mount Kenya Petals", contact: "Samuel Kiptoo", phone: "+254700000005", location: "Timau",
    stock: { Roses: 9_200, Mums: 2_100, Lilies: 3_300 } },
];

const EXPORTERS = [
  { name: "Nairobi Blooms Ltd", contact: "James Mwangi", phone: "+254711000001" },
  { name: "Rift Valley Exports", contact: "Aisha Hassan", phone: "+254711000002" },
];

async function reset() {
  await db.$executeRawUnsafe(`
    TRUNCATE "Notification", "AllocationRequest", "Order", "StockEntry", "Variety",
             "Session", "OtpCode", "User", "Organization", "AccessRequest" CASCADE`);
  console.log("Cleared existing data.");
}

async function main() {
  if (process.argv.includes("--reset")) await reset();

  const existing = await db.organization.count();
  if (existing > 0) {
    console.log(`Database already has ${existing} organizations. Run with --reset to start over.`);
    return;
  }

  for (const farm of FARMS) {
    const org = await db.organization.create({
      data: {
        name: farm.name,
        type: "FARM",
        contactPerson: farm.contact,
        phone: farm.phone,
        location: farm.location,
        users: { create: { name: farm.contact, phone: farm.phone } },
      },
      include: { users: true },
    });

    for (const [variety, quantity] of Object.entries(farm.stock)) {
      const v = await db.variety.create({ data: { farmId: org.id, name: variety } });
      await db.stockEntry.create({
        data: {
          farmId: org.id,
          varietyId: v.id,
          quantity,
          location: "Cold store",
          loggedById: org.users[0].id,
        },
      });
    }
    console.log(`Farm: ${farm.name} (${farm.phone})`);
  }

  for (const exporter of EXPORTERS) {
    await db.organization.create({
      data: {
        name: exporter.name,
        type: "EXPORTER",
        contactPerson: exporter.contact,
        phone: exporter.phone,
        users: { create: { name: exporter.contact, phone: exporter.phone } },
      },
    });
    console.log(`Exporter: ${exporter.name} (${exporter.phone})`);
  }

  console.log("\nSeeded 5 farms and 2 exporters. Log in with any phone above.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
