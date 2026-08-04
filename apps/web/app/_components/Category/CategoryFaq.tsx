"use client";

import type { CategorySection, Faq } from "../../_data/categories";
import { Section, SectionHead } from "./SectionShell";

/* FAQ — Reviews-এর ঠিক আগে বসে (approved board: browse → decide → doubt clear → trust) */
export default function CategoryFaq({
  section,
  faqs,
}: {
  section: CategorySection;
  faqs: Faq[];
}) {
  if (!faqs.length) return null;

  return (
    <Section tone={section.tone}>
      <SectionHead eyebrow={section.eyebrow} heading={section.heading} />
      <div className="max-w-[760px] mx-auto">
        {faqs.map((f, i) => (
          <details
            key={f.q}
            open={i === 0}
            className="group mb-[14px] rounded-[18px] border border-lavender-deep bg-white overflow-hidden open:shadow-soft"
          >
            <summary className="flex items-center justify-between gap-4 px-[26px] py-[21px] text-[15.5px] font-medium text-purple cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              {f.q}
              <svg
                className="shrink-0 w-[15px] h-[15px] stroke-orchid fill-none stroke-[2] transition-transform duration-300 group-open:rotate-180"
                viewBox="0 0 24 24"
              >
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <p className="px-[26px] pb-[22px] max-w-[64ch] text-[14.5px] font-light text-body-soft">
              {f.a}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
