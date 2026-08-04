import { ORDER_STATUS_META, type OrderStatus } from "../../_data/order";

/* একটাই status চিপ — সব জায়গায় একই রং/label (order.ts §status meta)। */
export default function OrderStatusChip({ status }: { status: OrderStatus }) {
  /* legacy/অজানা status এলেও crash নয় — placed-এ fallback */
  const m = ORDER_STATUS_META[status] ?? ORDER_STATUS_META.placed;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${m.chip}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}
