import Link from "next/link";
import { notFound } from "next/navigation";

import { getPolicy } from "../../_data/policies";
import { getContentPage } from "../../_data/content";
import PolicyView, { LivePolicyView } from "./PolicyView";
import Reviews from "../GBE/Reviews";
import VisitStore from "../GBE/VisitStore";

/*
  PolicyPageShell — চারটা policy route এই এক shell দিয়ে চলে (D1)।
  Cart/wishlist page-এর মতোই: tinted bg, breadcrumb, GBE locked
  (Reviews → Visit Store → Footer)। Footer + SupportPanel layout.tsx-এ।

  ═══ DB প্রথম — ৪ আগস্ট ২০২৬ ═══
  Admin → Content → Pages-এ এই slug-এর published পাতা থাকলে **সেটাই** দেখায়;
  মালিক নীতিমালা বদলালে সাইট সাথে সাথে বদলায়। `_data/policies.ts`-এর লেখা
  এখন শুধু সেই দিনের জন্য যেদিন DB-তে পাতাটা এখনো তৈরি হয়নি — খালি
  নীতিমালা-পাতা আইনগতভাবে শূন্যের চেয়েও খারাপ, তাই fallback থাকে, কিন্তু
  DB-র পাতা তৈরি হওয়া মাত্র সে-ই জেতে।
*/

export default async function PolicyPageShell({ slug }: { slug: string }) {
  const live = await getContentPage(slug);
  const doc = live ? null : getPolicy(slug);
  if (!live && !doc) return notFound();
  const title = live?.title ?? doc!.title;

  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[var(--page-w)] mx-auto px-4 sm:px-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 flex-wrap py-4 text-[13.5px] text-body-soft"
        >
          <Link href="/" className="hover:text-orchid">
            Home
          </Link>
          <span className="text-lavender-deep">›</span>
          <span className="text-purple font-semibold">{title}</span>
        </nav>

        <div className="pb-16">
          {live ? <LivePolicyView page={live} /> : <PolicyView doc={doc!} />}
        </div>
      </div>

      {/* GBE — locked order */}
      <Reviews />
      <VisitStore />
    </main>
  );
}
