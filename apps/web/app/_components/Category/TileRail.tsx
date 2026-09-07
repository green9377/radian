"use client";

import type { CategorySection, Tile as TileType } from "../../_data/categories";
import ArchCard from "../ui/ArchCard";
import { Section, SectionHead } from "./SectionShell";

/* Combos + Cross-sell — একই card, শুধু data আলাদা */
export default function TileRail({
  section,
  tiles,
  gold = false,
}: {
  section: CategorySection;
  tiles: TileType[];
  gold?: boolean;
}) {
  if (!tiles.length) return null;

  return (
    <Section tone={section.tone}>
      <SectionHead
        eyebrow={section.eyebrow}
        heading={section.heading}
        subheading={section.subheading}
        gold={gold}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px] lg:gap-[26px]">
        {tiles.map((t) => (
          <ArchCard key={t.label} href={t.href} title={t.label} sub={t.sub} imageUrl={t.imageUrl} />
        ))}
      </div>
    </Section>
  );
}
