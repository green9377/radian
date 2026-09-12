"use client";

import { useEffect, useState } from "react";

/*
  The skin switch (owner, 12 Sep 2026).

  Two skins, one token set: Porcelain by day, Midnight by night. The whole
  panel follows a single `data-theme` attribute on <html> — nothing else in
  the app decides a colour, so this one attribute is the entire mechanism.

  The choice is remembered per browser. It is read back in `layout.tsx` by a
  script that runs BEFORE the first paint; without that the page would flash
  the wrong skin on every load, which is worse than having no switch at all.
*/

export const SKIN_KEY = "radian.skin";
type Skin = "light" | "dark";

export default function SkinToggle() {
  const [skin, setSkin] = useState<Skin>("dark");

  /*  What the pre-paint script already decided is the truth — read it from
      the document rather than guessing again, or the button would render
      one way and the page another for a moment.  */
  useEffect(() => {
    const now = document.documentElement.getAttribute("data-theme");
    setSkin(now === "light" ? "light" : "dark");
  }, []);

  const apply = (next: Skin) => {
    const el = document.documentElement;
    /*  The class puts a transition on everything for the length of the swap
        only. Left on permanently it would slow down every hover in the
        panel; added only here, the change reads as one movement.  */
    el.classList.add("skin-swap");
    el.setAttribute("data-theme", next);
    setSkin(next);
    try {
      localStorage.setItem(SKIN_KEY, next);
    } catch {
      /* a private window with storage blocked still switches, just forgets */
    }
    window.setTimeout(() => el.classList.remove("skin-swap"), 400);
  };

  return (
    <div
      className="mx-1 mb-3 flex rounded-[12px] p-[3px] gap-[2px]"
      style={{ background: "var(--rail-hover)", border: "1px solid var(--rail-line)" }}
      role="group"
      aria-label="Panel skin"
    >
      {(
        [
          { id: "light" as const, label: "Day" },
          { id: "dark" as const, label: "Night" },
        ]
      ).map((o) => {
        const on = skin === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => apply(o.id)}
            aria-pressed={on}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-[9px] py-[7px] text-[12.5px] font-bold transition-colors"
            style={{
              background: on ? "var(--rail-on-bg)" : "transparent",
              color: on ? "var(--rail-on-fg)" : "var(--rail-dim)",
            }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {o.id === "light" ? (
                <>
                  <circle cx="12" cy="12" r="4.2" />
                  <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.1 5.1l1.4 1.4M17.5 17.5l1.4 1.4M18.9 5.1l-1.4 1.4M6.5 17.5l-1.4 1.4" />
                </>
              ) : (
                <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
              )}
            </svg>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
