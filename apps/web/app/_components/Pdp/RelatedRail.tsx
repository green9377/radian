"use client";

import { useEffect, useRef } from "react";

import { useZoneStore } from "../../_store/useZoneStore";
import { PRODUCTS, zoneFilter, type Product } from "../../_data/products";
import ProductCard from "../Product/ProductCard";

/*
  Related / cross-sell rail — একের পর এক reveal হয় (stagger)।
  Out-of-zone হলে heading বদলে courier-safe বিকল্প দেখায় — খালি হাতে ফেরত নয়।
*/

export default function RelatedRail({
  slugs,
  dhakaOnly,
  items,
}: {
  slugs: string[];
  /** product.zone === "dhaka" — All Bangladesh zone-এ এটা ডেলিভার করা যায় না */
  dhakaOnly: boolean;
  /**
   * ⚠️ দেওয়া হলে এটাই একমাত্র উৎস — mock `PRODUCTS` তখন ছোঁয়াই হয় না,
   * খালি array হলেও নয়।
   *
   * এই prop-টা আছে কারণ page এখন API থেকে পড়ে (31 Jul 2026)। নিচের দুটো
   * শাখাই mock catalogue-এ slug খোঁজে; live page-এ সেটা মানে দোকানে নেই
   * এমন ৪টা তোড়া দামসহ দেখানো। Cross-sell-এর জন্য product CARD লাগে,
   * যেটা category page-এর `/shop/products` দেবে — সেটা এলে এখানে বসবে।
   * ততক্ষণ `items={[]}` মানে সৎ ভাবে rail-টা না দেখানো।
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
          {blocked ? "We can still make their day" : "Complete the moment"}
        </div>
        <h2 className="font-display text-[clamp(26px,3.4vw,40px)] font-medium text-purple leading-tight">
          {blocked ? "Gifts We Deliver Nationwide" : "Pairs Beautifully With"}
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
