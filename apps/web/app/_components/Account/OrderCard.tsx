import Link from "next/link";

import { formatTaka } from "../../_data/products";
import { isTerminal, type Order } from "../../_data/order";
import Icon from "../Pdp/PdpIcons";
import OrderStatusChip from "./OrderStatusChip";
import ReorderButton from "./ReorderButton";
import TileImage from "../ui/TileImage";

/* Order history + dashboard-এ শেয়ার্ড order card। */

function dateLabel(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function OrderCard({ order }: { order: Order }) {
  const itemCount = order.lines.reduce((n, l) => n + l.qty, 0);
  const names = order.lines.map((l) => l.name).join(", ");
  const live = !isTerminal(order.status);

  return (
    <div className="bg-white border-[1.5px] border-lavender-deep rounded-[22px] p-4 sm:p-5 hover:border-orchid-mid transition-colors">
      <div className="flex items-start gap-4">
        {/* thumbnails */}
        <div className="flex -space-x-3 shrink-0">
          {order.lines.slice(0, 3).map((l, i) => (
            <span key={l.slug + i} className="relative" style={{ zIndex: 3 - i }}>
              <TileImage src={l.bg} alt="" variant="thumb" className="w-12 h-12 rounded-[14px] border-2 border-white shadow-soft" />
            </span>
          ))}
        </div>

        {/* body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-semibold text-purple">
              {order.id}
            </span>
            <OrderStatusChip status={order.status} />
          </div>
          <p className="text-[12px] text-body-soft mt-0.5">
            {dateLabel(order.placedAt)} · {itemCount} item
            {itemCount > 1 ? "s" : ""}
          </p>
          <p className="text-[12.5px] text-body mt-1.5 line-clamp-1">{names}</p>
        </div>

        {/* total */}
        <div className="text-right shrink-0">
          <span className="block font-display text-[17px] text-purple font-semibold">
            {formatTaka(order.totalPaisa)}
          </span>
        </div>
      </div>

      {/* actions */}
      <div className="flex items-center gap-2 mt-4 pt-3.5 border-t border-lavender">
        <Link
          href={`/account/orders/${order.id}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-purple hover:text-orchid transition-colors"
        >
          View details
          <Icon name="chev" className="w-3.5 h-3.5 -rotate-90" />
        </Link>

        {live ? (
          <Link
            href={`/track?id=${order.id}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-orchid-soft text-orchid px-3.5 py-1.5 text-[12.5px] font-semibold hover:bg-orchid hover:text-white transition-colors"
          >
            <Icon name="truck" className="w-[15px] h-[15px]" />
            Track
          </Link>
        ) : (
          <span className="ml-auto">
            <ReorderButton order={order} />
          </span>
        )}
      </div>
    </div>
  );
}
