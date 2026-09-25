import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions";
import { Logo } from "./ui";
import { NavLink } from "./nav-link";
import { NotificationBell } from "./notification-bell";

export function AppShell({
  orgName,
  userName,
  nav,
  unreadCount,
  children,
}: {
  orgName: string;
  userName: string;
  nav: { href: string; label: string }[];
  unreadCount: number;
  children: ReactNode;
}) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell initialCount={unreadCount} />
            <form action={logout}>
              <button type="submit" className="min-h-11 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-canvas">
                Log out
              </button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-2 text-sm text-muted">
          <span className="font-semibold text-ink">{orgName}</span> · {userName}
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-2">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">{children}</main>
    </>
  );
}
