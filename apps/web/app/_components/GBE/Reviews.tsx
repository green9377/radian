"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SectionHead from "../ui/SectionHead";
import Carousel from "../ui/Carousel";
import { getShopReviews, type ShopReview } from "../../_data/shop";

/*
  GBE part 1 of 3 — Reviews ("Why Dhaka Loves Radian").
  Appears on every page in the locked GBE order:
  Reviews → Visit Radian Shop → Footer.
  Static content for now; review data + Google profile link go live
  with the Google Business profile (launch dependency).
  Story images: gradient placeholders until real photo shoot.
*/

const TINTS = [
  "linear-gradient(150deg,#F4E0EE,#E5BCDB)",
  "linear-gradient(150deg,#F2DEEA,#E5C2D8)",
  "linear-gradient(150deg,#EBDEF5,#D6C0EC)",
  "linear-gradient(150deg,#E5DCF3,#CDBBE9)",
];


export default function Reviews() {
  const [reviews, setReviews] = useState<ShopReview[] | null>(null);
  // `count` is nullable on its own — a shop may know its rating and not the tally
  const [google, setGoogle] = useState<{ rating: number; count: number | null; url: string | null } | null>(null);

  /*
    LIVE since 31 Jul 2026.

    ⚠️ THE FALLBACK QUOTES ARE NOT USED. Every other section on this page keeps
    its hard-coded content as a fallback; this one must not. Those four stories
    were invented by whoever built the page, and showing invented testimonials
    because the database is empty is exactly the thing the owner was warned
    about — it is not a rendering fallback, it is a fabricated claim.

    So: no reviews, no section. the invented testimonials that used to sit here as a record are gone (owner, 6 Sep 2026); what
    design intends a review to look like.
  */
  useEffect(() => {
    let alive = true;
    getShopReviews().then((r) => {
      if (!alive || !r) return;
      setReviews(r.reviews);
      setGoogle(r.google);
    });
    return () => { alive = false; };
  }, []);

  /*
    Hidden only when there is NOTHING — no Google figures and no published
    reviews.

    The first version hid the section whenever the review list was empty, which
    also hid the Google card the owner had just filled in. They are independent:
    a shop can have a Google rating and no written reviews of its own, and the
    rating alone is worth showing.
  */
  if (!reviews) return null; // still loading
  /*  5 Sep 2026 (owner): published reviews = 0 → the whole section stays
      hidden, Google rating or not; it returns by itself with the first
      published review. The Google figure still shows on the shop card.  */
  if (reviews.length === 0) return null;

  return (
    <section className="bg-lavender py-[var(--section-y)]" id="reviews">
      <div className="max-w-[var(--page-w)] mx-auto px-6">
        {/* Section head */}
        <SectionHead
          sectionKey="home.reviews"
          eyebrow="Trusted by thousands"
          title="Why Dhaka Loves Radian"
        />

        {/* Google rating card — hidden entirely until the real figures are in.
            An invented star rating is an invented review with a number on it. */}
        {google && (
        <div className="flex items-center justify-center gap-6 bg-white border border-lavender-deep rounded-[28px] px-10 py-6 w-fit mx-auto mb-[34px] shadow-soft flex-wrap">
          <div className="w-[54px] h-[54px] rounded-2xl bg-lavender grid place-items-center font-display text-[26px] font-semibold text-purple">
            G
          </div>
          <div>
            <div className="font-display text-[32px] font-semibold text-purple whitespace-nowrap leading-none">
              {google.rating.toFixed(1)}
            </div>
            <div className="text-rosegold text-[16px] tracking-[2px] whitespace-nowrap">
              ★★★★★
            </div>
          </div>
          <div>
            {google.count !== null && (
              <div className="text-[13px] text-body-soft whitespace-nowrap">
                Based on <b className="text-purple">{google.count} verified reviews</b>
              </div>
            )}
            <div className="text-[13px] text-body-soft whitespace-nowrap">
              on Google Business Profile
            </div>
          </div>
          {google.url && (
            <a
              href={google.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-semibold text-orchid whitespace-nowrap border-b border-orchid-mid pb-[2px]"
            >
              Read them on Google →
            </a>
          )}
        </div>
        )}

        {/* Story cards */}
        {reviews.length > 0 && (
        <Carousel autoPlayMs={3500}>
          {reviews.map((r, i) => (
            <div
              key={r.id}
              className="w-[330px] shrink-0 snap-start bg-white rounded-[28px] overflow-hidden shadow-soft"
            >
              {/* a customer's own photograph when there is one; otherwise the
                  indexed tint, so a rail of cards without pictures still looks
                  arranged rather than unfinished */}
              <div
                className="h-[150px] bg-cover bg-center"
                style={r.imageUrl ? { backgroundImage: `url(${r.imageUrl})` } : { background: TINTS[i % TINTS.length] }}
              />
              <div className="px-6 pt-5 pb-6">
                <div className="text-rosegold text-[13.5px] tracking-[2px]">
                  {"\u2605".repeat(r.rating)}
                  <span className="text-lavender-deep">{"\u2605".repeat(5 - r.rating)}</span>
                </div>
                <p className="font-display text-[16px] italic text-ink leading-[1.5] mt-[10px] mb-4 min-h-[72px]">
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
                    <b className="block text-[13.5px] text-purple whitespace-nowrap">
                      {r.authorName}
                    </b>
                    <span className="text-[12px] text-body-soft whitespace-nowrap">
                      {r.context}
                    </span>
                  </div>
                  {/* earned from the order history, so it is worth showing */}
                  {r.verifiedPurchase && (
                    <span className="ml-auto text-[10.5px] text-orchid bg-orchid-soft rounded-full px-2 py-0.5 whitespace-nowrap shrink-0">
                      verified
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </Carousel>
        )}

        {/*  DEC-WEB-005 (10 Aug) — the writing box moved OFF this rail. Owner:
            the homepage section should show the love, not collect it; writing
            happens on /reviews and on each product's own page. This rail now
            ends with the door to the full page instead.  */}
        <div className="text-center mt-8">
          <Link
            href="/reviews"
            className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-purple px-6 py-3 text-[14px] font-semibold text-purple transition-all duration-300 hover:bg-purple hover:text-white"
          >
            See all reviews →
          </Link>
        </div>
      </div>
    </section>
  );
}

/** "Tanvir Ahmed" → "TA". Two letters at most; a circle is not a name badge. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/* ─────────────────── WRITE A REVIEW — ৪ আগস্ট ২০২৬ ───────────────────
   এতদিন review ঢোকার একমাত্র পথ ছিল admin-এর হাত; গ্রাহকের কলম ছিল না।
   এই form সবসময় PENDING-এ জমা দেয় — মালিকের moderation পেরোনোর আগে
   কোনো লেখা পর্দায় ওঠে না (Storefront → Reviews), তাই প্রশংসা-নিন্দা
   দুটোই নির্ভয়ে নেওয়া যায়। জমার পরে শুধু ধন্যবাদ — PENDING লেখাটা
   কোথায় আছে তা দেখানো হয় না, দেখানোর কথাও না।  */
