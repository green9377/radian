import { NextResponse, type NextRequest } from "next/server";

/*
  Admin-এর SEO redirect টেবিল, এখন সত্যিই route বদলায়।

  মালিক একটা পুরনো ঠিকানা নতুনটার দিকে ঘোরালে (যেমন বিজ্ঞাপনে ছাপা
  `/categories/rose` → `/categories/fresh-flowers`) সেটা `SeoRedirect`-এ জমা
  হতো আর কিছুই ঘটত না — টেবিলটা কেউ পড়ত না। এখন প্রতিটা page-request-এ
  এখানে মেলে।

  ⚠️ তালিকাটা ৬০ সেকেন্ড cache হয় — redirect-এর টেবিল hot path-এ বসে, আর
  প্রতি request-এ API ডাকা মানে পুরো দোকানের গতি ওই এক টেবিলের হাতে।

  ⚠️ API নাগালে না থাকলে চুপচাপ পাস — redirect একটা সুবিধা; সেটা আনতে গিয়ে
  সাইট নামিয়ে ফেলা যাবে না।
*/

interface Redirect {
  fromPath: string;
  toPath: string;
  permanent: boolean;
}

let cache: { at: number; rules: Redirect[] } | null = null;
const TTL_MS = 60_000;

async function rules(origin: string): Promise<Redirect[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rules;
  try {
    const api = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || origin.replace(":3000", ":4000");
    /*  ৫ আগস্ট — ২ সেকেন্ডের বেশি অপেক্ষা নয়। "API নাগালে না থাকলে চুপচাপ
        পাস" নিয়মটা ছিল, কিন্তু ঘুমন্ত API error দেয় না — ৫০ সেকেন্ড ঝুলে
        থাকে। Vercel তার আগেই middleware মেরে ফেলে, আর পুরো দোকান 504
        (MIDDLEWARE_INVOCATION_TIMEOUT)। redirect একটা সুবিধা — তার জন্য
        দোকান আটকে থাকতে পারে না; সময় পেরোলে AbortError হয়ে নিচের catch-এই
        পড়ে, পাতা যথারীতি খোলে।  */
    const res = await fetch(`${api}/seo/public`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return cache?.rules ?? [];
    const j = (await res.json()) as { redirects?: Redirect[] };
    cache = { at: Date.now(), rules: j.redirects ?? [] };
    return cache.rules;
  } catch {
    return cache?.rules ?? [];
  }
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const hit = (await rules(req.nextUrl.origin)).find((r) => r.fromPath === path);
  if (hit) {
    const url = req.nextUrl.clone();
    url.pathname = hit.toPath;
    return NextResponse.redirect(url, hit.permanent ? 308 : 307);
  }
  return NextResponse.next();
}

export const config = {
  /*  শুধু আসল পাতা — asset/API/internal নয়। redirect টেবিল পাতার ঠিকানা
      ঘোরানোর জন্য, ছবির জন্য নয়।  */
  matcher: ["/((?!_next/|api/|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js)).*)"],
};
