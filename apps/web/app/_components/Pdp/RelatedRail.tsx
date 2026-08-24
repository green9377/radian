"use client";

import { useEffect, useRef } from "react";

import { useZoneStore } from "../../_store/useZoneStore";
import { PRODUCTS, zoneFilter, type Product } from "../../_data/products";
import ProductCard from "../Product/ProductCard";

/*
  "You may also like" — the rail under the product page. Cards reveal one
  after another (stagger). Out of zone, the heading changes and courier-safe
  alternatives take their place, rather than sending the shopper away empty.

  DEC-PRD-051 — what fills it changed on 24 August 2026. The old rule wanted a
  DIFFERENT category and came back empty on every product this shop sells; the
  new one is the same category at a nearby price, which is what FlowerAura's
  "Similar Products" does and what a shopper who has already picked a price
  can actually act on. The server ranks it; this file only draws it.
*/

export default function RelatedRail({
  slugs,
  dhakaOnly,
  items,
}: {
  slugs: string[];
  /** product.zone === "dhaka" — this cannot be delivered in the All Bangladesh zone */
  dhakaOnly: boolean;
  /**
   * ⚠️ WHEN GIVEN, THIS IS THE ONLY SOURCE — the mock `PRODUCTS` is not
   * touched at all, not even when this arrives empty.
   *
   * The prop exists because the page reads from the API now (31 Jul 2026).
   * Both branches below look slugs up in the mock catalogue, which on a live
   * page means showing four bouquets, with prices, that the shop does not
   * stock. `items={[]}` is the honest answer: draw no rail.
   */
  items?: Product[];
}) {
  const { zone } = useZoneStore();
  const ref = useRef<HTMLDivElement>(null);

  const blocked = zone === "bangladesh" && dhakaOnly;

  const list: Product[] = items
    ? items.filter((p) => zoneFilter(p, zone)).slice(0, 4)
    : blocked
      ? PRODUCTS.filter((p) => p.zone === "both" && p.best).slice(0, 4)
      : slugs
          .map((s) => PRODUCTS.find((p) => p.slug === s))
          .filter((p): p is Product => Boolean(p))
          .filter((p) => zoneFilter(p, zone))
          .slice(0, 4);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("opacity-100", "translate-y-0"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("opacity-100", "translate-y-0");
          io.unobserve(e.target);
        });
      },
      { threshold: 0.15 },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [list.length, blocked]);

  if (list.length === 0) return null;

  return (
    <section id="related" className="pt-16">
      <div className="text-center mb-9">
        <div className="inline-flex items-center gap-2 text-[12px] tracking-[0.22em] uppercase text-orchid font-semibold mb-3.5">
          <span className="w-[9px] h-[9px] bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block" />
          {blocked ? "We can still make their day" : "In the same spirit"}
        </div>
        {/*  DEC-PRD-051 — "Pairs Beautifully With" was the old different-
            category rule speaking: it promised a cake under a bouquet. The
            rail now shows bouquets near the same price, and the heading has
            to say what the row actually holds.  */}
        <h2 className="font-display text-[clamp(26px,3.4vw,40px)] font-medium text-purple leading-tight">
          {blocked ? "Gifts We Deliver Nationwide" : "You May Also Like"}
        </h2>
        {blocked && (
          <p className="text-body-soft mt-2.5 font-light">
            Courier-safe, packed to survive the journey — same occasion, same care.
          </p>
        )}
      </div>

      <div ref={ref} className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {list.map((p, i) => (
          <div
            key={p.slug}
            data-reveal
            style={{ transitionDelay: `${i * 110}ms` }}
            className="opacity-0 translate-y-7 transition-all duration-500 ease-out motion-reduce:opacity-100 motion-reduce:translate-y-0"
          >
            <ProductCard product={p} zone={zone} />
          </div>
        ))}
      </div>
    </section>
  );
}
