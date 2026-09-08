import type { Metadata } from "next";
import { getSiteSeo } from "./_data/seo";
import { Spectral, Public_Sans } from "next/font/google";
import "./globals.css";
import Header from "./_components/Header/Header";
import Footer from "./_components/GBE/Footer";
import SupportPanel from "./_components/Support/SupportPanel";
import { SectionTextProvider } from "./_components/ui/SectionHead";
import ZoneSync from "./_components/ZoneSync";
import Tracking from "./_components/Tracking";

/*
  ═══ THE SHOP'S TWO FACES — Spectral + Public Sans (owner, 9 Sep 2026) ═══

  Chosen from twenty systems drawn side by side (`design/font-options.html`,
  option 8). Fraunces + Jost went out for one reason: Jost is a geometric sans
  with a small x-height, and nine tenths of this shop is 12–14px — a price, a
  phone number, a delivery window. Public Sans is a grotesque with a tall
  x-height built for exactly that, and Spectral is a serif drawn for screens
  rather than for paper.

  ⚠️ Two long-standing defects go with them:

  · `font-bold` was used 132 times and NEITHER face carried a 700, so every
    bold button on the shop was a browser-smeared 600 — against the owner's
    rule that buttons are bold and clear (22 Aug). Both faces now carry a
    real 700; Public Sans is variable, so it carries every weight in one file.

  · `italic` was used on five review quotes and card messages with no italic
    loaded, so those were slanted uprights. Spectral's italic is a real cut.

  Declaring a face costs nothing until a page uses it: the browser fetches a
  weight only when text on the page asks for it.
*/
const spectral = Spectral({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
  style: ["normal", "italic"],
});

/*
  ═══ SITE METADATA COMES FROM THE ADMIN NOW — 4 Aug 2026 ═══

  This was a hand-typed constant, and its description promised "delivered in
  as little as 2 hours" on every page of a shop whose fastest service is three
  — the last of the retired speed claims, hiding in the <head>. The admin's
  SEO settings (`/settings/seo`) were written for exactly this and were read
  by nothing.

  ⚠️ `metadataBase`+template semantics: child pages that set their own title
  are NOT templated here (they already write full titles); this covers the
  pages that set none, the default description, the share image, the
  verification codes, and the site-wide indexing switch.
*/
export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSiteSeo();
  return {
    // absolute addresses for canonical links and share images — the same
    // base the sitemap uses
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://radianbd.com"),
    title: seo.siteName
      ? `${seo.siteName} — Flowers & Gifts, Delivered with Love`
      : "Radian — Flowers & Gifts, Delivered with Love",
    description: seo.defaultMetaDescription ?? undefined,
    openGraph: {
      siteName: seo.siteName ?? "Radian",
      images: seo.defaultOgImageUrl ? [seo.defaultOgImageUrl] : undefined,
    },
    twitter: seo.twitterHandle ? { site: seo.twitterHandle } : undefined,
    verification: {
      google: seo.googleVerification ?? undefined,
      other: seo.bingVerification ? { "msvalidate.01": seo.bingVerification } : undefined,
    },
    /*  মালিকের এক switch-এ পুরো সাইট Google থেকে আড়াল — staging-এর জন্য।
        allowIndexing=true হলে কিছুই লেখা হয় না; পাতার নিজের robots নিয়ম
        (যেমন category-র noIndex) তখন একাই চলে।  */
    robots: seo.allowIndexing ? undefined : { index: false, follow: false },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spectral.variable} ${publicSans.variable} font-ui antialiased`}>
        {/*
          Section headings load HERE, not on the homepage.

          They started inside `app/page.tsx` — but Reviews and Visit the shop
          render on every page, so editing "Why Dhaka Loves Radian" changed it
          on the homepage and left the old wording on /journal, /about and the
          rest. The same three lines had two different values depending on where
          you stood.

          One provider, one fetch, every page.
        */}
        <SectionTextProvider>
          {/* mirrors the zone into a cookie so server-rendered pages can read
              it before they render — see the file for why (D-CAT-05) */}
          <ZoneSync />
          <Tracking />
          <Header />
          {children}
          <Footer />
          <SupportPanel />
        </SectionTextProvider>
      </body>
    </html>
  );
}
