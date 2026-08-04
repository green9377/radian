import { FAQ_GROUPS } from "../../_data/faq";
import { getContentFaqs } from "../../_data/content";

/*
  FaqView — grouped Q&A accordion। CategoryFaq-এর হুবহু <details> pattern
  (JS ছাড়াই খোলে/বন্ধ হয়), তাই server component — কোনো state নেই।

  ═══ DB প্রথম — ৪ আগস্ট ২০২৬ ═══
  Admin → Content → FAQs-এ যা লেখা, পাতাটা এখন সেটাই — group-এর ক্রম সহ।
  `_data/faq.ts`-এর হাতে লেখা তালিকা থাকে শুধু দুই অবস্থায়: DB-তে এখনো
  একটাও FAQ নেই (খালি FAQ পাতা কাউকে সাহায্য করে না), বা API নাগালে নেই।
  প্রথম প্রশ্নটা DB-তে লেখা মাত্র হাতের তালিকা সরে দাঁড়ায়।

  ⚠️ উত্তর HTML (admin-এর editor) — LivePolicyView-এর একই নিয়ম: এই ঘরে শুধু
  `/content/public/faqs`-এর উত্তর বসে, আর কারো নয়।
*/

export default async function FaqView() {
  const live = await getContentFaqs();
  const groups =
    live && live.length > 0
      ? live.map((g) => ({
          title: g.name,
          items: g.items.map((i) => ({ q: i.q, a: null as string | null, aHtml: i.aHtml })),
        }))
      : FAQ_GROUPS.map((g) => ({
          title: g.title,
          items: g.items.map((i) => ({ q: i.q, a: i.a as string | null, aHtml: null as string | null })),
        }));

  return (
    <div className="max-w-[820px] mx-auto">
      <header className="text-center mb-10">
        <div className="inline-flex items-center gap-2 text-[12px] tracking-[0.22em] uppercase text-orchid font-semibold mb-3 whitespace-nowrap">
          <span className="w-[9px] h-[9px] bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block" />
          Answers, fast
        </div>
        <h1 className="font-display text-[clamp(28px,4vw,42px)] font-medium text-purple leading-[1.15]">
          Frequently Asked Questions
        </h1>
        <p className="text-body-soft mt-3 text-[15.5px] font-light">
          Everything you need to know about ordering, delivery and gifting with
          Radian.
        </p>
      </header>

      {groups.map((group) => (
        <section key={group.title} className="mb-9 last:mb-0">
          <h2 className="font-display text-[19px] font-medium text-purple mb-4">
            {group.title}
          </h2>

          {group.items.map((f) => (
            <details
              key={f.q}
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
              {f.aHtml !== null ? (
                <div
                  className="px-[26px] pb-[22px] max-w-[64ch] text-[14.5px] font-light leading-[1.7] text-body-soft [&_p]:mb-2 [&_a]:text-orchid [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5"
                  dangerouslySetInnerHTML={{ __html: f.aHtml }}
                />
              ) : (
                <p className="px-[26px] pb-[22px] max-w-[64ch] text-[14.5px] font-light leading-[1.7] text-body-soft">
                  {f.a}
                </p>
              )}
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}
