import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Radian Admin — standalone Next.js app (port 3001)。
     Storefront = apps/web (:3000)。 API = apps/api (:4000)。 */

  /*  Admin কখনোই search engine-এ থাকবে না — demo হোক বা real。

      দরজায় তালা আছে (AuthGate + API-র global AuthGuard), তাই ঢুকতে কেউ
      পারবে না。 কিন্তু Google ঠিকানাটা index করে ফেললে "radian admin"
      লিখলেই সেটা সবার সামনে চলে আসে — আক্রমণকারীকে বিনা খরচে দরজা
      চিনিয়ে দেওয়া。 তাই ঠিকানাটাই আড়ালে。

      ⚠️ এখানে কোনো if-শর্ত নেই。 admin-এর index হওয়ার কোনো পরিস্থিতিই
      নেই, তাই শর্ত রাখা মানে শুধু ভুল করার একটা সুযোগ রেখে দেওয়া。  */
  async headers() {
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
