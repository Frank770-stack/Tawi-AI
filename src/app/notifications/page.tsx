import Link from "next/link";
import { redirect } from "next/navigation";
import { dashboardPath, requireUser } from "@/lib/auth";
import { formatWhen } from "@/lib/format";
import { listNotifications } from "@/lib/notifications";
import { Card, Logo } from "@/components/ui";
import { MarkRead } from "./mark-read";

export const metadata = { title: "Notifications · Tawi AI" };

export default async function NotificationsPage() {
  const user = await requireUser();
  if (!user.organization) redirect("/onboarding");

  const notifications = await listNotifications(user.organization.id);
  const unread = notifications.filter((n) => !n.readAt).length;
  const home = dashboardPath(user.organization.type);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
      <MarkRead unread={unread} />
      <div className="flex items-center justify-between gap-3">
        <Logo />
        <Link href={home} className="inline-flex min-h-11 items-center font-semibold text-brand-800">
          Back
        </Link>
      </div>

      <h1 className="mt-6 text-2xl font-bold">Notifications</h1>

      {notifications.length === 0 ? (
        <Card className="mt-4">
          <p className="font-semibold">Nothing yet</p>
          <p className="mt-1 text-sm text-muted">
            {user.organization.type === "FARM"
              ? "You'll be told here when an exporter needs flowers."
              : "You'll be told here when a farm answers a request."}
          </p>
        </Card>
      ) : (
        <Card flush className="mt-4 divide-y divide-line">
          {notifications.map((n) => (
            <Link key={n.id} href={n.link} className="flex items-start gap-3 p-4 hover:bg-canvas">
              <span
                aria-hidden="true"
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.readAt ? "bg-line" : "bg-petal-600"}`}
              />
              <span className="min-w-0">
                <span className={`block ${n.readAt ? "" : "font-semibold"}`}>{n.message}</span>
                <span className="mt-0.5 block text-sm text-muted">{formatWhen(n.createdAt)}</span>
              </span>
            </Link>
          ))}
        </Card>
      )}
    </main>
  );
}
