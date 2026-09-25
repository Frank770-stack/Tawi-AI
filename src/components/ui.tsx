import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Shared look for buttons and links-as-buttons. Min height 48px = easy tap target.
const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const variants = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900",
  secondary: "border-2 border-brand-700 bg-surface text-brand-800 hover:bg-brand-50",
  ghost: "text-brand-800 hover:bg-brand-50",
  danger: "border-2 border-danger bg-surface text-danger hover:bg-danger-50",
};
export type ButtonVariant = keyof typeof variants;

export function buttonClass(variant: ButtonVariant = "primary", extra = "") {
  return `${base} ${variants[variant]} ${extra}`;
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link {...props} className={buttonClass(variant, className)} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "block min-h-12 w-full rounded-xl border-2 border-line bg-surface px-4 text-lg text-ink placeholder:text-stone-400 focus:border-brand-600 focus:outline-none";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger">
      {message}
    </p>
  );
}

/** `flush` removes the padding, for lists whose rows have their own. */
export function Card({
  children,
  className = "",
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-surface ${flush ? "" : "p-4 sm:p-5"} ${className}`}>
      {children}
    </div>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold text-brand-800 ${className}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
        <path d="M12 21V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 14c-3.5 0-6-2.5-6-6 3.5 0 6 2.5 6 6Z" fill="currentColor" />
        <path d="M12 11c0-3.3 2.2-6 5.5-6 0 3.3-2.2 6-5.5 6Z" className="fill-petal-600" />
      </svg>
      Tawi AI
    </span>
  );
}
