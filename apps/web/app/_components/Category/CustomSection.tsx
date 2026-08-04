"use client";

import Link from "next/link";
import type { Zone } from "../../_store/useZoneStore";
import type { ShopCategoryPage } from "../../_data/shop";
import { toProduct } from "../../_data/categoryApi";
import ProductCard from "../Product/ProductCard";
import { ArrowIcon, Section, SectionHead } from "./SectionShell";

/*
  A section the owner added to a category page — 31 Jul 2026.

  Three shapes, not a free canvas. The reasoning is the one the homepage
  accepted for the same feature: an arbitrary layout breaks an approved design
  in front of customers, and that failure is public and hard to notice from the
  admin side.

  Everything here arrives resolved from the API — products chosen, collections
  looked up, banner checked against its dates. Nothing fetches. A block that
  has nothing to show renders NOTHING, heading included: an empty row under a
  heading reads as a fault, an absent section reads as intent.
*/

type Row = ShopCategoryPage["sections"][number];

export default function CustomSection({ row, zone }: { row: Row; zone: Zone | null }) {
  const block = row.block;
  if (!block) return null;

  const head = (
    <SectionHead
      eyebrow={(row.config.eyebrow as string) || undefined}
      heading={row.title ?? undefined}
      subheading={row.subtitle ?? undefined}
    />
  );

  if (block.kind === "PRODUCT_ROW") {
    if (block.products.length === 0) return null;
    return (
      <Section tone={(row.config.tone as "plain" | "alt") ?? "plain"}>
        {head}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px] lg:gap-[26px]">
          {block.products.map((p) => (
            <ProductCard key={p.slug} product={toProduct(p)} zone={zone} />
          ))}
        </div>
      </Section>
    );
  }

  if (block.kind === "COLLECTION_ROW") {
    if (block.cards.length === 0) return null;
    return (
      <Section tone={(row.config.tone as "plain" | "alt") ?? "plain"}>
        {head}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-[18px]">
          {block.cards.map((c) => (
            <Link
              key={c.slug}
              href={`/collections/${c.slug}`}
              className={
                "rounded-[22px] px-5 py-6 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-soft border-[1.5px] " +
                (c.accent ? "border-rosegold bg-white" : "border-lavender-deep bg-white hover:border-orchid")
              }
              style={
                c.imageUrl
                  ? { background: `url(${c.imageUrl}) center/cover` }
                  : undefined
              }
            >
              {c.kicker && (
                <span className="block text-[11.5px] font-semibold uppercase tracking-[0.16em] text-orchid mb-1.5">
                  {c.kicker}
                </span>
              )}
              <b className="block font-display text-[17px] font-medium text-purple">{c.name}</b>
              {c.subtitle && <span className="block text-[12.5px] text-body-soft mt-1">{c.subtitle}</span>}
            </Link>
          ))}
        </div>
      </Section>
    );
  }

  if (block.kind === "BANNER_STRIP") {
    const b = block.banner;
    // null = switched off, out of season, or deleted. The strip disappears
    // rather than leaving a coloured band with nothing written on it.
    if (!b) return null;
    return (
      <Section tone={(row.config.tone as "plain" | "alt") ?? "plain"}>
        <div
          className="rounded-[28px] overflow-hidden px-7 py-10 lg:px-[52px] lg:py-[54px]"
          style={{
            background: b.imageUrl
              ? `url(${b.imageUrl}) center/cover`
              : "linear-gradient(135deg,#F1E4F8 0%,#E7D3F2 55%,#F9E9FD 100%)",
          }}
        >
          {b.eyebrow && (
            <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-orchid mb-3">{b.eyebrow}</div>
          )}
          <h2 className="font-display text-[clamp(24px,3.2vw,38px)] font-medium leading-[1.15] text-purple">
            {b.titleMain}
            {b.titleAccent && <span className="text-orchid"> {b.titleAccent}</span>}
          </h2>
          {b.lead && <p className="mt-3 max-w-[52ch] text-[15.5px] font-light text-body-soft">{b.lead}</p>}
          {b.cta1Label && b.cta1Href && (
            <Link
              href={b.cta1Href}
              className="inline-flex items-center gap-2 mt-6 bg-purple text-white rounded-full px-8 py-[13px] text-[14.5px] font-medium hover:bg-purple-deep transition-colors"
            >
              {b.cta1Label} <ArrowIcon />
            </Link>
          )}
        </div>
      </Section>
    );
  }

  return null;
}
