"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProductCard from "../Product/ProductCard";
import type { Product } from "../../_data/products";
import { toProduct } from "../../_data/categoryApi";
import { getShopCollections, getShopBanners, getShopProducts, zoneCode, type ShopCollection } from "../../_data/shop";
import type { Zone } from "../../_store/useZoneStore";
import type { LayoutBlock } from "../../_data/shop";

/*
  Sections the owner added himself, rendered from ready-made shapes.

  ⚠️ THE SHAPES ARE FIXED, THE CONTENT IS NOT — the same boundary as the
  banners, for the same reason. An arbitrary canvas breaks an approved design in
  front of customers, and that failure is public.

  Each shape reuses the styling of the built-in section it resembles, so an
  added product row is indistinguishable from the Best Sellers row. That is the
  point: a page assembled from these should not look assembled.
*/

const TINTS = [
  "linear-gradient(160deg,#F6E3F3,#EAC3E6)",
  "linear-gradient(160deg,#FBEDE4,#F2D3C0)",
  "linear-gradient(160deg,#F1E4F8,#DFC5F0)",
  "linear-gradient(160deg,#F4E6DE,#E5CBBB)",
];

export default function CustomSection({ block, zone }: { block: LayoutBlock; zone: Zone | null }) {
  if (block.blockType === "PRODUCT_ROW") return <ProductRow block={block} zone={zone} />;
  if (block.blockType === "COLLECTION_ROW") return <CollectionRow block={block} zone={zone} />;
  if (block.blockType === "BANNER_STRIP") return <BannerStrip block={block} zone={zone} />;
  if (block.blockType === "IMAGE_BANNER") return <ImageBanner block={block} />;
  return null;
}

function Head({ title, subtitle }: { title: string | null; subtitle: string | null }) {
  if (!title && !subtitle) return null;
  return (
    <div className="text-center mb-[30px]">
      {title && (
        <h2 className="font-display text-[clamp(26px,3.4vw,40px)] font-medium text-purple leading-[1.15]">{title}</h2>
      )}
      {subtitle && <p className="text-body-soft mt-2 text-[15.5px] font-light">{subtitle}</p>}
    </div>
  );
}

/*
  LIVE since 4 Sep 2026. Until then this row filtered the July mock array
  (72 invented products) while the admin screen let the owner pick a rule and
  a count — so an added "Best sellers" row showed bouquets the shop never had.

  The rule is asked of the catalogue the same way the category pages ask it:
  `bestseller` = the earned badge only (DEC-PRD-050), ranked by the window
  sales behind it; `new` = newest first; `express` / `midnight` = the products
  that can actually leave that fast, most popular first. One definition of
  "best seller", shared with the Best Sellers grid.
*/
function ProductRow({ block, zone }: { block: LayoutBlock; zone: Zone | null }) {
  const rule = String(block.config.rule ?? "bestseller");
  const count = Math.min(Math.max(Number(block.config.count ?? 8) || 8, 2), 12);
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    let alive = true;
    getShopProducts({
      zone: zoneCode(zone) ?? undefined,
      best: rule === "bestseller" ? 1 : undefined,
      speed: rule === "express" || rule === "midnight" ? rule : undefined,
      sort: rule === "new" ? "new" : rule === "bestseller" ? "best" : "popular",
      limit: count,
    }).then((res) => { if (alive) setItems(res ? res.items.map(toProduct) : []); });
    return () => { alive = false; };
  }, [zone, rule, count]);

  if (items.length === 0) return null;

  return (
    <section className="py-[46px]">
      <div className="max-w-[1200px] mx-auto px-6">
        <Head title={block.title} subtitle={block.subtitle} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-[22px]">
          {items.map((p) => <ProductCard key={p.slug} product={p} zone={zone} />)}
        </div>
      </div>
    </section>
  );
}

function CollectionRow({ block, zone }: { block: LayoutBlock; zone: Zone | null }) {
  const [all, setAll] = useState<ShopCollection[] | null>(null);
  const slugs = (block.config.slugs as string[] | undefined) ?? [];

  useEffect(() => {
    let alive = true;
    getShopCollections(zoneCode(zone)).then((c) => { if (alive && c) setAll(c); });
    return () => { alive = false; };
  }, [zone]);

  // chosen order wins over the collection list's own order — the owner picked
  // these deliberately and in a sequence
  const items = (all ?? []).filter((c) => slugs.includes(c.slug))
    .sort((a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug));

  if (items.length === 0) return null;

  return (
    <section className="bg-lavender py-[46px]">
      <div className="max-w-[1200px] mx-auto px-6">
        <Head title={block.title} subtitle={block.subtitle} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-[22px]">
          {items.map((c, i) => (
            <Link
              key={c.slug}
              href={`/collections/${c.slug}`}
              className="relative rounded-[28px] overflow-hidden aspect-[1/1.14] shadow-soft transition-all duration-300 hover:-translate-y-[7px] hover:shadow-lift block bg-cover bg-center"
              style={c.imageUrl ? { backgroundImage: `url(${c.imageUrl})` } : { background: TINTS[i % TINTS.length] }}
            >
              <div className="absolute inset-0 z-[2]" style={{ background: "linear-gradient(180deg,transparent 38%,rgba(50,0,73,.85) 100%)" }} />
              <div className="absolute left-0 right-0 bottom-0 z-[3] p-[22px] text-white">
                {c.kicker && <div className="text-[11px] tracking-[0.2em] uppercase font-semibold text-orchid-mid whitespace-nowrap">{c.kicker}</div>}
                <h3 className="font-display text-[22px] font-medium whitespace-nowrap mt-[3px]">{c.name}</h3>
                {c.subtitle && <span className="text-[12.5px] text-white/80 whitespace-nowrap">{c.subtitle}</span>}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/*
  A picture banner — the owner's own creative, as it is (5 Sep 2026). The
  design lives in the file, so the page adds nothing: no overlay, no words,
  no crop. Only the rounded corners of the site and, when there is a link,
  the whole picture is the link. Its height follows the picture's own
  proportions at the page's width.
*/
function ImageBanner({ block }: { block: LayoutBlock }) {
  const imageUrl = String(block.config.imageUrl ?? "");
  const href = String(block.config.href ?? "");
  const alt = String(block.config.alt ?? "");
  const full = block.config.width === "full";
  if (!imageUrl) return null;

  const picture = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imageUrl} alt={alt} className={`block w-full h-auto ${full ? "" : "rounded-[22px] shadow-soft"}`} />
  );
  return (
    <section className={full ? "py-[10px]" : "py-[18px]"}>
      <div className={full ? "" : "max-w-[1400px] mx-auto px-6"}>
        {href ? (
          <Link href={href} className="block transition-transform duration-300 hover:-translate-y-[2px]">{picture}</Link>
        ) : picture}
      </div>
    </section>
  );
}

function BannerStrip({ block, zone }: { block: LayoutBlock; zone: Zone | null }) {
  const [b, setB] = useState<{ titleMain: string | null; titleAccent: string | null; lead: string | null; cta1Label: string | null; cta1Href: string | null; imageUrl: string | null; eyebrow: string | null } | null>(null);
  const bannerId = block.config.bannerId as string | undefined;

  useEffect(() => {
    let alive = true;
    if (!bannerId) return;
    getShopBanners(zoneCode(zone)).then((res) => {
      if (!alive || !res) return;
      setB(res.banners.find((x) => x.id === bannerId) ?? null);
    });
    return () => { alive = false; };
  }, [zone, bannerId]);

  // no banner chosen, or the chosen one is out of season — nothing to show
  if (!b) return null;

  return (
    <section className="pb-[46px] pt-[10px]">
      <div className="max-w-[1200px] mx-auto px-6">
        <div
          className="rounded-[28px] overflow-hidden relative min-h-[250px] flex items-center shadow-lift bg-cover bg-center"
          style={b.imageUrl ? { backgroundImage: `url(${b.imageUrl})` } : { background: "linear-gradient(120deg,#FBEFF7 0%,#F3D9EE 50%,#E9C0E8 100%)" }}
        >
          {b.imageUrl && (
            <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,#FBEFF7 0%,#FBEFF7 30%,rgba(251,239,247,0.82) 46%,rgba(251,239,247,0) 72%)" }} />
          )}
          <div className="relative z-[2] px-8 py-10 md:px-[54px] md:py-11 max-w-[560px]">
            {b.eyebrow && (
              <div className="inline-flex items-center gap-2 text-[12px] tracking-[0.22em] uppercase text-purple font-semibold mb-3">
                <span className="w-[9px] h-[9px] bg-rosegold rounded-[50%_50%_50%_0] -rotate-45 inline-block" />
                {b.eyebrow}
              </div>
            )}
            <h2 className="font-display text-[clamp(24px,3vw,34px)] text-purple font-medium leading-[1.15] mb-[10px]">
              {b.titleMain} {b.titleAccent && <span className="text-orchid">{b.titleAccent}</span>}
            </h2>
            {b.lead && <p className="text-body font-light mb-[22px] max-w-[42ch]">{b.lead}</p>}
            {b.cta1Label && b.cta1Href && (
              <Link href={b.cta1Href} className="inline-flex items-center gap-[10px] px-10 py-4 bg-purple text-white rounded-full font-medium text-[15.5px] hover:bg-purple-deep transition-all">
                {b.cta1Label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
