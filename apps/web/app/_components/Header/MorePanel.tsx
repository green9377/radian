"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getShopFooter } from "../../_data/shop";

interface Props {
  open: boolean;
  onClose: () => void;
}

const FALLBACK_GROUPS = [
  {
    title: "Account & Orders",
    links: [
      { label: "My Orders", href: "/account/orders" },
      { label: "My Addresses", href: "/account/addresses" },
      { label: "My Profile", href: "/account/profile" },
      { label: "Wishlist", href: "/wishlist" },
    ],
  },
  {
    title: "Company & Support",
    links: [
      { label: "About Radian", href: "/about" },
      { label: "Visit Radian Flower & Gift Shop", href: "/#store" },
      { label: "FAQs", href: "/faq" },
      { label: "Delivery Info", href: "/delivery-info" },
      { label: "Reviews", href: "/#reviews" },
      { label: "Blog / Journal", href: "/journal" },
      { label: "Contact Us", href: "/contact" },
    ],
  },
  {
    title: "Policies",
    links: [
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Refund Policy", href: "/refund-policy" },
    ],
  },
];

export default function MorePanel({ open, onClose }: Props) {
  const [groups, setGroups] = useState(FALLBACK_GROUPS);

  /*
    LIVE since 31 Jul 2026 — the same table the footer reads, so a link
    corrected in one place is corrected in both.

    Fetched when the panel first OPENS, not on mount: it is behind a button most
    visitors never press, and every page would otherwise pay for it.
  */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    getShopFooter().then((d) => {
      if (!alive || !d?.moreGroups?.length) return;
      setGroups(d.moreGroups.map((g) => ({ title: g.title, links: g.links })));
    });
    return () => { alive = false; };
  }, [open]);

  /*
    While the panel is open: lock body scroll (mouse wheel must not
    scroll the page behind) and close on Escape key.
  */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Veil */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[105] bg-[rgba(50,0,73,0.45)] transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[340px] max-w-[90vw] bg-white z-[110] shadow-[-14px_0_50px_rgba(71,0,102,0.18)] overflow-y-auto px-6 pb-10 pt-7 transition-transform duration-[350ms] ease-[cubic-bezier(0.2,0.9,0.3,1)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="More options"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-lavender flex items-center justify-center text-purple mb-5"
          aria-label="Close menu"
        >
          <svg className="w-[18px] h-[18px] stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
            <path d="M5 5l14 14M19 5 5 19" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Groups */}
        {groups.map((group) => (
          <div key={group.title} className="mb-6">
            <h4 className="text-[12px] tracking-[0.16em] uppercase text-orchid font-semibold mb-2.5">
              {group.title}
            </h4>
            {group.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className="block py-2.5 text-[14.5px] text-body border-b border-lavender hover:text-orchid transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
