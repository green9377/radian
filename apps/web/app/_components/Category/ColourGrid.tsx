"use client";

import Link from "next/link";
import type { CategorySection, ColourTile } from "../../_data/categories";
import { Section, SectionHead } from "./SectionShell";

/* Shop by colour — Cakes-এ এই section config থেকেই বন্ধ (enabled: false) */
export default function ColourGrid({
  section,
  tiles,
}: {
  section: CategorySection;
  tiles: ColourTile[];
}) {
  if (!tiles.length) return null;

  return (
    <Section tone={section.tone}>
      <SectionHead
        eyebrow={section.eyebrow}
        heading={section.heading}
        subheading={section.subheading}
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-[18px]">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="bg-white border-[1.5px] border-lavender-deep rounded-[18px] px-3 py-[18px] text-center transition-all duration-300 hover:border-orchid hover:-translate-y-1 hover:shadow-soft"
          >
            <span
              className="block w-[46px] h-[46px] mx-auto mb-3 rounded-[50%_50%_50%_0] -rotate-45 shadow-[inset_0_-6px_14px_rgba(0,0,0,0.12)]"
              style={{ background: t.swatch }}
            />
            <b className="block text-[14px] font-medium text-purple whitespace-nowrap">{t.label}</b>
            <span className="text-[11.5px] text-body-soft whitespace-nowrap">{t.sub}</span>
          </Link>
        ))}
      </div>
    </Section>
  );
}
