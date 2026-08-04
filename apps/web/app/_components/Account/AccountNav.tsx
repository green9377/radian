"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuthStore } from "../../_store/useAuthStore";
import Icon from "../Pdp/PdpIcons";
import type { IconName } from "../../_data/productDetails";

/*
  Account section-এর tab nav — Overview / Orders + Log out।
  Dashboard আর order pages-এ শেয়ার্ড।
*/

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/account", label: "Overview", icon: "user" },
  { href: "/account/orders", label: "My Orders", icon: "gift" },
  { href: "/wishlist", label: "Wishlist", icon: "heart" },
];

export default function AccountNav() {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  function onLogout() {
    logout();
    router.replace("/");
  }

  return (
    <nav className="flex items-center gap-1.5 flex-wrap">
      {TABS.map((t) => {
        const active =
          t.href === "/account"
            ? pathname === "/account"
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold border-[1.5px] transition-colors ${
              active
                ? "bg-purple text-white border-purple"
                : "bg-white text-body-soft border-lavender-deep hover:text-purple hover:border-orchid-mid"
            }`}
          >
            <Icon name={t.icon} className="w-[15px] h-[15px]" />
            {t.label}
          </Link>
        );
      })}

      <button
        type="button"
        onClick={onLogout}
        className="ml-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold border-[1.5px] bg-white text-body-soft border-lavender-deep hover:text-[#B42318] hover:border-[#F5D5D2] transition-colors"
      >
        <Icon name="lock" className="w-[15px] h-[15px]" />
        Log out
      </button>
    </nav>
  );
}
