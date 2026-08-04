"use client";

import Link from "next/link";
import type { BudgetTile, CategorySection } from "../../_data/categories";
import { Section, SectionHead, Tile } from "./SectionShell";

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="group relative h-[92px] lg:h-[110px] rounded-[18px] overflow-hidden shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
          >
            <Tile bg={t.bg} className="absolute inset-0" />
            <span className="absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(50,0,73,0.15),rgba(50,0,73,0.72))]" />
            <span className="absolute inset-0 z-[3] flex flex-col items-center justify-center text-white">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-orchid-mid whitespace-nowrap">
                {t.kicker}
              </span>
              <b className="font-display text-[19px] font-medium whitespace-nowrap">{t.label}</b>
            </span>
          </Link>
        ))}
      </div>
    </Section>
  );
}
