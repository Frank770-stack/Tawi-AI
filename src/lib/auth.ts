import { createHash, randomBytes } from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { OrgType } from "@prisma/client";
import { db } from "./db";
import { normalizeKenyanPhone } from "./phone";

const COOKIE = "tawi_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Call only from a Server Action or Route Handler (sets a cookie). */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Call only from a Server Action or Route Handler. */
export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  store.delete(COOKIE);
}

/** The logged-in user with their organization, or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { include: { organization: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function dashboardPath(type: OrgType) {
  return type === "FARM" ? "/farm" : "/exporter";
}

/** Where a logged-in user belongs right now. */
export function homePathFor(user: CurrentUser) {
  if (!user.name || !user.organization) return "/onboarding";
  return dashboardPath(user.organization.type);
}

/** Logged in, any profile state. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Logged in with a completed profile and an organization of the given type. */
export async function requireOrg(type: OrgType) {
  const user = await requireUser();
  if (!user.name || !user.organization) redirect("/onboarding");
  if (user.organization.type !== type) redirect(dashboardPath(user.organization.type));
  return { ...user, name: user.name, organization: user.organization };
}

/** Internal metrics access: phones listed in INTERNAL_PHONES. */
export function isInternalPhone(phone: string) {
  const allowed = (process.env.INTERNAL_PHONES ?? "")
    .split(",")
    .map((p) => normalizeKenyanPhone(p))
    .filter(Boolean);
  return allowed.includes(phone);
}
