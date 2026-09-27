import { PrismaClient } from "@prisma/client";

// MongoDB note: Prisma omits nullable fields it isn't given, and a
// `{ field: null }` filter does NOT match a document where the field is
// missing. So every create must write an explicit null for any nullable field
// that is later filtered on null (consumedAt, archivedAt, readAt,
// organizationId). Leaving one out silently breaks those queries.

// Reuse one client across hot reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/**
 * Every query inside a transaction is a network round trip to Atlas, and
 * Prisma's default 5s limit is too tight for that. Pass these to $transaction
 * wherever several writes have to commit together.
 */
export const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 };
