import type { Metadata } from "next";
import { Fraunces, Jost, Manrope } from "next/font/google";
import "./globals.css";
import AdminSidebar from "./_components/AdminSidebar";
import AccessGate from "./_components/AccessGate";
import { AuthGate } from "./_components/AuthGate";

/*
  Radian Admin — standalone app (:3001). All of it is admin, so the root
  layout IS the shell: sidebar on the left, the page on the right. No
  storefront chrome. Same brand tokens (globals.css).
*/
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  /* 700/800 — the numbers on the order grid (owner, 9 Sep 2026: "bold") */
  weight: ["400", "500", "600", "700", "800"],
});
const jost = Jost({
  subsets: ["latin"],
  variable: "--font-ui",
  weight: ["300", "400", "500", "600", "700"],
});
/*  The menu's face (owner, 8 Sep 2026: "bold and clean, not a thin, tired
    font"). Manrope at 700/800 — the sidebar only, for now.  */
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-nav",
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Radian Admin — Business OS",
  description: "Radian Business OS admin panel",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: some browser extensions inject attributes/classes
    // onto <html>/<body> before React hydrates (e.g. className="mdl-js"). That is
    // outside our control and harmless, so we tell React to ignore the mismatch.
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${fraunces.variable} ${jost.variable} ${manrope.variable} font-ui antialiased`}
      >
        {/* DEC-FIN-028 — nothing inside is reachable without signing in */}
        <AuthGate>
          <div className="min-h-screen flex bg-canvas text-body">
            <AdminSidebar />
            <div className="flex-1 min-w-0">
              {/*  a pasted URL must meet the same door the menu shows —
                  AccessGate renders a closed-door card instead of a screen
                  full of 403s (owner, 19 Aug 2026)  */}
              <AccessGate>{children}</AccessGate>
            </div>
          </div>
        </AuthGate>
      </body>
    </html>
  );
}
