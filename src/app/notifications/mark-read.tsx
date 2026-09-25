"use client";

import { useEffect } from "react";
import { markNotificationsRead } from "./actions";

/** Opening the list marks everything read. */
export function MarkRead({ unread }: { unread: number }) {
  useEffect(() => {
    if (unread > 0) markNotificationsRead();
  }, [unread]);
  return null;
}
