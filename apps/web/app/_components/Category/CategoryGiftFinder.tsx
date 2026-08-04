"use client";

import type { CategorySection } from "../../_data/categories";
import { useGiftFinderStore } from "../../_store/useGiftFinderStore";
import { ArrowIcon, Petal, Section } from "./SectionShell";

/*
  Gift Finder CTA — filter toolbar-এর জায়গায় এটাই বসেছে।
  Click করলে modal খোলে (আলাদা page নয় — user browse করছিল, তাকে
  page থেকে সরালে drop-off বাড়ে)। উত্তর দিলে নিচের All Products grid
  filter হয়ে যায়।
*/
export default function CategoryGiftFinder({ section }: { section: CategorySection }) {
  const openFinder = useGiftFinderStore((s) => s.openFinder);

  return (
    <Section>
      <div className="grid lg:grid-cols-[1fr_auto] items-center gap-8 p-8 lg:px-14 lg:py-[52px] rounded-[28px] shadow-soft bg-[linear-gradient(135deg,#F9E9FD,#F7F1FB)]">
        <div>
          {section.eyebrow && (
            <div className="inline-flex items-center gap-2 mb-[14px] text-[12px] font-semibold uppercase tracking-[0.22em] text-orchid">
              <Petal />
              {section.eyebrow}
            </div>
          )}
          <h2 className="font-display text-[clamp(24px,3vw,34px)] font-medium leading-[1.15] text-purple mb-[10px]">
            {section.heading}
          </h2>
          {section.subheading && (
            <p className="max-w-[52ch] text-[15px] font-light text-body-soft">
              {section.subheading}
            </p>
          )}
        </div>

        <button
          onClick={openFinder}
          className="inline-flex items-center gap-[10px] px-[42px] py-[17px] rounded-full bg-purple text-white text-[15.5px] font-medium whitespace-nowrap shadow-[0_12px_30px_rgba(71,0,102,0.25)] transition-all duration-300 hover:bg-purple-deep hover:-translate-y-[2px] cursor-pointer"
        >
          Open Gift Finder <ArrowIcon />
        </button>
      </div>
    </Section>
  );
}
