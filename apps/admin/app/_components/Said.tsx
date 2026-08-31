"use client";

import { useCallback, useState } from "react";
import Icon from "./Icon";

/*
  ═══════════════════════════════════════════════════════════════════════════
  WHAT THE SCREEN SAYS BACK — one shape, everywhere.

  ⚠️ WHY THIS EXISTS: `alert()`.

  A browser alert BLOCKS the renderer. Everything stops until somebody presses
  OK, and until then the page is frozen with no visible reason. The symptom — a
  dead screen — looks nothing like the cause, which is almost always a business
  rule doing its job. That mismatch cost most of an afternoon on 29 Aug 2026 in
  `OrderEditor`, and the same trap was still sitting on the delivery board on
  31 Aug and in twenty other files after that.

  It is also, quietly, the wrong voice: an alert says "ERROR" in the browser's
  own chrome, in the browser's own words, over the top of the shop. A rule
  saying no should read as a rule saying no — in the shop's colours, beside the
  work it refused, dismissable, and never in the way.

  So: `useSay()` holds the sentence, `<Said say={say} />` draws it. Two lines
  per screen, one appearance for the whole admin.

  ⚠️ `confirm()` IS NOT THIS. A confirm asks a QUESTION and blocking is the
  point — "Remove this rider?" must not be answerable by looking away. Those
  stay exactly as they are.
  ═══════════════════════════════════════════════════════════════════════════
*/

export interface Say {
  said: { tone: "bad" | "good"; text: string } | null;
  /** a refusal, a failure, something the person must read */
  bad: (text: string) => void;
  /** it worked, and saying so is worth a line */
  good: (text: string) => void;
  clear: () => void;
  /** the usual catch body: an Error's own words, or a fallback in plain English */
  fromError: (e: unknown, fallback: string) => void;
}

export function useSay(): Say {
  const [said, setSaid] = useState<{ tone: "bad" | "good"; text: string } | null>(null);
  const bad = useCallback((text: string) => setSaid({ tone: "bad", text }), []);
  const good = useCallback((text: string) => setSaid({ tone: "good", text }), []);
  const clear = useCallback(() => setSaid(null), []);
  const fromError = useCallback(
    (e: unknown, fallback: string) => setSaid({ tone: "bad", text: e instanceof Error ? e.message : fallback }),
    [],
  );
  return { said, bad, good, clear, fromError };
}

export function Said({ say, className = "" }: { say: Say; className?: string }) {
  if (!say.said) return null;
  const bad = say.said.tone === "bad";
  return (
    <div
      className={`flex items-start gap-2.5 rounded-[12px] border px-4 py-3 mb-4 text-[13px] ${className}`}
      style={
        bad
          ? { background: "#fdeef0", borderColor: "#f3c9cf", color: "#8c2f39" }
          : { background: "#e9f9ef", borderColor: "#c2ecd3", color: "#0e7a3d" }
      }
    >
      <Icon name={bad ? "shield" : "check"} size={16} />
      <span className="flex-1">{say.said.text}</span>
      <button
        type="button"
        onClick={say.clear}
        aria-label="Dismiss"
        className="font-bold opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
