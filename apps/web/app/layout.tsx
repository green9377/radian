import type { Metadata } from "next";
import { getSiteSeo } from "./_data/seo";
import { Fraunces, Jost } from "next/font/google";
import "./globals.css";
import Header from "./_components/Header/Header";
import Footer from "./_components/GBE/Footer";
import SupportPanel from "./_components/Support/SupportPanel";
import { SectionTextProvider } from "./_components/ui/SectionHead";
import ZoneSync from "./_components/ZoneSync";
import Tracking from "./_components/Tracking";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600"],
});

const jost = Jost({
  subsets: ["latin"],
  variable: "--font-ui",
  weight: ["300", "400", "500", "600"],
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
      <body className={`${fraunces.variable} ${jost.variable} font-ui antialiased`}>
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
