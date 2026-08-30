"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { isTerminal } from "../../_data/order";
import { getAllOrders } from "../../_data/orders";
import { useLiveOrder } from "../../_data/useLiveOrder";
import { useAuthStore } from "../../_store/useAuthStore";
import { useOrderHydrated, useOrderStore } from "../../_store/useOrderStore";
import { useProfileHydrated, useProfileStore } from "../../_store/useProfileStore";
import { useWishlistCount } from "../../_store/useWishlistStore";
import type { IconName } from "../../_data/productDetails";
import Icon from "../Pdp/PdpIcons";

/*
  Account section-এর shell — বাঁয়ে tab sidebar, ডানে active panel।
  প্রতি tab আলাদা route, তাই deep-link + back button কাজ করে।

  Mobile-এ sidebar horizontal scroll pill-bar হয়ে যায় (রেফারেন্স স্পেক)।
*/

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
}

export default function AccountShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const customer = useAuthStore((s) => s.customer);
  const logout = useAuthStore((s) => s.logout);

  const liveHydrated = useOrderHydrated();
  const live = useOrderStore((s) => s.last);
  const wishCount = useWishlistCount();
  const profHydrated = useProfileHydrated();
  const avatar = useProfileStore((s) => s.avatar);

  const orders = getAllOrders(useLiveOrder(liveHydrated ? live : null)); // DEC-SAL-016
  const activeCount = orders.filter((o) => !isTerminal(o.status)).length;

  const items: NavItem[] = [
    { href: "/account", label: "Overview", icon: "store" },
    { href: "/account/orders", label: "My Orders", icon: "gift", badge: activeCount },
    { href: "/account/wishlist", label: "Wishlist", icon: "heart", badge: wishCount },
    { href: "/account/addresses", label: "Addresses", icon: "pin" },
    { href: "/account/profile", label: "Profile", icon: "user" },
  ];

  const isActive = (href: string) =>
    href === "/account" ? pathname === "/account" : pathname.startsWith(href);

  const initials = customer
    ? customer.name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";

  function onLogout() {
    logout();
    router.replace("/");
  }

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-5 lg:gap-7 py-6 sm:py-9">
      {/* ─────────── desktop sidebar ─────────── */}
      <aside className="hidden lg:flex flex-col gap-4 self-start sticky top-[110px]">
        <div className="bg-white border-[1.5px] border-lavender-deep rounded-[22px] p-5">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-full overflow-hidden bg-orchid-soft text-orchid grid place-items-center font-display text-[17px] font-semibold shrink-0">
              {profHydrated && avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </span>
            <div className="min-w-0">
              <span className="block text-[14px] font-semibold text-purple truncate">
                {customer?.name}
              </span>
              <span className="block text-[11.5px] text-body-soft truncate">
                {customer?.phone} · verified
              </span>
            </div>
          </div>

          <nav className="mt-5 space-y-1">
            {items.map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`flex items-center gap-3 rounded-[13px] px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors ${
                    active
                      ? "bg-purple text-white"
                      : "text-body-soft hover:bg-lavender hover:text-purple"
                  }`}
                >
                  <Icon name={it.icon} className="w-[17px] h-[17px]" />
                  <span className="flex-1">{it.label}</span>
                  {it.badge ? (
                    <span
                      className={`min-w-[20px] h-5 rounded-full text-[11px] font-semibold grid place-items-center px-1.5 ${
                        active ? "bg-white/25 text-white" : "bg-orchid-soft text-orchid"
                      }`}
                    >
                      {it.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-2.5 rounded-[16px] bg-white border-[1.5px] border-lavender-deep px-4 py-3 text-[13.5px] font-semibold text-body-soft hover:text-[#B42318] hover:border-[#F5D5D2] transition-colors"
        >
          <Icon name="lock" className="w-[16px] h-[16px]" />
          Sign out
        </button>
      </aside>

      {/* ─────────── mobile pill bar ─────────── */}
      <div className="lg:hidden -mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-2 w-max">
          {items.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-semibold border-[1.5px] whitespace-nowrap transition-colors ${
                  active
                    ? "bg-purple text-white border-purple"
                    : "bg-white text-body-soft border-lavender-deep"
                }`}
              >
                <Icon name={it.icon} className="w-[15px] h-[15px]" />
                {it.label}
                {it.badge ? (
                  <span
                    className={
                      active ? "text-white/70" : "text-orchid"
                    }
                  >
                    {it.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-semibold border-[1.5px] bg-white text-body-soft border-lavender-deep whitespace-nowrap"
          >
            <Icon name="lock" className="w-[15px] h-[15px]" />
            Sign out
          </button>
        </div>
      </div>

      {/* ─────────── active panel ─────────── */}
      <main className="min-w-0">{children}</main>
    </div>
  );
}
