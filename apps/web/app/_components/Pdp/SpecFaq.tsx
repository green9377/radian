import type { ProductDetail } from "../../_data/productDetails";
import Icon from "./PdpIcons";

/*
  "Before You Order" — one dropdown stack.
  The first item is the specification table (Item | Quantity), not a section
  of its own: whoever wants it opens it, and the page stays light.
  Its first row is Product Type (Fresh / Artificial) — the customer's
  first question.
*/

const CHEV =
  "w-4 h-4 shrink-0 text-orchid transition-transform group-open:rotate-180";

export default function SpecFaq({ detail }: { detail: ProductDetail }) {
  const fresh = detail.nature.type === "fresh";

  /*
    DEC-PRD-034 — the owner, 9 Aug 2026: "when trust badges, the FAQ and
    what's-inside are missing it makes something up on its own — why?"

    Four questions used to be hand-written here and ALWAYS appended — not
    even as a fallback; they sat under whatever the owner wrote. So the shop
    made promises the owner never gave ("send a photo within 24 hours and we
    replace it the same day", "the rider never leaves a gift at the door").
    Those are business policy, not a code decision.

    Everything shown now is the shop's own writing: the product's FAQ, else
    the category's (Category → FAQ, beside Occasions & Tags). With neither,
    not one accordion is drawn.
  */

  return (
    <section id="specs" className="max-w-[900px] mx-auto pt-8 scroll-mt-[170px]">
      <div className="text-center mb-5">
        <div className="inline-flex items-center gap-2 text-[11.5px] tracking-[0.22em] uppercase text-orchid font-semibold mb-2">
          <span className="w-[8px] h-[8px] bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block" />
          Everything you&apos;re wondering
        </div>
        <h2 className="font-display text-[clamp(23px,2.6vw,30px)] font-medium text-purple leading-tight">
          Before You Order
        </h2>
      </div>

      {/* ── Specification (inside the dropdown) ── */}
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
              {/* Fresh vs Artificial — first, highlighted */}
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
                  {detail.nature.label ?? (fresh ? "Fresh" : "Artificial")}
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

          {/*  ⚠️ THE CRAFT STRIP USED TO BE HERE and that was the whole
              complaint (owner, 23 Aug 2026): *"why buy from us ata product
              upload page a jay nai."* It rendered — at the bottom of this
              table, inside a closed accordion, 1,400 pixels down the page.
              It now has its own band straight under the buy box; see
              `WhyBuy.tsx`, which also explains why a coloured band and not
              three more white cards.  */}
        </div>
      </details>

      {/* ── the product's own FAQ (the fresh/artificial questions live here) ── */}
      {detail.faqs.map((f) => (
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
