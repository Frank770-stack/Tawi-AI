import { requireOrg } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { unreadCount } from "@/lib/notifications";

export default async function ExporterLayout({ children }: LayoutProps<"/exporter">) {
  const user = await requireOrg("EXPORTER");
  const unread = await unreadCount(user.organization.id);
  return (
    <AppShell
      unreadCount={unread}
      orgName={user.organization.name}
      userName={user.name}
      nav={[
        { href: "/exporter", label: "Orders" },
        { href: "/exporter/orders/new", label: "New order" },
      ]}
    >
      {children}
    </AppShell>
  );
}
