"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { initTracking, track } from "../_data/tracking";

/*
  Mounts once in the root layout. Loads the admin's tag ids, injects the
  vendor scripts, and reports SPA route changes — the vendors' own snippets
  only see the first page load, everything after is client-side navigation.
*/
export default function Tracking() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    void initTracking();
  }, []);

  useEffect(() => {
    // The injected snippets already fire the initial PageView.
    if (first.current) {
      first.current = false;
      return;
    }
    track("PageView", { page_path: pathname });
  }, [pathname]);

  return null;
}
