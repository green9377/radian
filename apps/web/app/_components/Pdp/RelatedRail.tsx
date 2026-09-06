"use client";

import { useEffect, useRef } from "react";

import { useZoneStore } from "../../_store/useZoneStore";
import { zoneFilter, type Product } from "../../_data/products";
import ProductCard from "../Product/ProductCard";
import SectionHead from "../ui/SectionHead";

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
  dhakaOnly,
  items,
}: {
  /** product.zone === "dhaka" — this cannot be delivered in the All Bangladesh zone */
  dhakaOnly: boolean;
  /** the server's picks — an empty list is the honest answer: draw no rail */
  items: Product[];
}) {
  const { zone } = useZoneStore();
  const ref = useRef<HTMLDivElement>(null);

  const blocked = zone === "bangladesh" && dhakaOnly;
  const list = items.filter((p) => zoneFilter(p, zone)).slice(0, 4);

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
    <section id="related" className="py-[var(--section-y)]">
      {/*  the site's one heading, on the site's rhythm (owner, 6 Sep 2026).
          DEC-PRD-051 — the row holds gifts near the same price in the same
          category, and the heading says so.  */}
      <SectionHead
        sectionKey={null}
        eyebrow={blocked ? "We can still make their day" : "In the same spirit"}
        title={blocked ? "Gifts We Deliver Nationwide" : "You May Also Like"}
        subtitle={blocked ? "Courier-safe, packed to survive the journey — same occasion, same care." : ""}
      />

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
