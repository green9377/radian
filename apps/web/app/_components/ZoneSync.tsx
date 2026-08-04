"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useZoneStore } from "../_store/useZoneStore";
import { captureFromLocation } from "../_store/useAttribution";

/*
  ══════════════════════════════════════════════════════════════════════════
  Keeps the zone cookie level with the zone store — D-CAT-05.

  The zone lives in localStorage (`useZoneStore`, persisted), and the server
  cannot read localStorage. The category page is server-rendered, so it needs
  the zone BEFORE it renders, and the only thing a browser sends up front is a
  cookie.

  So the store stays the single source of truth in the browser, and this
  mirrors it into a cookie the server can read. When they disagree — the
  shopper has just switched to All Bangladesh — the cookie is rewritten and
  `router.refresh()` asks the server for the page again with the right zone.

  ⚠️ Why not simply move the zone into a cookie and delete the store: forty
  components read `useZoneStore` today, several of them mid-render. That is a
  separate change with its own risk, and this file is the small piece of it
  that the category page actually needs.

  Refresh is deliberately NOT called on first load, only on a change. On first
  load the page has already been rendered with whatever the cookie said, and
  refreshing every visit would double the work for every visitor.
  ══════════════════════════════════════════════════════════════════════════
*/
/*  MKT-D02 — বিজ্ঞাপনের utm/ref চিহ্ন প্রথম দর্শনেই তোলা হয়। ZoneSync
    এমনিতেই প্রতিটা পাতায় বসে (layout), তাই আলাদা component না বাড়িয়ে এখানেই।  */
export default function ZoneSync() {
  useEffect(() => {
    captureFromLocation();
  }, []);

  const zone = useZoneStore((s) => s.zone);
  const router = useRouter();

  useEffect(() => {
    if (!zone) return;

    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith("radian-zone="))
      ?.split("=")[1];

    if (current === zone) return;

    // a year — the same lifetime the localStorage copy effectively has.
    // Lax so it survives an ordinary link from Google or a Facebook ad.
    document.cookie = `radian-zone=${zone}; path=/; max-age=31536000; samesite=lax`;

    // the server chose products for the old zone; ask it again for the new one
    router.refresh();
  }, [zone, router]);

  return null;
}
