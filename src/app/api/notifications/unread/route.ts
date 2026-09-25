import { getCurrentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";

/** Polled by the header badge. Cheap count, no caching. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.organizationId) return Response.json({ count: 0 });
  return Response.json({ count: await unreadCount(user.organizationId) });
}
