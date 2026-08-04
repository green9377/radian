import type { Metadata } from "next";
import { Fraunces, Jost } from "next/font/google";
import "./globals.css";
import AdminSidebar from "./_components/AdminSidebar";
import { AuthGate } from "./_components/AuthGate";

/*
  Radian Admin — standalone app (:3001)。 পুরোটাই admin, তাই root layout-ই shell:
  বাঁয়ে sidebar, ডানে page। storefront chrome নেই। same brand token (globals.css)।
*/
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
        className={`${fraunces.variable} ${jost.variable} font-ui antialiased`}
      >
        {/* DEC-FIN-028 — nothing inside is reachable without signing in */}
        <AuthGate>
          <div className="min-h-screen flex bg-lavender text-body">
            <AdminSidebar />
            <div className="flex-1 min-w-0">{children}</div>
          </div>
        </AuthGate>
      </body>
    </html>
  );
}
