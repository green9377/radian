import type { Metadata } from "next";
import Link from "next/link";
import { WriteReview } from "../_components/GBE/Reviews";

/*
  ─── /reviews — DEC-WEB-005 (10 Aug 2026) ──────────────────────────────────
  Owner: *"amder kon review page nei jekhane gele customer amder sob review
  aksathe dekhar sujog pabe — like FlowerAura ar moto"*. This is that page:
  every published review in one place, the Google card on top, and the pen at
  the bottom.

  Server component on the same 60s/SHOP_TAG cache as the rest of the shop —
  a review the owner approves appears here on the next revalidation, no
  deploy, nothing hand-written.
*/

export const metadata: Metadata = {
  title: "Customer Reviews — Radian",
  description:
    "What people say about Radian Flower & Gift Shop — real reviews from real deliveries across Bangladesh.",
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SHOP_TAG = "shop";

interface AllReviews {
  reviews: {
    id: string;
    authorName: string;
    rating: number;
    body: string;
    context: string | null;
    imageUrl: string | null;
    source: string;
    verifiedPurchase: boolean;
    createdAt: string;
    product: { name: string; slug: string } | null;
  }[];
  count: number;
  average: number | null;
  google: { rating: number; count: number | null; url: string | null } | null;
}

async function getAll(): Promise<AllReviews | null> {
  try {
    const r = await fetch(`${API}/shop/reviews/all`, {
      next: { revalidate: 60, tags: [SHOP_TAG] },
    });
    if (!r.ok) return null;
    return (await r.json()) as AllReviews;
  } catch {
    return null;
  }
}

const Star = ({ n }: { n: number }) => (
  <span className="text-rosegold text-[13.5px] tracking-[2px] whitespace-nowrap">
    {"★".repeat(n)}
    <span className="text-lavender-deep">{"★".repeat(Math.max(5 - n, 0))}</span>
  </span>
);

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

export default async function ReviewsPage() {
  const data = await getAll();
  const rows = data?.reviews ?? [];

  return (
    <main className="bg-[#F6F4FA] min-h-[60vh]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
        {/* head */}
        <div className="text-center mb-9">
          <div className="inline-flex items-center gap-2 text-[12px] tracking-[0.22em] uppercase text-orchid font-semibold mb-3.5">
            <span className="w-[9px] h-[9px] bg-orchid rounded-[50%_50%_50%_0] -rotate-45 inline-block" />
            Trusted by thousands
          </div>
          <h1 className="font-display text-[clamp(26px,3.4vw,40px)] font-medium text-purple leading-tight">
            Customer Reviews
          </h1>
          {data?.average !== null && data?.average !== undefined && (
            <p className="text-body-soft mt-2.5">
              <b className="text-purple">{data.average}</b> average from{" "}
              <b className="text-purple">{data.count}</b> reviews on our own shop
            </p>
          )}
        </div>

        {/* the Google card — same honesty rule as the homepage: absent until real */}
        {data?.google && (
          <div className="flex items-center justify-center gap-6 bg-white border border-lavender-deep rounded-[28px] px-10 py-6 w-fit mx-auto mb-[34px] shadow-soft flex-wrap">
            <div className="w-[54px] h-[54px] rounded-2xl bg-lavender grid place-items-center font-display text-[26px] font-semibold text-purple">
              G
            </div>
            <div>
              <div className="font-display text-[32px] font-semibold text-purple whitespace-nowrap leading-none">
                {data.google.rating.toFixed(1)}
              </div>
              <div className="text-rosegold text-[16px] tracking-[2px] whitespace-nowrap">★★★★★</div>
            </div>
            {data.google.url && (
              <a
                href={data.google.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] font-semibold text-orchid whitespace-nowrap border-b border-orchid-mid pb-[2px]"
              >
                Read them on Google →
              </a>
            )}
          </div>
        )}

        {/* every review — masonry-ish three columns */}
        {rows.length > 0 ? (
          <div className="columns-1 md:columns-2 lg:columns-3 gap-5 [column-fill:balance]">
            {rows.map((r) => (
              <div
                key={r.id}
                className="break-inside-avoid mb-5 bg-white rounded-[24px] shadow-soft overflow-hidden"
              >
                {r.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={r.imageUrl} alt="" className="w-full h-[160px] object-cover" />
                )}
                <div className="px-6 pt-5 pb-6">
                  <Star n={r.rating} />
                  <p className="font-display text-[15.5px] italic text-ink leading-[1.55] mt-2.5 mb-4">
                    &ldquo;{r.body}&rdquo;
                  </p>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full grid place-items-center text-white font-semibold text-[14px] shrink-0"
                      style={{ background: "linear-gradient(135deg,#e9a8f5,#cf43ea)" }}
                    >
                      {initials(r.authorName)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <b className="text-[13.5px] text-purple">{r.authorName}</b>
                        {r.verifiedPurchase && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#E8F9EE] text-[#0E7A3D]">
                            ✓ Verified
                          </span>
                        )}
                      </div>
                      {(r.context || r.product) && (
                        <span className="block text-[12px] text-body-soft truncate">
                          {r.context}
                          {r.context && r.product ? " · " : ""}
                          {r.product && (
                            <Link href={`/products/${r.product.slug}`} className="text-orchid hover:underline">
                              {r.product.name}
                            </Link>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-body-soft">
            No reviews published yet — yours could be the first.
          </p>
        )}

        {/* the pen — moderated, same as everywhere */}
        <WriteReview />
      </div>
    </main>
  );
}
