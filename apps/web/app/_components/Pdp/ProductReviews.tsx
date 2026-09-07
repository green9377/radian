"use client";

import type { ProductDetail } from "../../_data/productDetails";

/*
  ─── THIS PRODUCT'S OWN REVIEWS — DEC-WEB-005 (10 Aug 2026) ────────────────
  Owner: FlowerAura puts the reviews ON the product page — summary, stars,
  the written words — and Radian should too. Until now the PDP showed only
  "4.7 · 3 Reviews" and the #reviews link fell through to the shop-wide rail
  at the bottom, which mixes every product together.

  Everything here is THIS product's published reviews, straight off the
  detail payload. No reviews → only the write button; a product page must
  never borrow another product's praise.
*/

const star = (n: number, of = 5) => (
  <span className="text-rosegold text-[13.5px] tracking-[2px] whitespace-nowrap">
    {"★".repeat(n)}
    <span className="text-lavender-deep">{"★".repeat(Math.max(of - n, 0))}</span>
  </span>
);

function ago(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

export default function ProductReviews({ detail }: { detail: ProductDetail }) {
  const r = detail.reviews;
  const items = r.items ?? [];
  const byStar = r.byStar ?? [0, 0, 0, 0, 0];
  const max = Math.max(...byStar, 1);

  return (
    <section id="reviews" className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6 mt-10">
      <div className="bg-white rounded-[28px] shadow-soft p-6 sm:p-8">
        <h2 className="font-display text-[clamp(20px,2.6vw,28px)] font-medium text-purple leading-tight mb-6">
          Customer Reviews
        </h2>

        {items.length > 0 ? (
          <>
            {/* summary + histogram — the FlowerAura shape */}
            <div className="flex flex-wrap gap-8 items-start mb-8">
              <div className="text-center">
                <div className="font-display text-[44px] font-semibold text-purple leading-none">
                  {r.rating}
                </div>
                <div className="mt-1.5">{star(Math.round(Number(r.rating)))}</div>
                <div className="text-[12.5px] text-body-soft mt-1">
                  {r.count} review{r.count === 1 ? "" : "s"}
                </div>
              </div>

              <div className="flex-1 min-w-[220px] max-w-[420px]">
                {[5, 4, 3, 2, 1].map((s) => (
                  <div key={s} className="flex items-center gap-2.5 mb-1.5">
                    <span className="text-[12.5px] text-body-soft w-[26px]">{s}★</span>
                    <div className="flex-1 h-[8px] rounded-full bg-lavender overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(byStar[s - 1] / max) * 100}%`,
                          background: "linear-gradient(90deg,#cf43ea,#b76e79)",
                        }}
                      />
                    </div>
                    <span className="text-[12.5px] text-body-soft w-[24px] text-right">
                      {byStar[s - 1]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* the reviews themselves */}
            <div className="divide-y divide-lavender-deep/70">
              {items.map((it) => (
                <div key={it.id} className="py-5 first:pt-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div
                      className="w-9 h-9 rounded-full grid place-items-center text-white font-semibold text-[13px] shrink-0"
                      style={{ background: "linear-gradient(135deg,#e9a8f5,#cf43ea)" }}
                    >
                      {it.authorName
                        .split(/\s+/).filter(Boolean).slice(0, 2)
                        .map((w) => w[0]?.toUpperCase() ?? "").join("")}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <b className="text-[13.5px] text-purple">{it.authorName}</b>
                        {/*  the server sets this from the order history —
                            a badge a customer can award themselves is worth
                            nothing (Review model's own rule)  */}
                        {it.verifiedPurchase && (
                          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-[#E8F9EE] text-[#0E7A3D]">
                            ✓ Verified purchase
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {star(it.rating)}
                        <span className="text-[11.5px] text-body-soft">{ago(it.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[14px] text-ink leading-[1.65] mt-2.5 mb-0">{it.body}</p>
                  {/* the photo they attached — approved with the words (DEC-WEB-006) */}
                  {it.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={it.imageUrl} alt=""
                      className="mt-2.5 w-[120px] h-[120px] rounded-[14px] object-cover border border-lavender-deep" />
                  )}
                  {it.context && (
                    <p className="text-[12px] text-body-soft mt-1 mb-0">{it.context}</p>
                  )}
                  {/* DEC-WEB-007 — the shop's own words under theirs */}
                  {it.replyText && (
                    <div className="mt-3 bg-lavender/40 border-l-[3px] border-orchid rounded-r-[12px] px-4 py-3 max-w-[560px]">
                      <p className="text-[10.5px] font-semibold tracking-[0.12em] uppercase text-orchid mb-1">
                        Reply from Radian
                      </p>
                      <p className="text-[13px] text-body leading-[1.55] mb-0">{it.replyText}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[14px] text-body-soft mb-2">
            No reviews for this one yet.
          </p>
        )}

        {/*  DEC-WEB-012 — no pen here. A review is written from the account's
            order page once the gift is delivered, for that product only.  */}
        <p className="text-[12.5px] text-body-soft mt-2">
          Bought this? Once it is delivered, you can review it from your order.
        </p>
      </div>
    </section>
  );
}
