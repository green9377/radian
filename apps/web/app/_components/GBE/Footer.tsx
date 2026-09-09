"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getShopFooter, type ShopFooter } from "../../_data/shop";
import { hasFooter } from "../../_data/quietPages";
import ShopLogo from "../ui/ShopLogo";

/*
  GBE part 3 of 3 — Footer. Appears on every page (auth pages: footer only).

  LIVE since 31 Jul 2026 — columns, social profiles, payment badges and both
  lines of copy come from the admin. The footer and the "More" panel read the
  same table, so a link corrected in one is corrected in both.

  ⚠️ A social profile with no URL never reaches here — the API drops it. The
  seeded rows are deliberately blank because the shop's profiles are not live,
  and an icon that goes nowhere reads as a broken site.
*/

const COLS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Shop",
    links: [
      { label: "Fresh Flowers", href: "/fresh-flowers" },
      { label: "Cakes & Combos", href: "/cakes" },
      { label: "Occasions", href: "/occasions" },
      { label: "Budget Gifts", href: "/collections/under-1000" },
      { label: "Corporate Gifting", href: "/occasions/corporate" },
    ],
  },
  {
    heading: "Help",
    links: [
      { label: "Delivery Areas", href: "/delivery-info" },
      { label: "Track My Order", href: "/track" },
      { label: "FAQs", href: "/faq" },
      { label: "Returns & Refunds", href: "/refund-policy" },
      { label: "Contact Us", href: "/contact" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About Radian", href: "/about" },
      { label: "Visit Radian Flower & Gift Shop", href: "/#store" },
      { label: "Journal", href: "/journal" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
];

const PAYMENTS = ["bKash", "Nagad", "Rocket", "VISA", "Mastercard", "COD"];

function SocIcon({ name }: { name: string }) {
  const cls = "w-4 h-4 fill-current";
  // brand marks only — these are recognised by shape, so they are not part of
  // the general icon set and cannot be uploaded
  if (name === "tiktok")
    return <svg className={cls} viewBox="0 0 24 24"><path d="M16.5 3c.3 2 1.5 3.4 3.5 3.6v2.5c-1.3.1-2.5-.3-3.6-1v5.6c0 3.4-2.6 5.8-5.7 5.3-2.6-.4-4.4-2.6-4.4-5.2 0-3 2.6-5.4 5.6-5v2.7c-.4-.1-.9-.2-1.3-.1-1.2.2-2 1.2-1.9 2.4.1 1.2 1.1 2.1 2.3 2 1.2 0 2.2-1 2.2-2.3V3h3.3z" /></svg>;
  if (name === "youtube")
    return <svg className={cls} viewBox="0 0 24 24"><path d="M21.6 7.2c-.2-.9-.9-1.6-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4c-.9.2-1.6.9-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8c.2.9.9 1.6 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4c.9-.2 1.6-.9 1.8-1.8.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3-5.2 3z" /></svg>;
  if (name === "fb" || name === "facebook")
    return (
      <svg className={cls} viewBox="0 0 24 24">
        <path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.2 0-1-.1-1.9-.1-1.9 0-3.3 1.2-3.3 3.4V11H8.5v3h2.7v7h2.3z" />
      </svg>
    );
  if (name === "ig" || name === "instagram")
    return (
      <svg className="w-4 h-4 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    );
  if (name === "wa" || name === "whatsapp")
    return (
      <svg className="w-4 h-4 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
        <path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 8.8c.5 2.6 2.5 4.9 5.2 5.9l1.3-1.3-2-1-.9.6a6.4 6.4 0 0 1-2.2-2.4l.6-.8-1-2h-1z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  // messenger
  return (
    <svg className={cls} viewBox="0 0 24 24">
      <path d="M12 3C7 3 3 6.7 3 11.3c0 2.6 1.3 4.9 3.3 6.4V21l3-1.7c.9.2 1.8.4 2.7.4 5 0 9-3.7 9-8.3S17 3 12 3zm1 11-2.3-2.4L6.5 14l4.6-4.9 2.3 2.4 4.1-2.4L13 14z" />
    </svg>
  );
}

export default function Footer() {
  const pathname = usePathname();
  const [data, setData] = useState<ShopFooter | null>(null);

  useEffect(() => {
    let alive = true;
    getShopFooter().then((d) => { if (alive && d) setData(d); });
    return () => { alive = false; };
  }, []);

  /*  ⚠️ AN ALLOWLIST NOW, NOT A SKIP LIST (owner, 9 Sep 2026): the footer is
      drawn on the home page, categories, products and the blog, and nowhere
      else. The old list of pages to skip meant every new page was born with a
      full site menu under a customer in the middle of paying. After every
      hook, as before.  */
  if (!hasFooter(pathname)) return null;

  const cols = data?.footerGroups?.length
    ? data.footerGroups.map((g) => ({ heading: g.title, links: g.links }))
    : COLS;
  const socials = data?.socials ?? [];
  const badges = data?.badges ?? PAYMENTS.map((label) => ({ label, imageUrl: null as string | null }));

  return (
    <footer className="bg-purple-deep text-white/80">
      <div className="max-w-[var(--page-w)] mx-auto px-6">
        {/* Main columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] gap-8 lg:gap-10 pt-[52px] pb-[38px]">
          {/* Brand */}
          <div>
            <ShopLogo tone="light" size={32} />
            <p className="text-[13.5px] font-light text-white/60 mt-[14px] mb-5 max-w-[34ch]">
              {data?.tagline ??
                "Dhaka's premium flower and gift studio. Hand-arranged, honestly priced, delivered while the moment still matters."}
            </p>
            {/* real links only — see the note at the top */}
            {socials.length > 0 && (
              <div className="flex gap-[10px]">
                {socials.map((so) => (
                  <a
                    key={so.url}
                    href={so.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={so.label}
                    title={so.label}
                    className="w-10 h-10 rounded-full border border-white/25 grid place-items-center text-white transition-all duration-200 hover:bg-white hover:text-purple hover:border-white"
                  >
                    <SocIcon name={so.icon} />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Link columns */}
          {cols.map((col) => (
            <div key={col.heading}>
              <h4 className="text-[12.5px] tracking-[0.18em] uppercase text-orchid-mid font-semibold mb-[15px] whitespace-nowrap">
                {col.heading}
              </h4>
              {col.links.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="block text-[14px] font-light text-white/70 py-[5px] transition-colors duration-200 hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 py-[22px] flex items-end justify-between gap-5 flex-wrap">
          <div>
            <div className="text-[11.5px] tracking-[0.16em] uppercase text-white/55 font-semibold mb-[9px] whitespace-nowrap">
              We accept
            </div>
            <div className="flex gap-[9px] flex-wrap">
              {badges.map((p) => (
                <span
                  key={p.label}
                  className="inline-flex items-center gap-[7px] bg-white/10 border border-white/20 text-white text-[12px] font-semibold rounded-[10px] px-[15px] py-2 tracking-[0.03em] whitespace-nowrap"
                >
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.label} className="h-[18px] w-auto object-contain" />
                  ) : (
                    <>
                      <span className="w-[7px] h-[7px] bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block" />
                      {p.label}
                    </>
                  )}
                </span>
              ))}
            </div>
          </div>
          <div className="text-[12.5px] text-white/50 whitespace-nowrap">
            {/* the year is generated, never stored — a footer still saying 2026
                in 2028 is the classic sign of an abandoned website */}
            © {new Date().getFullYear()}{" "}
            {data?.legal ?? "Radian Flower & Gift Shop. Made with love in Dhaka."}
          </div>
        </div>
      </div>
    </footer>
  );
}
