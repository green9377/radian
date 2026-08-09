import { baseFor } from "./shop";
import { SHOP_TAG } from "./cacheTags";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CONTENT — the admin's Pages & FAQ editors, finally read by the storefront.

  মালিকের নিয়ম, ৪ আগস্ট ২০২৬: *"কোনো কিছুই যেন static না হয় — dynamic হওয়া
  লাগবে আর customizable।"*

  Policy pages আর FAQ এতদিন `_data/policies.ts` / `_data/faq.ts`-এর হাতে
  লেখা প্রবন্ধ ছিল — admin-এ Content module বসে ছিল, কেউ পড়ত না। এখন DB-ই
  প্রথম; static লেখা শুধু তখন, যখন DB-তে ওই slug-এর পাতা নেই বা API নাগালে
  নেই — খালি পাতা দেখানোর চেয়ে পুরনো সত্যি ভালো, কিন্তু admin-এ পাতা তৈরি
  হওয়া মাত্র সে-ই জেতে।

  ⚠️ bodyHtml admin-এর editor থেকে আসে — বিশ্বস্ত উৎস, তবু এটা HTML।
  যে view এটা বসায় সে শুধু এই module-এর উত্তরই বসাবে, কখনো query-string
  বা গ্রাহকের লেখা নয়।
  ═══════════════════════════════════════════════════════════════════════════
*/

export interface ContentPage {
  slug: string;
  title: string;
  kind: string;
  bodyHtml: string | null;
  excerpt: string | null;
  updatedAt: string;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  noIndex: boolean;
}

export interface FaqGroupLive {
  name: string;
  items: { q: string; aHtml: string }[];
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${baseFor()}${path}`, {
      next: { revalidate: 60, tags: [SHOP_TAG] },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** null = admin-এ এই slug-এর published পাতা নেই (বা API নাগালে নেই) */
export const getContentPage = (slug: string) =>
  get<ContentPage>(`/content/public/pages/${encodeURIComponent(slug)}`);

/** null = নাগালে নেই · [] = নাগালে আছে কিন্তু কোনো FAQ লেখা হয়নি */
export const getContentFaqs = () => get<FaqGroupLive[]>("/content/public/faqs");
