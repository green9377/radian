"use client";

import Link from "next/link";

import { getAllOrders } from "../../_data/orders";
import { isTerminal, type Order, type OrderStatus } from "../../_data/order";
import { useAuthStore } from "../../_store/useAuthStore";
import { useOrderHydrated, useOrderStore } from "../../_store/useOrderStore";
import type { IconName } from "../../_data/productDetails";
import Icon from "../Pdp/PdpIcons";
import OrderCard from "./OrderCard";
import ReorderButton from "./ReorderButton";
import RemindersSection from "./RemindersSection";

/*
  /account — Overview tab (AccountShell-এর ভিতরে)।
  greeting → live-order hero (নয়তো welcome) → quick actions → recent orders।
  Addresses/Wishlist/Profile আলাদা tab-এ।
*/

const LIFE: { key: OrderStatus; label: string }[] = [
  { key: "placed", label: "Received" },
  { key: "confirmed", label: "Confirmed" },
  { key: "preparing", label: "Preparing" },
  { key: "out_for_delivery", label: "Out" },
  { key: "delivered", label: "Delivered" },
];

export default function DashboardView() {
  const customer = useAuthStore((s) => s.customer)!;
  const liveHydrated = useOrderHydrated();
  const live = useOrderStore((s) => s.last);

  const orders = getAllOrders(liveHydrated ? live : null);
  const active = orders.find((o) => !isTerminal(o.status)) ?? null;
  const lastDelivered = orders.find((o) => o.status === "delivered") ?? null;
  const recent = orders.slice(0, 3);
  const deliveredCount = orders.filter((o) => o.status === "delivered").length;

  const firstName = customer.name.split(" ")[0];
  const since = new Date(customer.joinedAt).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      {/* greeting */}
      <div>
        <h1 className="font-display text-[27px] sm:text-[32px] text-purple font-semibold">
          Welcome back, {firstName}
        </h1>
        <p className="text-[13px] text-body-soft mt-1">
          Member since {since} · {deliveredCount} gift
          {deliveredCount === 1 ? "" : "s"} delivered
        </p>
      </div>

      {/* live-order hero / welcome */}
      <div className="mt-5">
        {active ? (
          <LiveOrderHero order={active} />
        ) : (
          <WelcomeCard order={lastDelivered} name={firstName} />
        )}
      </div>

      {/* quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <QuickAction href="/account/orders" icon="gift" label="All orders" />
        <QuickAction href="/account/wishlist" icon="heart" label="My wishlist" />
        <QuickAction href="/products" icon="sparkle" label="Send a gift" />
        <QuickAction
          href="/contact"
          icon="wa"
          label="WhatsApp us"
          tone="wa"
        />
      </div>

      {/* recent orders */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-[19px] text-purple font-semibold">
            Recent orders
          </h2>
          <Link
            href="/account/orders"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-orchid hover:text-purple transition-colors"
          >
            All orders
            <Icon name="chev" className="w-3.5 h-3.5 -rotate-90" />
          </Link>
        </div>
        <div className="space-y-3">
          {recent.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      </section>

      {/* occasion reminders */}
      <section className="mt-8">
        <RemindersSection />
      </section>
    </div>
  );
}

/* ─────────── live-order hero ─────────── */
function LiveOrderHero({ order }: { order: Order }) {
  const idx = Math.max(
    0,
    LIFE.findIndex((s) => s.key === order.status),
  );
  const pct = (idx / (LIFE.length - 1)) * 100;
  const title =
    order.isGift && order.recipient?.name
      ? `Gift for ${order.recipient.name}`
      : "Your order";

  return (
    <div className="rounded-[26px] bg-gradient-to-br from-purple to-purple-deep text-white p-6 sm:p-7 shadow-lift">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[12px] font-semibold">
          <span className="relative flex w-2.5 h-2.5">
            <span className="absolute inline-flex w-full h-full rounded-full bg-orchid-mid opacity-70 animate-ping" />
            <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-orchid-mid" />
          </span>
          Live ·{" "}
          {order.status === "out_for_delivery"
            ? "Out for delivery"
            : order.status === "preparing"
              ? "Being prepared"
              : "In progress"}
        </span>
        <span className="text-[12px] text-white/70 font-medium">{order.id}</span>
      </div>

      <h2 className="font-display text-[22px] sm:text-[25px] font-semibold mt-3">
        {title}
      </h2>
      <p className="text-[13px] text-white/80 mt-1">Arriving {order.etaDone.toLowerCase()}</p>

      {/* progress */}
      <div className="mt-5 h-1.5 rounded-full bg-white/20 overflow-hidden">
        <div
          className="h-full rounded-full bg-orchid-mid transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between mt-2">
        {LIFE.map((s, i) => (
          <span
            key={s.key}
            className={`text-[10px] font-medium ${
              i <= idx ? "text-white" : "text-white/45"
            }`}
          >
            {s.label}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2.5 mt-6">
        <Link
          href={`/track?id=${order.id}`}
          className="inline-flex items-center gap-2 h-[44px] px-5 rounded-[14px] bg-white text-purple font-semibold text-[13.5px] hover:bg-orchid-soft transition-colors"
        >
          <Icon name="clock" className="w-[17px] h-[17px]" />
          Track live
        </Link>
        <Link
          href={`/account/orders/${order.id}`}
          className="inline-flex items-center gap-2 h-[44px] px-5 rounded-[14px] border border-white/40 text-white font-semibold text-[13.5px] hover:bg-white/10 transition-colors"
        >
          View details
        </Link>
      </div>
    </div>
  );
}

/* ─────────── welcome (no active order) ─────────── */
function WelcomeCard({ order, name }: { order: Order | null; name: string }) {
  return (
    <div className="rounded-[26px] bg-lavender border-[1.5px] border-lavender-deep p-6 sm:p-7">
      <h2 className="font-display text-[21px] text-purple font-semibold">
        No gift on the way right now
      </h2>
      <p className="text-[13.5px] text-body mt-1.5">
        {order
          ? `Your last gift — ${order.lines[0]?.name} — was delivered ${order.etaDone.toLowerCase()}.`
          : `Ready when you are, ${name}. Send flowers in as little as 2 hours.`}
      </p>
      <div className="flex flex-wrap gap-2.5 mt-5">
        <Link
          href="/products"
          className="inline-flex items-center gap-2 h-[44px] px-5 rounded-[14px] bg-purple text-white font-semibold text-[13.5px] hover:bg-purple-deep transition-colors"
        >
          <Icon name="sparkle" className="w-[17px] h-[17px]" />
          Browse best sellers
        </Link>
        {order && <ReorderButton order={order} variant="solid" />}
        {order && (
          <Link
            href={`/account/orders/${order.id}`}
            className="inline-flex items-center gap-2 h-[44px] px-5 rounded-[14px] bg-white border-[1.5px] border-lavender-deep text-purple font-semibold text-[13.5px] hover:border-orchid-mid transition-colors"
          >
            View last order
          </Link>
        )}
      </div>
    </div>
  );
}

/* ─────────── quick action tile ─────────── */
function QuickAction({
  href,
  icon,
  label,
  tone,
}: {
  href: string;
  icon: IconName;
  label: string;
  tone?: "wa";
}) {
  return (
    <Link
      href={href}
      className="bg-white border-[1.5px] border-lavender-deep rounded-[18px] p-4 hover:border-orchid-mid transition-colors flex flex-col gap-2.5"
    >
      <span
        className={`w-9 h-9 rounded-full grid place-items-center ${
          tone === "wa"
            ? "bg-[#E8F9EE] text-[#1DA851]"
            : "bg-orchid-soft text-orchid"
        }`}
      >
        <Icon name={icon} className="w-[17px] h-[17px]" />
      </span>
      <span className="text-[12.5px] font-semibold text-purple">{label}</span>
    </Link>
  );
}
