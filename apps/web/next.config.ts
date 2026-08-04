import type { NextConfig } from "next";

/*  ডেমো-তালা。

    robots.txt একটা ভদ্র অনুরোধ — মানা না মানা crawler-এর ইচ্ছা。
    `X-Robots-Tag` HTTP header তার চেয়ে শক্ত: Google/Bing এটা মানতে বাধ্য,
    আর এটা প্রতিটা response-এর সাথে যায় — robots.txt কেউ পড়ুক বা না পড়ুক。

    দুটো একসাথে রাখলাম, কারণ ডেমো একবার index হয়ে গেলে সরাতে সপ্তাহ লাগে,
    আর আসল দোকান চালু হলে সে নিজের ডেমোর সাথেই প্রতিযোগিতা করবে。

    Vercel-এর demo project-এ `NEXT_PUBLIC_DEMO_MODE=true` বসাবেন。
    Real project-এ ওটা থাকবেই না — তাই header-ও বসবে না。  */
const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const nextConfig: NextConfig = {
  async headers() {
    if (!isDemo) return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};

export default nextConfig;
