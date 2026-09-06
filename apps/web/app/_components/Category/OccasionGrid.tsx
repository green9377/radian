"use client";

import Link from "next/link";
import type { CategorySection, Tile as TileType } from "../../_data/categories";
import TileImage from "../ui/TileImage";
import { Section, SectionHead, ViewAll } from "./SectionShell";

export default function OccasionGrid({
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px] lg:gap-[26px]">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="group">
            <TileImage
              src={t.imageUrl}
              alt={t.label}
              className="aspect-[4/4.7] rounded-t-[170px] rounded-b-[18px] shadow-soft transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-lift"
            />
            <div className="mt-[18px] text-center">
              <h3 className="font-display text-[20px] font-medium text-purple">{t.label}</h3>
              {t.sub && <span className="text-[13px] text-body-soft">{t.sub}</span>}
            </div>
          </Link>
        ))}
      </div>
      {section.viewAllHref && <ViewAll href={section.viewAllHref}>All Occasions</ViewAll>}
    </Section>
  );
}
