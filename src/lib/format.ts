const TZ = "Africa/Nairobi";

export function formatStems(n: number) {
  return n.toLocaleString("en-KE");
}

/** YYYY-MM-DD for a moment, in Kenyan time. */
export function nairobiDateISO(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** "Today 07:42", "Yesterday 18:05" or "12 Sep 07:42", in Kenyan time. */
export function formatWhen(date: Date, now = new Date()) {
  const time = date.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  if (nairobiDateISO(date) === nairobiDateISO(now)) return `Today ${time}`;
  if (nairobiDateISO(date) === nairobiDateISO(new Date(now.getTime() - 86_400_000))) return `Yesterday ${time}`;
  const d = date.toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
  return `${d} ${time}`;
}

/** Delivery dates are calendar dates stored at UTC midnight: "Thu 25 Sep". */
export function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
}
