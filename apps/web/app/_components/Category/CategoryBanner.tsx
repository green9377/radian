"use client";

import Link from "next/link";
import type { Zone } from "../../_store/useZoneStore";
import type { CategoryConfig } from "../../_data/categories";

/*
  Category banner — the homepage hero's composition (owner, 5 Sep 2026):
  breadcrumb and the words on the left (the eyebrow is the parent category
  or the shop's own line, the H1, the paragraph, the count line, and the
  trust badges as the proof row), the category's picture on the right as a
  plain image — no arch, no frame — on the same soft lavender-to-mauve
  ground. Everything is the admin's: Storefront → Category pages → Top
  banner (heading, paragraph, picture) and Trust strip (the badges).

  Not viewport-tall like the homepage: a category page is for its products,
  so the banner is a band of about 420px and the grid follows.
*/

export default function CategoryBanner({
  config,
  zone,
  shopName,
}: {
  config: CategoryConfig;
  zone: Zone | null;
  /** the shop's own name (Company settings) — the eyebrow on a root category */
  shopName: string;
}) {
  const zoneLabel = zone === "bangladesh" ? "All Bangladesh" : "Inside Dhaka";
  // the admin's trust badges, or nothing — a promise is never invented here
  const promises = config.promises;

  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "radial-gradient(55% 75% at 78% 28%, rgba(255,255,255,0.55), rgba(255,255,255,0) 70%), linear-gradient(90deg,#faf5fb 0%,#f8f1f8 38%,#f5e8ee 58%,#eedce4 80%,#e2ccd7 100%)",
      }}
    >
      {/* the picture: the right half, bottom-anchored, fitted — never cut, nothing drawn over it */}
      {config.bannerImageUrl && (
        <div className="hidden lg:block absolute inset-y-0 left-1/2 right-0 pointer-events-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={config.bannerImageUrl} alt={config.label} className="w-full h-full object-contain object-bottom" />
        </div>
      )}

      <div className="max-w-[var(--page-w)] mx-auto px-6 relative">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-[10px] pt-[18px] text-[13px] text-body-soft whitespace-nowrap"
        >
          <Link href="/" className="transition-colors hover:text-orchid">
            Home
          </Link>
          <span className="text-lavender-deep">›</span>
          {config.parent && (
            <>
              <Link href={`/${config.parent.slug}`} className="transition-colors hover:text-orchid">
                {config.parent.label}
              </Link>
              <span className="text-lavender-deep">›</span>
            </>
          )}
          <b className="text-purple font-medium">{config.label}</b>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,600px)_1fr] gap-6 items-center min-h-[300px] lg:min-h-[400px] py-8 lg:py-10">
          <div className="relative z-[1]">
            <div className="flex items-center gap-3 text-[12px] tracking-[0.22em] uppercase font-semibold text-orchid mb-4 whitespace-nowrap">
              <span>{config.parent ? config.parent.label : shopName}</span>
              <span className="w-9 h-px bg-orchid/70 shrink-0" />
            </div>
            <h1
              className="font-display font-medium text-purple leading-[1.06] tracking-[-0.02em] [overflow-wrap:anywhere]"
              style={{ fontSize: "clamp(32px, 3.6vw, 48px)" }}
            >
              {config.h1}
            </h1>
            {config.lead && (
              <p className="mt-4 max-w-[46ch] text-[16px] lg:text-[17px] font-light text-body leading-[1.55]">
                {config.lead}
              </p>
            )}
            <div className="mt-4 text-[13.5px] text-body-soft">
              <b className="text-purple font-semibold">
                {config.totalProducts} {config.totalProducts === 1 ? "product" : "products"}
              </b>
              {" · Delivering to "}
              <b className="text-purple font-semibold">{zoneLabel}</b>
            </div>
            {promises.length > 0 && (
            <div className="flex mt-5 flex-wrap gap-y-2">
              {promises.map((p, i) => (
                <div key={p} className={`flex items-center gap-2.5 pr-[18px] whitespace-nowrap ${i > 0 ? "border-l border-[#dccde8] pl-[18px]" : ""}`}>
                  <span className="w-2 h-2 rounded-[50%_50%_50%_0] rotate-[-45deg] block shrink-0 bg-orchid" />
                  <b className="text-[14px] font-semibold text-purple">{p}</b>
                </div>
              ))}
            </div>
            )}
          </div>

          {/* phones: the same picture above the words is too tall for a
              category band; it sits under the words instead, fitted */}
          {config.bannerImageUrl && (
            <div className="lg:hidden h-[220px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={config.bannerImageUrl} alt="" className="w-full h-full object-contain object-bottom" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
