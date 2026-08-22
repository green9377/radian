"use client";

import Link from "next/link";
import type { Zone } from "../../_store/useZoneStore";
import type { CategoryConfig } from "../../_data/categories";

/*
  Category banner — breadcrumb + H1 + zone-aware delivery promise.
  Zone বদলালে promise chip গুলো বদলায় (approved board rule).

  31 Jul 2026 — the chips now come from the shop's trust badges, the same rows
  the homepage trust strip uses. The pair below is the fallback for the moment
  before the answer arrives, and for a shop that has not set any up.
*/

/*  ⚠️ No duration in the fallback — the live list is the admin's trust badges,
    and this is only what shows before they arrive. "2-Hour Delivery" here
    meant a shop with no badges configured advertised a service it does not
    run, on every category page.  */
const PROMISES: Record<"dhaka" | "bangladesh", string[]> = {
  dhaka: ["Express Delivery", "Same Day", "Midnight", "Freshness Guarantee"],
  bangladesh: ["Nationwide Delivery", "Courier-Safe Packing", "1–3 Days", "Freshness Guarantee"],
};

export default function CategoryBanner({
  config,
  zone,
}: {
  config: CategoryConfig;
  zone: Zone | null;
}) {
  const zoneLabel = zone === "bangladesh" ? "All Bangladesh" : "Inside Dhaka";
  const promises =
    config.promises && config.promises.length > 0
      ? config.promises
      : PROMISES[zone === "bangladesh" ? "bangladesh" : "dhaka"];

  return (
    <div className="max-w-[1200px] mx-auto px-6">
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
            <Link
              href={`/${config.parent.slug}`}
              className="transition-colors hover:text-orchid"
            >
              {config.parent.label}
            </Link>
            <span className="text-lavender-deep">›</span>
          </>
        )}
        <b className="text-purple font-medium">{config.label}</b>
      </nav>

      <section
        className="mt-4 rounded-[28px] overflow-hidden"
        style={{ background: config.bannerBg }}
      >
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] items-center gap-9">
          <div className="px-7 py-10 lg:py-[52px] lg:pl-[52px] lg:pr-0">
            <h1 className="font-display text-[clamp(28px,3.8vw,46px)] font-medium leading-[1.1] text-purple">
              {config.h1}
            </h1>
            <p className="my-[14px] max-w-[52ch] text-[16px] font-light text-body-soft">
              {config.lead}
            </p>

            <div className="text-[13.5px] text-body-soft">
              <b className="text-purple font-semibold">{config.totalProducts} arrangements</b>
              {" · Delivering to "}
              <b className="text-purple font-semibold">{zoneLabel}</b>
            </div>

            <div className="flex flex-wrap gap-[10px] mt-5">
              {promises.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-2 bg-white rounded-full px-[18px] py-[9px] text-[13px] font-semibold text-purple shadow-soft whitespace-nowrap"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/*
            The arch. This is where the category's photograph belongs — beside
            the words, not behind them. No photo yet → the lavender panel the
            design has always drawn, never grey, because a grey box reads as an
            image that failed to load.
          */}
          <div
            className="h-[220px] lg:h-[320px] self-stretch rounded-[28px] lg:rounded-none lg:rounded-tl-[260px] mx-6 mb-6 lg:m-0 bg-center bg-cover"
            style={{
              background: config.bannerImageUrl
                ? `url(${config.bannerImageUrl}) center/cover`
                : "linear-gradient(160deg,#E7D3F2,#D9B8EC 45%,#EFD9F8)",
            }}
            role={config.bannerImageUrl ? "img" : undefined}
            aria-label={config.bannerImageUrl ? config.label : undefined}
          />
        </div>
      </section>
    </div>
  );
}
