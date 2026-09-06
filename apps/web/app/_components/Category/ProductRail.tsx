"use client";

import type { Zone } from "../../_store/useZoneStore";
import type { Product } from "../../_data/products";
import type { CategorySection } from "../../_data/categories";
import ProductCard from "../Product/ProductCard";
import { Section, SectionHead, ViewAll } from "./SectionShell";

/*
  One component, three rows on a category page: Most ordered, Ready to send
  right now, Better together. The list arrives already chosen by the server —
  by its rule or by the owner's own hand-picked list — and is never filtered
  again here (2 Aug 2026: a second filter by the `best` flag silently dropped
  everything the shop sells a lot of but never ticked as a best seller).
*/
export default function ProductRail({
  section,
  products: list,
  zone,
}: {
  section: CategorySection;
  products: Product[];
  zone: Zone | null;
}) {
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
