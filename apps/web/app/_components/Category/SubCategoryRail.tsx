"use client";

import Link from "next/link";
import type { CategorySection, Tile as TileType } from "../../_data/categories";
import { Section, SectionHead, Tile } from "./SectionShell";

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
          <Link
            key={t.label}
            href={t.href}
            className="group shrink-0 snap-start w-[150px] text-center"
          >
            <Tile
              bg={t.bg}
              className="h-[150px] rounded-t-[100px] rounded-b-[12px] shadow-soft transition-all duration-300 group-hover:-translate-y-[5px] group-hover:shadow-lift"
            />
            <h3 className="mt-3 text-[14.5px] font-medium text-purple whitespace-nowrap">
              {t.label}
            </h3>
            {t.sub && <span className="text-[12px] text-body-soft">{t.sub}</span>}
          </Link>
        ))}
      </div>
    </Section>
  );
}
