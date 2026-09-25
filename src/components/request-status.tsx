import type { RequestStatus } from "@prisma/client";

const styles: Record<RequestStatus, { label: string; className: string }> = {
  PENDING: { label: "Waiting", className: "bg-warn-50 text-warn" },
  CONFIRMED: { label: "Confirmed", className: "bg-brand-50 text-brand-800" },
  PARTIAL: { label: "Part confirmed", className: "bg-brand-50 text-brand-800" },
  REJECTED: { label: "Rejected", className: "bg-danger-50 text-danger" },
  EXPIRED: { label: "No reply", className: "bg-canvas text-muted border border-line" },
};

export function RequestStatusPill({ status }: { status: RequestStatus }) {
  const s = styles[status];
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold ${s.className}`}>
      {s.label}
    </span>
  );
}
