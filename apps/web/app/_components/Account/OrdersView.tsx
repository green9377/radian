"use client";

import { useState } from "react";

import { getAllOrders } from "../../_data/orders";
import { isTerminal, type Order } from "../../_data/order";
import { useLiveOrder } from "../../_data/useLiveOrder";
import { useOrderHydrated, useOrderStore } from "../../_store/useOrderStore";
import OrderCard from "./OrderCard";

/*
  /account/orders — সব order, status filter সহ।
  order = seed ∪ live (getAllOrders)।
*/

type Filter = "all" | "active" | "delivered" | "cancelled";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

function match(o: Order, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "active") return !isTerminal(o.status);
  return o.status === f;
}

export default function OrdersView() {
  const liveHydrated = useOrderHydrated();
  const live = useOrderStore((s) => s.last);
  const [filter, setFilter] = useState<Filter>("all");

  /*  DEC-SAL-016 — the customer's own order is corrected against the shop
      before the list is built, so the "Active / Delivered" chips count what
      is true rather than what this browser last remembered.  */
  const orders = getAllOrders(useLiveOrder(liveHydrated ? live : null));
  const shown = orders.filter((o) => match(o, filter));

  return (
    <div>
      <h1 className="font-display text-[27px] sm:text-[32px] text-purple font-semibold">
        My Orders
      </h1>

      {/* filter chips */}
      <div className="flex items-center gap-2 flex-wrap mt-5">
        {FILTERS.map((f) => {
          const count = orders.filter((o) => match(o, f.key)).length;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold border-[1.5px] transition-colors ${
                active
                  ? "bg-purple text-white border-purple"
                  : "bg-white text-body-soft border-lavender-deep hover:border-orchid-mid"
              }`}
            >
              {f.label}
              <span
                className={active ? "text-white/70" : "text-body-soft/70"}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* list */}
      <div className="mt-6 space-y-3">
        {shown.length > 0 ? (
          shown.map((o) => <OrderCard key={o.id} order={o} />)
        ) : (
          <div className="bg-white border-[1.5px] border-dashed border-lavender-deep rounded-[22px] p-10 text-center">
            <p className="text-[14px] text-body-soft">
              No {filter === "all" ? "" : filter} orders to show.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
