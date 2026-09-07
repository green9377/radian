"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getShopCard } from "../../_data/shop";
import ShopLogo from "../ui/ShopLogo";
import Icon from "../Pdp/PdpIcons";

/*
  The header on /checkout only (owner, 7 Sep 2026, after FlowerAura): the
  logo, one trust line and the shop's phone — no search, no menu, no
  announcement. A shopper who has reached checkout has nothing left to
  browse for, and every extra door here is a way out.

  The phone is the shop card's own number (Setup → Company), the same one the
  announcement bar and the footer print. No number, no link.
*/
export default function CheckoutHeader() {
  const [phone, setPhone] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getShopCard().then((c) => {
      if (alive && c?.phone) setPhone(c.phone);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-white/94 backdrop-blur-[14px] border-b border-lavender-deep">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 h-[64px] flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center shrink-0" aria-label="Back to the shop">
          <ShopLogo tone="dark" size={22} />
        </Link>

        <div className="flex items-center gap-5 sm:gap-8 text-[12.5px] sm:text-[13px]">
          <span className="inline-flex items-center gap-2 text-purple font-semibold">
            <span className="w-8 h-8 rounded-full bg-[#E8F9EE] text-[#0E7A3D] grid place-items-center shrink-0">
              <Icon name="lock" className="w-4 h-4" />
            </span>
            <span className="hidden sm:inline">Secure checkout</span>
          </span>
          {phone && (
            <a
              href={`tel:${phone.replace(/[^+\d]/g, "")}`}
              className="inline-flex items-center gap-2 text-purple whitespace-nowrap"
            >
              <span className="w-8 h-8 rounded-full bg-lavender text-purple grid place-items-center shrink-0">
                <Icon name="phone" className="w-4 h-4" />
              </span>
              <span>
                <span className="hidden sm:inline font-light">Need help? </span>
                <b className="font-semibold">{phone}</b>
              </span>
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
