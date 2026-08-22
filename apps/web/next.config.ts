import type { NextConfig } from "next";

/*  Demo lock.

    robots.txt is a polite request — honouring it is the crawler's choice.
    The `X-Robots-Tag` HTTP header is stronger: Google/Bing must obey it,
    and it travels with every response whether or not anyone reads robots.txt.

    Both are kept, because once a demo gets indexed it takes weeks to remove,
    and the real shop would then compete with its own demo.

    Set `NEXT_PUBLIC_DEMO_MODE=true` on the Vercel demo project.
    The real project never carries it — so the header never appears there.  */
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

  /*  Flat URLs (owner, 22 Aug 2026 — FlowerAura pattern).

      A category lives at /fresh-flower, a sub-category at /fresh-flower/roses,
      a product at /p/pink-lily-bouquet. Static routes (cart, faq, journal…)
      always win over the dynamic [slug] segment, and the API refuses a slug
      that collides with one of them (reserved-slug guard).

      The first two blocks retire this site's own old shape. The last two are
      the OLD SHOP's shape (radianbd.com used /category/x and /product/x) —
      wired now so that on the day the domain moves, every old link, ad and
      Google result lands on the right page with a 301. That mapping only
      works if imported products KEEP their radianbd.com slug.  */
  async redirects() {
    return [
      { source: "/categories/:slug", destination: "/:slug", permanent: true },
      { source: "/categories/:slug/:sub", destination: "/:slug/:sub", permanent: true },
      { source: "/products/:slug", destination: "/p/:slug", permanent: true },
      { source: "/category/:slug", destination: "/:slug", permanent: true },
      { source: "/product/:slug", destination: "/p/:slug", permanent: true },
    ];
  },
};

export default nextConfig;
