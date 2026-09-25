"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-12 items-center whitespace-nowrap border-b-4 px-4 font-semibold hover:bg-brand-50 ${
        active ? "border-brand-700 text-brand-800" : "border-transparent text-muted"
      }`}
    >
      {children}
    </Link>
  );
}
