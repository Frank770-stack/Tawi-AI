import { redirect } from "next/navigation";
import { getCurrentUser, homePathFor } from "@/lib/auth";
import { ButtonLink, Logo } from "@/components/ui";
import { AccessRequestForm } from "./access-request-form";

// Public home page. Logged-in users go straight to their dashboard.
// Copy marked TODO is placeholder for the founder to replace.

const steps = [
  {
    title: "Farms log daily stock",
    text: "A quick count per variety each morning, from the phone.", // TODO: founder copy
    icon: (
      <path d="M4 20h16M7 20v-6m5 6V9m5 11v-9" strokeWidth="2" strokeLinecap="round" />
    ),
  },
  {
    title: "Exporters pick farms and send requests",
    text: "See what each farm can still promise, then split the order across farms.", // TODO: founder copy
    icon: (
      <path d="M4 12h12m0 0-4-4m4 4-4 4M20 5v14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    title: "Farms confirm and stock locks",
    text: "One tap to confirm. Confirmed stems can't be promised to anyone else.", // TODO: founder copy
    icon: (
      <>
        <rect x="5" y="11" width="14" height="9" rx="2" strokeWidth="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeWidth="2" />
      </>
    ),
  },
];

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user));

  return (
    <>
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4">
        <Logo />
        <ButtonLink href="/login" variant="ghost" className="min-h-11 px-3 text-sm">
          Log in
        </ButtonLink>
      </header>

      <main className="flex-1">
        {/* 1. Hero */}
        <section className="mx-auto max-w-3xl px-4 pt-6 pb-10">
          {/* TODO: founder to confirm headline and supporting line */}
          <h1 className="text-3xl leading-tight font-bold sm:text-4xl">
            Stop promising the same flowers to two buyers.
          </h1>
          <p className="mt-3 text-lg text-muted">
            Tawi shows exporters what each farm can really supply today, and gets farm confirmations in minutes,
            not hours.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/login" className="sm:w-auto">
              Log in with your phone
            </ButtonLink>
            <ButtonLink href="#request-access" variant="secondary" className="sm:w-auto">
              Request access
            </ButtonLink>
          </div>
          <p className="mt-3 text-sm text-muted">Invite-only pilot with Kenyan farms and exporters.</p>
        </section>

        {/* 2. How it works */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-3xl px-4 py-10">
            <h2 className="text-2xl font-bold">How it works</h2>
            <ol className="mt-6 grid gap-6 sm:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="flex gap-4 sm:flex-col sm:gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" className="h-7 w-7">
                      {step.icon}
                    </svg>
                  </span>
                  <div>
                    <h3 className="font-bold">
                      <span className="text-brand-700">{i + 1}.</span> {step.title}
                    </h3>
                    <p className="mt-1 text-muted">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 3. For farms / for exporters */}
        <section className="mx-auto grid max-w-3xl gap-4 px-4 py-10 sm:grid-cols-2">
          {/* TODO: founder to confirm benefit copy */}
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-xl font-bold">For farms</h2>
            <ul className="mt-3 space-y-2">
              <Benefit>See exactly how much of your stock is already promised.</Benefit>
              <Benefit>Confirm, reduce or reject requests from your phone, in the field.</Benefit>
              <Benefit>No more calls asking the same question twice.</Benefit>
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-xl font-bold">For exporters</h2>
            <ul className="mt-3 space-y-2">
              <Benefit>See real farm availability before you promise a buyer.</Benefit>
              <Benefit>See a shortage the moment a farm can&apos;t fill a request.</Benefit>
              <Benefit>Split one order across several farms and track every confirmation.</Benefit>
            </ul>
          </div>
        </section>

        {/* 4. Request access */}
        <section id="request-access" className="border-t border-line bg-surface">
          <div className="mx-auto max-w-md px-4 py-10">
            <h2 className="text-2xl font-bold">Request access</h2>
            <p className="mt-1 text-muted">
              The pilot is invite-only. Leave your details and we&apos;ll contact you. {/* TODO: founder copy */}
            </p>
            <div className="mt-6">
              <AccessRequestForm />
            </div>
          </div>
        </section>
      </main>

      {/* 5. Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:justify-between">
          <Logo className="text-base" />
          {/* TODO: replace with real contact details */}
          <span>Contact: hello@example.com · +254 700 000 000</span>
          <span>© {new Date().getFullYear()} Tawi AI</span>
        </div>
      </footer>
    </>
  );
}

function Benefit({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-brand-600">
        <path d="M5 10.5 8.5 14 15 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{children}</span>
    </li>
  );
}
