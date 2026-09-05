"use client";

import Link from "next/link";
import type { BudgetTile, CategorySection } from "../../_data/categories";
import { Section, SectionHead } from "./SectionShell";

/*
  Shop by budget — the same card as the homepage's "Gifts for Every Budget"
  (owner, 5 Sep 2026): the collection's own picture (or its tone), the kicker,
  the range, the small line, and the rose-gold treatment for the top tier.
  Each card filters THIS category by that price window.
*/
const TONES = [
  "linear-gradient(160deg,#F2DFF5,#D9B5E8)",
  "linear-gradient(160deg,#EFD9EE,#D3A8DC)",
  "linear-gradient(160deg,#E8D4F0,#C49BDD)",
  "linear-gradient(160deg,#EFD8D3,#C99A92)",
];

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
        {tiles.map((b, i) => (
          <Link
            key={b.label}
            href={b.href}
            className="relative rounded-[28px] overflow-hidden aspect-[1/1.14] shadow-soft transition-all duration-300 hover:-translate-y-[7px] hover:shadow-lift block bg-cover bg-center"
            style={b.imageUrl ? { backgroundImage: `url(${b.imageUrl})` } : { background: TONES[i % TONES.length] }}
          >
            <div
              className="absolute inset-0 z-[2]"
              style={{
                background: b.accent
                  ? "linear-gradient(180deg,transparent 30%,rgba(64,26,32,.9) 100%)"
                  : "linear-gradient(180deg,transparent 38%,rgba(50,0,73,.85) 100%)",
              }}
            />
            <div className="absolute left-0 right-0 bottom-0 z-[3] p-[22px] text-white">
              {b.kicker && (
                <div className={`text-[11px] tracking-[0.2em] uppercase font-semibold whitespace-nowrap ${b.accent ? "text-rosegold-light" : "text-orchid-mid"}`}>
                  {b.kicker}
                </div>
              )}
              <h3 className="font-display text-[22px] font-medium whitespace-nowrap mt-[3px] mb-[1px]">{b.label}</h3>
              {b.sub && <span className="text-[12.5px] text-white/80 whitespace-nowrap">{b.sub}</span>}
            </div>
          </Link>
        ))}
      </div>
    </Section>
  );
}
