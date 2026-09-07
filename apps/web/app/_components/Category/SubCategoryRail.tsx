"use client";

import type { CategorySection, Tile as TileType } from "../../_data/categories";
import ArchCard from "../ui/ArchCard";
import { Section, SectionHead } from "./SectionShell";

/* Shop by flower / flavour — এটাই Roses page-এর উপরের লেভেল */
export default function SubCategoryRail({
  section,
  tiles,
}: {
  section: CategorySection;
  tiles: TileType[];
}) {
  if (!tiles.length) return null;

  return (
    <Section tone={section.tone}>
      <SectionHead
        eyebrow={section.eyebrow}
        heading={section.heading}
        subheading={section.subheading}
      />
      <div className="flex gap-[22px] overflow-x-auto snap-x snap-mandatory pb-[10px] scrollbar-none">
        {tiles.map((t) => (
          <ArchCard
            key={t.label}
            href={t.href}
            title={t.label}
            sub={t.sub}
            imageUrl={t.imageUrl}
            variant="thumb"
            className="shrink-0 snap-start w-[170px]"
          />
        ))}
      </div>
    </Section>
  );
}
