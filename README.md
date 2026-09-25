# Tawi AI (pilot MVP)

Coordinates cut-flower supply between Kenyan farms and exporters: real-time
available-to-promise (ATP) stock per farm, and a fast farm confirmation flow that
locks stock so the same flowers are never promised to two buyers.

Stack: Next.js (App Router) + TypeScript, PostgreSQL + Prisma, Tailwind CSS.
Mobile-first: farm managers use it on phones in the field.

## Setup

Requirements: Node 20.19+ / 22.12+ and a PostgreSQL database (Neon, Supabase or local).

```bash
npm install
cp .env.example .env        # then fill in the values below
npx prisma migrate dev      # create the tables
npm run db:seed             # 5 farms, 2 exporters, varieties, stock
npm run dev                 # http://localhost:3000
```

In dev mode (`SMS_MODE=console`), login codes are printed in the terminal running
`npm run dev`, e.g. `[SMS to +254712345678] Your Tawi login code is 123456.`

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. On Vercel use the pooled URL from Neon/Supabase. |
| `TEST_DATABASE_URL` | A **separate** database for tests. Tests wipe it. |
| `SMS_MODE` | `console` (default, logs the OTP) or `africastalking` (sends real SMS). |
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

Tests run against real Postgres (`TEST_DATABASE_URL`), because the stock-locking
guarantees can only be tested on a real database. Migrations are applied to the
test database automatically before the run.

The concurrency tests in `tests/confirmations.test.ts` are the important ones:
they make transactions genuinely overlap and check that simultaneous
confirmations can never promise the same stems twice. Removing the row locks
makes them fail.

## The invariant

**For any farm + variety, confirmed allocations can never exceed logged stock.**

- ATP = latest logged stock − confirmed quantities on orders that aren't fulfilled.
- Every write that can break this (a farm confirming, a farm logging new stock,
  an exporter sending requests) runs in one transaction that takes `SELECT …
  FOR UPDATE` row locks in a fixed order: order, then variety, then request.
- ATP is always recomputed from the database inside those locks. Numbers from
  the browser are never trusted.
- Logging stock below what is already promised is refused.
- Marking an order fulfilled releases its allocations.
- `/metrics` runs a live integrity check that should always show 0 duplicate
  promises.

## Database

- Schema: `prisma/schema.prisma`. Migrations: `prisma/migrations/`.
- The init migration adds hand-written `CHECK` constraints (non-negative stock,
  confirmed ≤ requested) that Prisma can't express.
- Production: `npm run db:deploy` applies migrations without prompting.

## Deploying (Vercel + Neon/Supabase)

1. Create the database and copy its connection strings.
2. Set the env vars above in Vercel. Set `SMS_MODE=africastalking` for real SMS.
3. Run `npm run db:deploy` against the production `DATABASE_URL` once per release
   (or add it to the build command).

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
prisma/            schema, migrations, seed.ts
src/app/           pages and server actions (farm/, exporter/, login/, onboarding/, metrics/)
src/lib/           db, auth, otp, sms, phone, stock, allocations, confirmations, metrics
src/components/    small shared UI pieces
tests/             Vitest tests (need TEST_DATABASE_URL)
```

## Deliberately not built

Role-based access, harvest forecasting, grades or stem lengths, saleable %,
algorithmic or AI matching, supplier scoring, alternative-supplier suggestions,
WhatsApp, email, exports and audit logs.
