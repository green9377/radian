"use client";

import type { Zone } from "../../_store/useZoneStore";
import type { Product } from "../../_data/products";
import type { CategorySection } from "../../_data/categories";
import { selectProducts } from "../../_data/categories";
import ProductCard from "../Product/ProductCard";
import { Section, SectionHead, ViewAll } from "./SectionShell";

/*
  একটাই component — Flowers page-এ দুবার ব্যবহার হচ্ছে:
   1) "Dhaka's Favourite Flowers" — rule: bestseller, count: 8  (2 লাইন × 4)
   2) "Ready To Send Right Now"   — rule: express,    count: 4  (1 লাইন)
  নতুন rail লাগলে নতুন code লাগে না — শুধু config-এ একটা entry।
*/
export default function ProductRail({
  section,
  products,
  zone,
  preselected = false,
}: {
  section: CategorySection;
  products: Product[];
  zone: Zone | null;
  /**
   * The list arrived already chosen — do not choose again.
   *
   * ⚠️ THIS FIXES A REAL BUG, NOT JUST THE NEW FEATURE (2 Aug 2026). The server
   * picks these two rails against the WHOLE catalogue and then this component
   * filtered them a second time by the `best` / `exp` flag. So "Most ordered"
   * silently dropped every product the shop sells a lot of but has never
   * ticked as a best seller — and with hand-picking, it would have dropped the
   * owner's own choices without a word.
   *
   * One decision, made in one place: the server's.
   */
  preselected?: boolean;
}) {
  const list = preselected
    ? products
    : selectProducts(products, {
        rule: section.rule,
        productSlugs: section.productSlugs,
        count: section.count,
      });

  if (!list.length) return null;

  return (
    <Section tone={section.tone}>
      <SectionHead
        eyebrow={section.eyebrow}
        heading={section.heading}
        subheading={section.subheading}
        gold={section.rule === "express"}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px] lg:gap-[26px]">
        {list.map((p) => (
          <ProductCard key={p.slug} product={p} zone={zone} />
        ))}
      </div>
      {section.viewAllHref && <ViewAll href={section.viewAllHref}>View All</ViewAll>}
    </Section>
  );
}
