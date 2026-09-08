"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { accountLogout, getMe, type AccountCustomer } from "../../_data/accountApi";
import { formatTaka } from "../../_data/products";
import { useAuthStore, useToken } from "../../_store/useAuthStore";
import type { IconName } from "../../_data/productDetails";
import Icon from "../Pdp/PdpIcons";

/*
  The account's shell — the purple banner, the nav down the left, one panel on
  the right (owner, 8 Sep 2026, after FlowerAura's My Account).

  ⚠️ THE BANNER IS THE SERVER'S ANSWER, not the browser's memory. `/me` is
  asked on every mount: the name, the phone, the joining month, how many
  orders and how much credit. What the store keeps is only enough to draw
  something before that answer lands.
*/

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

const NAV: NavItem[] = [
  { href: "/account", label: "My Profile", icon: "user" },
  { href: "/account/orders", label: "My Orders", icon: "gift" },
  { href: "/account/addresses", label: "Address Book", icon: "pin" },
  { href: "/account/wishlist", label: "Wishlist", icon: "heart" },
  { href: "/account/reminders", label: "Reminders", icon: "clock" },
  { href: "/account/credit", label: "Store Credit", icon: "tag" },
  { href: "/account/reviews", label: "My Reviews", icon: "star" },
  { href: "/account/settings", label: "Settings", icon: "shield" },
];

export default function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const token = useToken();
  const stored = useAuthStore((s) => s.customer);
  const setCustomer = useAuthStore((s) => s.setCustomer);
  const signOut = useAuthStore((s) => s.signOut);

  const [me, setMe] = useState<AccountCustomer | null>(stored);

  useEffect(() => {
    if (!token) return;
    let stale = false;
    getMe(token)
      .then((c) => {
        if (stale) return;
        setMe(c);
        setCustomer(c);
      })
      .catch(() => {
        /*  A 401 has already signed us out through the shared handler; any
            other failure leaves the stored name on screen rather than an
            empty banner.  */
      });
    return () => {
      stale = true;
    };
  }, [token, setCustomer]);

  const isActive = (href: string) =>
    href === "/account" ? pathname === "/account" : pathname.startsWith(href);

  const initials = (me?.name ?? "")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const since = me?.joinedAt
    ? new Date(me.joinedAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : "";

  async function onLogout() {
    if (token) await accountLogout(token).catch(() => undefined);
    signOut();
    router.replace("/");
  }

  return (
    <div className="pt-4">
      {/* ── the banner ── */}
      <div className="rounded-[26px] px-6 py-6 flex items-center gap-5 flex-wrap bg-[linear-gradient(140deg,#4D0170_0%,#320049_60%,#3D0A5C_100%)] shadow-lift">
        <span className="w-[76px] h-[76px] rounded-full grid place-items-center shrink-0 font-display text-[27px] font-bold text-white bg-[linear-gradient(150deg,#E8C9CE,#B76E79)] shadow-[0_6px_18px_rgba(0,0,0,0.28)] overflow-hidden">
          {me?.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={me.imageUrl} alt={me.name} className="w-full h-full object-cover" />
          ) : (
            initials || "·"
          )}
        </span>

        <span className="min-w-0">
          <b className="block font-display text-[24px] text-white font-semibold">
            {me?.name ?? "Your account"}
          </b>
          <span className="block text-[12.5px] text-[#DCC4EA] mt-1.5">
            {me?.phone}
            {me?.email ? ` · ${me.email}` : ""}
            {since ? (
              <>
                {" · "}with Radian since <b className="text-white">{since}</b>
              </>
            ) : null}
          </span>
        </span>

        <span className="ml-auto flex gap-2.5 flex-wrap">
          <span className="rounded-[16px] px-4 py-2.5 min-w-[120px] bg-white/10 border border-white/20">
            <u className="block no-underline text-[11px] text-[#DCC4EA] tracking-[0.04em]">ORDERS</u>
            <b className="block font-display text-[19px] text-white mt-0.5">{me?.orderCount ?? 0}</b>
          </span>
          <span className="rounded-[16px] px-4 py-2.5 min-w-[120px] bg-white/10 border border-white/20">
            <u className="block no-underline text-[11px] text-[#DCC4EA] tracking-[0.04em]">
              STORE CREDIT
            </u>
            <b className="block font-display text-[19px] text-white mt-0.5">
              {formatTaka(me?.creditPaisa ?? 0)}
            </b>
          </span>
        </span>
      </div>

      {/* ── nav + panel ── */}
      <div className="grid lg:grid-cols-[250px_1fr] gap-5 items-start mt-5">
        <nav className="bg-white border-[1.5px] border-lavender-deep rounded-[22px] p-2.5 shadow-soft lg:sticky lg:top-4 flex lg:flex-col gap-1.5 overflow-x-auto">
          {NAV.map((n) => {
            const on = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[14px] font-bold text-[13.5px] shrink-0 transition-colors ${
                  on ? "bg-purple text-white" : "text-body hover:bg-lavender"
                }`}
              >
                <span
                  className={`w-[30px] h-[30px] rounded-[9px] grid place-items-center shrink-0 ${
                    on ? "bg-white/15" : "bg-lavender"
                  }`}
                >
                  <Icon name={n.icon} className="w-4 h-4" />
                </span>
                {n.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-[14px] font-bold text-[13.5px] text-[#C4172B] hover:bg-[#FDECEE] shrink-0"
          >
            <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center bg-[#FDECEE] shrink-0">
              <Icon name="lock" className="w-4 h-4" />
            </span>
            Log out
          </button>
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

/* ─────────── the panel every account screen is drawn in ───────────
   The three the owner asked to carry the brand — Profile, Orders, Address
   Book — wear the deep purple head; the rest use the same component, because
   one shape is what makes eight screens look like one account. */

export function Panel({
  icon,
  title,
  sub,
  action,
  children,
}: {
  icon: IconName;
  title: string;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border-[1.5px] border-lavender-deep rounded-[22px] shadow-soft overflow-hidden">
      <header className="px-6 py-5 flex items-center gap-3.5 flex-wrap bg-[linear-gradient(150deg,#4D0170,#320049)]">
        <span className="w-11 h-11 rounded-[13px] grid place-items-center bg-white/15 shrink-0">
          <Icon name={icon} className="w-5 h-5 text-white" />
        </span>
        <span className="min-w-0">
          <h1 className="font-display text-[21px] text-white font-semibold m-0">{title}</h1>
          {sub && <p className="text-[12.5px] text-[#DCC4EA] mt-0.5 mb-0">{sub}</p>}
        </span>
        {action && <span className="ml-auto">{action}</span>}
      </header>
      <div className="px-5 sm:px-6 py-6">{children}</div>
    </section>
  );
}

/** the one empty state — a sentence and a way out, never a blank panel */
export function Empty({
  title,
  sub,
  href,
  cta,
}: {
  title: string;
  sub: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="text-center py-10 px-5 border-[1.5px] border-dashed border-lavender-deep rounded-[18px]">
      <b className="block font-display text-[17px] text-purple mb-1.5">{title}</b>
      <span className="block text-[12.5px] text-body-soft mb-4">{sub}</span>
      {href && cta && (
        <Link
          href={href}
          className="inline-block bg-purple text-white rounded-[13px] px-6 py-3 font-bold text-[13.5px]"
        >
          {cta}
        </Link>
      )}
    </div>
  );
}

/** while the server answers — never a flash of "you have nothing" */
export function Loading() {
  return (
    <div className="py-10 text-center text-[13px] text-body-soft">Loading…</div>
  );
}
