"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getSectionText, zoneCode, type SectionCopy } from "../../_data/shop";
import { useZoneStore } from "../../_store/useZoneStore";

/*
  The heading above every section — the small coloured line, the title, and the
  sentence under it. Owner's request, 30 Jul 2026.

  ONE FETCH FOR THE WHOLE PAGE, shared through context. Nine sections each
  fetching their own heading would be nine round trips and a page that fills in
  line by line while the visitor watches.

  Each section keeps its CURRENT wording as the fallback prop. That is not
  belt-and-braces: the storefront renders in the browser, so between first paint
  and the response there is a real moment with no data, and a homepage of empty
  headings in that moment is worse than one showing last week's words.
*/

const SectionTextContext = createContext<Record<string, SectionCopy> | null>(null);

/**
 * ⚠️ Reads the zone from the store rather than taking it as a prop.
 *
 * It lives in the root layout now, which is a server component and cannot hold
 * the zone. Reading it here keeps the zone override working — and means no page
 * has to remember to pass it.
 */
export function SectionTextProvider({ children }: { children: React.ReactNode }) {
  const zone = useZoneStore((s) => s.zone);
  const [map, setMap] = useState<Record<string, SectionCopy> | null>(null);

  useEffect(() => {
    let alive = true;
    getSectionText(zoneCode(zone)).then((m) => {
      if (alive && m) setMap(m);
    });
    return () => { alive = false; };
  }, [zone]);

  return <SectionTextContext.Provider value={map}>{children}</SectionTextContext.Provider>;
}

/**
 * `sectionKey` must match a key in the API's SECTION_MANIFEST.
 *
 * An admin-set value of "" comes back as null and is rendered as ABSENT, not as
 * the fallback — clearing a subtitle has to actually clear it. The fallback
 * applies only while nothing has loaded, which is why `copy` being undefined
 * and `copy.title` being null are treated differently.
 */
export default function SectionHead({
  sectionKey,
  eyebrow,
  title,
  subtitle,
  tone = "light",
  align = "center",
  petal = "orchid",
  className = "",
}: {
  /** a key in the API's SECTION_MANIFEST — or null when the words arrive
      already resolved (a category page picks its own wording on the server) */
  sectionKey: string | null;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  /** the delivery band is dark purple and needs the light text colours */
  tone?: "light" | "dark";
  /** most sections centre their head; the delivery band and the shop card do not */
  align?: "center" | "left";
  /** the small petal before the eyebrow — rose gold marks the premium rows */
  petal?: "orchid" | "gold";
  className?: string;
}) {
  const map = useContext(SectionTextContext);
  const copy = sectionKey ? map?.[sectionKey] : undefined;

  const e = copy ? copy.eyebrow : eyebrow;
  const t = copy ? copy.title : title;
  const s = copy ? copy.subtitle : subtitle;

  const dark = tone === "dark";

  return (
    <div className={`${align === "center" ? "text-center" : "text-left"} mb-[var(--section-gap)] ${className}`}>
      {e && (
        <div className={`inline-flex items-center gap-2 text-[12px] tracking-[0.22em] uppercase font-semibold mb-3 whitespace-nowrap ${dark ? "text-orchid-mid" : "text-orchid"}`}>
          <span className={`w-[9px] h-[9px] rounded-[50%_50%_50%_0] -rotate-45 inline-block ${petal === "gold" ? "bg-rosegold" : "bg-orchid"}`} />
          {e}
        </div>
      )}
      {t && (
        <h2 className={`font-display text-[clamp(26px,3.4vw,40px)] font-medium leading-[1.15] ${dark ? "text-white" : "text-purple"}`}>
          {t}
        </h2>
      )}
      {s && <p className={`mt-2 text-[15.5px] font-light ${dark ? "text-white/80" : "text-body-soft"}`}>{s}</p>}
    </div>
  );
}
