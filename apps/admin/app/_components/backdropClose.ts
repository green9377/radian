"use client";

import type { MouseEvent } from "react";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Close a dialog on its backdrop — and only on a real press there
 *
 *  Owner, 9 Aug 2026: *"sob jaygay text select kore tan diye remove korte gele
 *  page ta chole jay."*
 *
 *  ⚠️ WHAT WAS HAPPENING. Every dialog closed on the backdrop's `onClick`. A
 *  browser fires `click` on the nearest COMMON ANCESTOR of where the press
 *  began and where it ended. Select text inside a field, drag a little past the
 *  edge of the panel, release: the press began in the input, the release landed
 *  on the backdrop, so the common ancestor IS the backdrop — and it "clicked".
 *  The dialog shut and everything typed went with it. The typing was never the
 *  problem; the release point was being read as a click on the backdrop.
 *
 *  ⚠️ WHY MOUSEDOWN, NOT CLICK. Deciding on the press means a drag that STARTS
 *  inside the panel can never close it, however far outside it ends — and it
 *  needs no remembered state, so it is safe to call inside a conditionally
 *  rendered dialog (a hook there would break the rules of hooks).
 *
 *  Usage:  <div className="fixed inset-0 …" {...backdropClose(onClose)}>
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function backdropClose(onClose: () => void) {
  return {
    onMouseDown: (e: MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
  };
}
