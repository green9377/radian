import type { PolicyDoc } from "../../_data/policies";
import type { ContentPage } from "../../_data/content";

/*
  PolicyView — একটা PolicyDoc-কে prose page হিসেবে দেখায়।
  Server component (কোনো state নেই)। সব policy/info page এই এক renderer-এ চলে।

  draft হলে উপরে amber banner — copy legal review-এর অপেক্ষায়, যাতে ভুল করে
  চূড়ান্ত ধরে না নেওয়া হয়।
*/

export default function PolicyView({ doc }: { doc: PolicyDoc }) {
  return (
    <article className="bg-white rounded-[24px] shadow-soft px-6 sm:px-10 lg:px-14 py-10 lg:py-12 max-w-[860px] mx-auto">
      {/* Header */}
      <header className="border-b border-lavender-deep pb-7 mb-8">
        <h1 className="font-display text-[clamp(28px,4vw,40px)] font-medium text-purple leading-[1.15]">
          {doc.title}
        </h1>
        <p className="text-[13px] text-body-soft mt-3">
          Last updated · {doc.updated}
        </p>
      </header>

      {/* Draft banner */}
      {doc.draft && (
        <div className="bg-[#FFF7E8] border border-[#F2D9A8] text-[#8A5A00] rounded-[14px] px-4 py-3 mb-8 text-[13px]">
          <b>Draft.</b> This wording is a working draft pending review — please
          confirm the final policy with Radian before relying on it.
        </div>
      )}

      {/* Intro */}
      <p className="text-[16px] leading-[1.75] text-body font-light mb-9">
        {doc.intro}
      </p>

      {/* Sections */}
      {doc.sections.map((section) => (
        <section key={section.heading} className="mb-8 last:mb-0">
          <h2 className="font-display text-[20px] font-medium text-purple mb-3">
            {section.heading}
          </h2>
          {section.body.map((para, i) => (
            <p
              key={i}
              className="text-[15px] leading-[1.75] text-body font-light mb-3 last:mb-0"
            >
              {para}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}

/*
  ─── LivePolicyView — admin-এর Content editor-এর পাতা ───

  ⚠️ `dangerouslySetInnerHTML`, আর কেন সেটা এখানে ঠিক আছে: `bodyHtml` আসে
  একমাত্র `/content/public/pages/:slug` থেকে, যেটা admin-এর নিজের rich-text
  editor-এর লেখা — দোকানের কর্মীর হাত, গ্রাহকের নয়, URL-এর নয়। এই component
  কোনোদিন অন্য উৎসের HTML নিলে সেটা এই মন্তব্য ভাঙা।

  Typography `globals.css`-এর `.prose-radian` নয় — Tailwind-এর arbitrary
  variant দিয়ে heading/paragraph/list-কে PolicyView-এর মাপেই বসানো, যাতে
  হাতে-লেখা আর DB-র পাতা পাশাপাশি এক দেখায়।
*/
export function LivePolicyView({ page }: { page: ContentPage }) {
  const updated = new Date(page.updatedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <article className="bg-white rounded-[24px] shadow-soft px-6 sm:px-10 lg:px-14 py-10 lg:py-12 max-w-[860px] mx-auto">
      <header className="border-b border-lavender-deep pb-7 mb-8">
        <h1 className="font-display text-[clamp(28px,4vw,40px)] font-medium text-purple leading-[1.15]">
          {page.title}
        </h1>
        <p className="text-[13px] text-body-soft mt-3">Last updated · {updated}</p>
      </header>

      {page.excerpt && (
        <p className="text-[16px] leading-[1.75] text-body font-light mb-9">{page.excerpt}</p>
      )}

      <div
        className="[&_h2]:font-display [&_h2]:text-[20px] [&_h2]:font-medium [&_h2]:text-purple [&_h2]:mb-3 [&_h2]:mt-8 [&_h3]:font-display [&_h3]:text-[17px] [&_h3]:font-medium [&_h3]:text-purple [&_h3]:mb-2 [&_h3]:mt-6 [&_p]:text-[15px] [&_p]:leading-[1.75] [&_p]:text-body [&_p]:font-light [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-3 [&_li]:text-[15px] [&_li]:leading-[1.7] [&_li]:text-body [&_li]:font-light [&_a]:text-orchid [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: page.bodyHtml ?? "" }}
      />
    </article>
  );
}
