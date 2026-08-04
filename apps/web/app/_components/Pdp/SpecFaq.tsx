import type { ProductDetail } from "../../_data/productDetails";
import Icon from "./PdpIcons";

/*
  "Before You Order" — একটাই dropdown stack।
  প্রথম item = Specification table (Item | Quantity)। আলাদা section নয় —
  যে জানতে চায় সে খুলবে, page ভারী হবে না।
  প্রথম row = Product Type (Fresh / Artificial) — customer-এর ১ নম্বর প্রশ্ন।
*/

const CHEV =
  "w-4 h-4 shrink-0 text-orchid transition-transform group-open:rotate-180";

export default function SpecFaq({ detail }: { detail: ProductDetail }) {
  const fresh = detail.nature.type === "fresh";

  const commonFaqs = [
    {
      q: "When will it arrive?",
      /*  ⚠️ The speeds are no longer listed here. This answer named "2-hour"
          alongside same-day and midnight, and the express is three hours in
          the admin — so the FAQ contradicted the delivery step two clicks
          later. The honest answer is the one that stays true whatever the
          owner configures: you choose, on the next screen, from what the shop
          is actually offering.  */
      a: "You pick the exact date and time slot on the next step — you'll see every delivery option we can do for your area, with its price, before you pay. All Bangladesh: 1–3 days by trusted courier.",
    },
    {
      q: "Can I send it anonymously or as a surprise?",
      a: "Yes. At checkout you can mark it an anonymous gift — the card stays unsigned and our rider only says it's a gift from someone who cares. We never reveal sender details.",
    },
    {
      q: "What if the recipient isn't home?",
      a: "Our rider calls the recipient discreetly on arrival. If unreachable, we coordinate with you immediately — we never leave a gift unattended at a door.",
    },
    {
      q: "What if I'm not happy with it?",
      a: "Send one photo within 24 hours. We replace it the same day, or refund you in full. That's the entire process.",
    },
  ];

  return (
    <section className="max-w-[900px] mx-auto pt-8">
      <div className="text-center mb-5">
        <div className="inline-flex items-center gap-2 text-[11.5px] tracking-[0.22em] uppercase text-orchid font-semibold mb-2">
          <span className="w-[8px] h-[8px] bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block" />
          Everything you&apos;re wondering
        </div>
        <h2 className="font-display text-[clamp(23px,2.6vw,30px)] font-medium text-purple leading-tight">
          Before You Order
        </h2>
      </div>

      {/* ── Specification (dropdown-এর ভেতরে) ── */}
      <details open className="group bg-white border border-lavender-deep rounded-[18px] mb-2.5 overflow-hidden open:shadow-soft">
        <summary className="flex justify-between items-center gap-4 px-5 py-4 text-[15px] font-medium text-purple cursor-pointer list-none">
          What&apos;s inside? — Full specification
          <Icon name="chev" className={CHEV} />
        </summary>

        <div className="px-5 pb-5">
          <table className="w-full border-collapse bg-white border border-lavender-deep rounded-[18px] overflow-hidden">
            <thead>
              <tr>
                <th className="text-left text-[14px] font-bold text-ink px-5 py-4 border-b border-lavender-deep w-1/2">
                  Item
                </th>
                <th className="text-left text-[14px] font-bold text-ink px-5 py-4 border-b border-l border-lavender-deep">
                  Quantity
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Fresh vs Artificial — সবার আগে, হাইলাইট করা */}
              <tr className={fresh ? "bg-[#E8F9EE]" : "bg-[#EEF1FB]"}>
                <td
                  className={`px-5 py-4 border-b border-lavender-deep font-semibold ${
                    fresh ? "text-[#0E7A3D]" : "text-[#3A4B8A]"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-white grid place-items-center">
                      <Icon
                        name={fresh ? "leaf" : "sparkle"}
                        className="w-3.5 h-3.5"
                      />
                    </span>
                    Product Type
                  </span>
                </td>
                <td
                  className={`px-5 py-4 border-b border-l border-lavender-deep font-bold ${
                    fresh ? "text-[#0E7A3D]" : "text-[#3A4B8A]"
                  }`}
                >
                  {detail.nature.label}
                </td>
              </tr>

              {detail.spec.map((r, i) => (
                <tr key={r.item}>
                  <td
                    className={`px-5 py-4 text-[14.5px] font-semibold text-ink ${
                      i === detail.spec.length - 1 ? "" : "border-b border-lavender-deep"
                    }`}
                  >
                    {r.item}
                  </td>
                  <td
                    className={`px-5 py-4 text-[14.5px] text-rosegold border-l border-lavender-deep ${
                      i === detail.spec.length - 1 ? "" : "border-b"
                    }`}
                  >
                    {r.qty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* craft strip — কেন আমাদেরটা আলাদা */}
          <div className="grid md:grid-cols-3 gap-3.5 mt-5">
            {detail.craft.map((c) => (
              <div
                key={c.title}
                className="flex gap-3 items-start bg-white border border-lavender-deep rounded-[18px] px-4 py-4"
              >
                <span className="w-9 h-9 rounded-full bg-lavender grid place-items-center text-orchid shrink-0">
                  <Icon name={c.icon} className="w-4 h-4" />
                </span>
                <div>
                  <b className="block text-[13.5px] text-purple font-bold">{c.title}</b>
                  <span className="text-[12.5px] text-body-soft font-light leading-snug">
                    {c.text}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>

      {/* ── product-নির্দিষ্ট FAQ (fresh/artificial প্রশ্ন এখানেই) ── */}
      {[...detail.faqs, ...commonFaqs].map((f) => (
        <details
          key={f.q}
          className="group bg-white border border-lavender-deep rounded-[18px] mb-2.5 overflow-hidden open:shadow-soft"
        >
          <summary className="flex justify-between items-center gap-4 px-5 py-4 text-[15px] font-medium text-purple cursor-pointer list-none">
            {f.q}
            <Icon name="chev" className={CHEV} />
          </summary>
          <p className="px-5 pb-4 text-[14px] text-body-soft font-light max-w-[64ch]">
            {f.a}
          </p>
        </details>
      ))}
    </section>
  );
}
