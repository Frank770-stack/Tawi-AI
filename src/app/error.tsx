"use client";

import { buttonClass, Logo } from "@/components/ui";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
      <Logo />
      <div className="mt-16">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-muted">
          Nothing was saved. Check your signal and try again.
        </p>
        <button type="button" onClick={reset} className={buttonClass("primary", "mt-6 w-full")}>
          Try again
        </button>
      </div>
    </main>
  );
}
