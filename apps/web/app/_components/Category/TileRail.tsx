"use client";

import Link from "next/link";
import type { CategorySection, Tile as TileType } from "../../_data/categories";
import TileImage from "../ui/TileImage";
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
          <Link key={t.label} href={t.href} className="group block">
            <TileImage
              src={t.imageUrl}
              alt={t.label}
              className="aspect-[1/1.1] rounded-[28px] shadow-soft transition-all duration-300 group-hover:-translate-y-[6px] group-hover:shadow-lift"
            >
              <span className="absolute inset-0 z-[2] bg-[linear-gradient(180deg,transparent_40%,rgba(50,0,73,0.78))]" />
              <span className="absolute left-0 right-0 bottom-0 z-[3] p-[22px] text-white">
                <h3 className="font-display text-[21px] font-medium whitespace-nowrap">{t.label}</h3>
                {t.sub && <span className="text-[12.5px] text-white/80">{t.sub}</span>}
              </span>
            </TileImage>
          </Link>
        ))}
      </div>
    </Section>
  );
}
