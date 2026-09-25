import { requireOrg } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { unreadCount } from "@/lib/notifications";

export default async function FarmLayout({ children }: LayoutProps<"/farm">) {
  const user = await requireOrg("FARM");
  const unread = await unreadCount(user.organization.id);
  return (
    <AppShell
      unreadCount={unread}
      orgName={user.organization.name}
      userName={user.name}
      nav={[
        { href: "/farm", label: "Home" },
        { href: "/farm/requests", label: "Requests" },
        { href: "/farm/stock", label: "Stock" },
        { href: "/farm/setup", label: "Farm & varieties" },
      ]}
    >
      {children}
    </AppShell>
  );
}
