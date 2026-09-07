"use client";

import type { BudgetTile, CategorySection } from "../../_data/categories";
import ArchCard, { RangePanel } from "../ui/ArchCard";
import { Section, SectionHead } from "./SectionShell";

/*
  Shop by budget — the same card as the homepage's "Gifts for Every Budget"
  (owner, 5 Sep 2026): the collection's own picture (or its tone), the kicker,
  the range, the small line, and the rose-gold treatment for the top tier.
  Each card filters THIS category by that price window.
*/
export default function BudgetRail({
  section,
  tiles,
}: {
  section: CategorySection;
  tiles: BudgetTile[];
}) {
  if (!tiles.length) return null;

  return (
    <Section tone={section.tone}>
      <SectionHead
        eyebrow={section.eyebrow}
        heading={section.heading}
        subheading={section.subheading}
        gold
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[22px]">
        {tiles.map((b) => (
          <ArchCard
            key={b.label}
            href={b.href}
            title={b.label}
            sub={b.sub}
            imageUrl={b.imageUrl}
            panel={<RangePanel kicker={b.kicker} label={b.label} accent={b.accent} />}
          />
        ))}
      </div>
    </Section>
  );
}
