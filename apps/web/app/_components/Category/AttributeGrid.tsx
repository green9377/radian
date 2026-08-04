"use client";

import Link from "next/link";
import type { CategorySection, Tile as TileType } from "../../_data/categories";
import { Section, SectionHead, Tile } from "./SectionShell";

/* Shop by style / size — arrangement বা cake size */
export default function AttributeGrid({
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
        gold
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-[18px]">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="group text-center">
            <Tile
              bg={t.bg}
              className="aspect-square rounded-[18px] shadow-soft transition-all duration-300 group-hover:-translate-y-[5px] group-hover:shadow-lift"
            />
            <h3 className="mt-3 text-[14px] font-medium text-purple whitespace-nowrap">
              {t.label}
            </h3>
            {t.sub && <span className="text-[11.5px] text-body-soft">{t.sub}</span>}
          </Link>
        ))}
      </div>
    </Section>
  );
}
