# Tawi AI (pilot MVP)

Coordinates cut-flower supply between Kenyan farms and exporters: real-time
available-to-promise (ATP) stock per farm, and a fast farm confirmation flow that
locks stock so the same flowers are never promised to two buyers.

Stack: Next.js (App Router) + TypeScript, MongoDB Atlas + Prisma, Tailwind CSS.
Mobile-first: farm managers use it on phones in the field.

## Setup

Requirements: Node 20.19+ / 22.12+ and a MongoDB Atlas cluster. It must be a
replica set (every Atlas cluster is, including the free tier), because the
confirmation flow needs transactions.

```bash
npm install
cp .env.example .env        # then fill in the values below
npm run db:push             # create collections and indexes
npm run db:seed             # 5 farms, 2 exporters, varieties, stock
npm run dev                 # http://localhost:3000
```

In dev mode (`SMS_MODE=console`), login codes are printed in the terminal running
`npm run dev`, e.g. `[SMS to +254712345678] Your Tawi login code is 123456.`

### Logging in before SMS is wired up

Set `SHOW_OTP_ON_SCREEN="true"` and the login screen shows the code and fills it
in for you, so you can test without reading server logs.

**This is an auth bypass.** Anyone who knows a phone number can log in as that
organization. Leave it unset on anything real users can reach, and switch to
`SMS_MODE=africastalking` before the pilot. The flag is ignored whenever
`SMS_MODE` is `africastalking`, so real SMS and on-screen codes can never be on
at the same time.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MongoDB Atlas connection string, including the database name (`/tawi`). |
| `TEST_DATABASE_URL` | A **separate** database for tests. Tests wipe it. |
| `SMS_MODE` | `console` (default, logs the OTP) or `africastalking` (sends real SMS). |
| `SHOW_OTP_ON_SCREEN` | `true` also shows the login code on the login screen. **Testing only** (see below). |
| `AFRICASTALKING_USERNAME` | Africa's Talking username. `sandbox` uses the sandbox API. |
| `AFRICASTALKING_API_KEY` | Africa's Talking API key. |
| `AFRICASTALKING_SENDER_ID` | Optional registered sender ID / shortcode. |
| `INTERNAL_PHONES` | Comma-separated phones allowed to open `/metrics`. Any Kenyan format. |

## Seed data

```bash
npm run db:seed             # only fills an empty database
npm run db:seed -- --reset  # deletes everything first, then seeds
```

Creates 5 farms (`+254700000001` … `+254700000005`) and 2 exporters
(`+254711000001`, `+254711000002`), each with one user, their varieties and
today's stock. Log in as any of those phone numbers.

To see `/metrics` locally, put one of those phones in `INTERNAL_PHONES`.

## Tests

```bash
npm test
```

Tests run against a real MongoDB database (`TEST_DATABASE_URL`), because the
safety guarantees can only be tested on a real database. The schema is pushed
to the test database automatically before the run.

They are slow: every query is a network round trip to Atlas, so the full suite
takes several minutes. Run one file while working, e.g.
`npx vitest run tests/confirmations.test.ts`.

The concurrency tests in `tests/confirmations.test.ts` are the important ones:
they make transactions genuinely overlap and check that simultaneous
confirmations can never promise the same stems twice.

## The invariant

**For any farm + variety, confirmed allocations can never exceed logged stock.**

Each `Variety` document carries two counters: `stock` (the latest logged count)
and `allocated` (stems confirmed on orders that aren't fulfilled). ATP is
`stock - allocated`.

MongoDB has no row locks, so the guarantee rests on **atomic compare-and-set**:

- Every write that can break the invariant (a farm confirming, a farm logging
  new stock, an order being delivered) runs inside a transaction, and updates
  the variety document with a condition pinning `stock` and `allocated` to the
  exact values it validated against (`src/lib/stock.ts`).
- MongoDB applies a single document update atomically, so the check and the
  write cannot interleave. If anything changed underneath, nothing is written,
  and the caller retries against fresh numbers or is refused.
- `compareAndSetAllocated` also refuses outright if the new total would exceed
  stock, so the invariant cannot be broken even by a direct call.
- ATP is always recomputed from the database. Numbers from the browser are
  never trusted.
- Logging stock below what is already promised is refused.
- Marking an order fulfilled releases its allocations.
- `/metrics` runs a live integrity check that should always show 0 duplicate
  promises. It covers three cases: allocated above stock, an order confirmed
  beyond its quantity, and the `allocated` counter drifting away from the
  confirmed requests it is derived from.

### MongoDB gotcha worth knowing

Prisma omits nullable fields it isn't given, and a `{ field: null }` filter does
**not** match a document where the field is missing. Every create therefore
writes explicit nulls for fields that are later filtered on null (`consumedAt`,
`archivedAt`, `readAt`, `organizationId`). Leaving one out silently breaks those
queries; there's a note in `src/lib/db.ts`.

## Database

- Schema: `prisma/schema.prisma`. MongoDB has no migrations: `npm run db:push`
  syncs collections and indexes.
- Run `npm run db:push` after changing the schema, including against production.
- MongoDB has no CHECK constraints, so the equivalent rules (non-negative stock,
  confirmed ≤ requested, allocated ≤ stock) are enforced in application code and
  re-checked by the integrity check on `/metrics`.

## Deploying (Vercel + MongoDB Atlas)

1. In Atlas, allow Vercel to connect (Network Access). Vercel's IPs are not
   fixed, so the pilot uses `0.0.0.0/0` with a strong database password.
2. Set the env vars above in Vercel. Set `SMS_MODE=africastalking` for real SMS.
3. Run `npm run db:push` against the production `DATABASE_URL` after any schema
   change.

## Auth

- Phone + SMS OTP. Numbers are normalised to `+254XXXXXXXXX`.
- Codes: 6 digits, 5-minute expiry, single use, only a hash is stored,
  max 5 wrong attempts per code, max 3 codes per phone per 15 minutes.
- Sessions: random token in an httpOnly cookie (30 days); only its hash is stored.
- Each user belongs to one organization of type `FARM` or `EXPORTER`, which decides
  their dashboard. There are no other roles.

## What the app does

- **Home page (`/`)** — public. Placeholder copy is marked `TODO` in
  `src/app/page.tsx`. "Request access" submissions appear on `/metrics`.
- **Farm** — log daily stock per variety (current, promised, available, with
  stale-stock flags); answer requests with Confirm, Confirm less or Reject;
  dashboard of waiting requests and confirmed amounts.
- **Exporter** — create orders; pick farms by hand from a list showing each
  farm's real availability; split a quantity across farms with a running total;
  set a response deadline; see confirmed, shortage and a per-farm breakdown;
  mark an order delivered.
- **Notifications** — in-app only, with an unread badge polled every 30 seconds.
- **`/metrics`** — internal. Average confirmation time (target < 5 min), replies
  within 30 minutes (target > 85%), fulfilment accuracy (target > 90%), counts,
  the duplicate-promise check, and access requests.

## Project layout

```
prisma/            schema.prisma, seed.ts
src/app/           pages and server actions (farm/, exporter/, login/, onboarding/, metrics/)
src/lib/           db, auth, otp, sms, phone, stock (compare-and-set), allocations,
                   confirmations, metrics
src/components/    small shared UI pieces
tests/             Vitest tests (need TEST_DATABASE_URL)
```

## Deliberately not built

Role-based access, harvest forecasting, grades or stem lengths, saleable %,
algorithmic or AI matching, supplier scoring, alternative-supplier suggestions,
WhatsApp, email, exports and audit logs.
