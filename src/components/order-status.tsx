import type { OrderStatus } from "@prisma/client";

const styles: Record<OrderStatus, { label: string; className: string }> = {
  NEW: { label: "New", className: "bg-canvas text-muted border border-line" },
  AWAITING_CONFIRMATION: { label: "Awaiting farms", className: "bg-warn-50 text-warn" },
  CONFIRMED: { label: "Confirmed", className: "bg-brand-50 text-brand-800" },
  FULFILLED: { label: "Fulfilled", className: "bg-brand-700 text-white" },
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const s = styles[status];
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold ${s.className}`}>
      {s.label}
    </span>
  );
}
