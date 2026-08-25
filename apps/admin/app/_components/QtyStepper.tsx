"use client";

import { useEffect, useRef, useState } from "react";

/*
  ═══════════════════════════════════════════════════════════════════════════
  QtyStepper — THE ONE QUANTITY CONTROL. Never build another one.

  Owner, 26 Aug 2026, looking at the POS bill:
    "amn joto jayga ache kothaw plus minus ar option sundor na dekhaw jay
     na ata thik kro. joto jayga ache."
    "just plus ar minus a click krei barano ar komano jay hate lekhe barano
     komano jay na... pura system ar sob jaygay admin panel and fontend sob
     jaygay ataw sob jayar maje solution kro"

  Two complaints, both fair:

  1. THE NUMBER WAS NOT TYPEABLE. Half the steppers in the project printed
     the quantity in a <span>. Selling 40 roses meant forty clicks. A counter
     with a queue in front of it cannot work that way.

  2. THEY ALL LOOKED DIFFERENT. Seven hand-rolled copies had drifted apart —
     30px here, 26px there, one with a border, one without, glyphs that were
     "-" in one place and "–" in another. None of them looked designed.

  So: one component, both apps (the storefront copy lives at
  apps/web/app/_components/QtyStepper.tsx and must stay identical in shape).

  ── HOW THE TYPING WORKS ───────────────────────────────────────────────────
  While the field has focus it keeps its own draft string, so a half-typed
  "1." or an empty box is allowed — clamping a value the moment someone
  clears the field is what makes a number input feel like it is fighting you.
  The clamp to `min` happens on blur / Enter. `max` is applied while typing,
  because that one is a real limit (stock, returnable quantity) and letting
  someone type past it just to snap back later is worse.

  Buttons are bold and clear, house rule 16 — real 40px targets, stroked
  glyphs, and a pressed state you can see across the counter.
  ═══════════════════════════════════════════════════════════════════════════
*/

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { h: number; btn: number; field: number; text: number; radius: number; glyph: number }> = {
  sm: { h: 32, btn: 32, field: 40, text: 13, radius: 10, glyph: 13 },
  md: { h: 38, btn: 38, field: 52, text: 14, radius: 12, glyph: 15 },
  lg: { h: 52, btn: 48, field: 60, text: 16, radius: 14, glyph: 17 },
};

function Glyph({ sign, size }: { sign: "minus" | "plus"; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={3} strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h14" />
      {sign === "plus" && <path d="M12 5v14" />}
    </svg>
  );
}

export default function QtyStepper({
  value,
  onChange,
  min = 1,
  max,
  step = 1,
  decimal = false,
  size = "md",
  disabled = false,
  grow = false,
  label = "Quantity",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimal?: boolean;
  size?: Size;
  disabled?: boolean;
  /** fill the width of the cell instead of hugging the number */
  grow?: boolean;
  label?: string;
}) {
  const s = SIZES[size];
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  /*  A parent may clamp harder than we do (POS caps at stock). When it sends
      a different number back while the box is not being typed in, show it.  */
  useEffect(() => { if (!focused) setDraft(null); }, [value, focused]);

  const clamp = (n: number) => {
    let v = n;
    if (max != null && v > max) v = max;
    if (v < min) v = min;
    return decimal ? Math.round(v * 100) / 100 : Math.round(v);
  };

  const bump = (dir: 1 | -1) => {
    if (disabled) return;
    setDraft(null);
    onChange(clamp((Number.isFinite(value) ? value : min) + dir * step));
  };

  const type = (raw: string) => {
    const cleaned = raw.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, "");
    setDraft(cleaned);
    if (cleaned === "" || cleaned === ".") return;      // let them empty the box
    const n = decimal ? parseFloat(cleaned) : parseInt(cleaned, 10);
    if (!Number.isFinite(n)) return;
    onChange(max != null && n > max ? max : n);          // max bites now, min waits
  };

  const commit = () => {
    setFocused(false);
    const n = draft == null || draft === "" ? value : (decimal ? parseFloat(draft) : parseInt(draft, 10));
    setDraft(null);
    onChange(clamp(Number.isFinite(n) ? n : min));
  };

  const atMin = value <= min;
  const atMax = max != null && value >= max;

  const btn = (dir: 1 | -1, off: boolean) => (
    <button
      type="button"
      tabIndex={-1}
      disabled={disabled || off}
      title={dir === 1 ? "One more" : "One less"}
      aria-label={dir === 1 ? `Increase ${label.toLowerCase()}` : `Decrease ${label.toLowerCase()}`}
      onClick={() => bump(dir)}
      className="grid place-items-center shrink-0 text-purple font-bold transition-colors
                 hover:bg-lavender active:bg-lavender-deep/45
                 disabled:text-lavender-deep disabled:bg-transparent disabled:cursor-not-allowed"
      style={{ width: s.btn, height: s.h }}
    >
      <Glyph sign={dir === 1 ? "plus" : "minus"} size={s.glyph} />
    </button>
  );

  return (
    <div
      className={`inline-flex items-center bg-white overflow-hidden transition-all
        ${grow ? "w-full" : ""}
        ${disabled ? "opacity-55" : ""}
        ${focused ? "border-purple shadow-[0_0_0_3px_rgba(71,0,102,0.13)]" : "border-lavender-deep"}`}
      style={{ height: s.h, borderRadius: s.radius, borderWidth: 1.5, borderStyle: "solid" }}
    >
      {btn(-1, atMin)}
      <input
        ref={ref}
        value={draft ?? (Number.isFinite(value) ? String(value) : "")}
        onChange={(e) => type(e.target.value)}
        onFocus={(e) => { setFocused(true); e.target.select(); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); ref.current?.blur(); }
          if (e.key === "ArrowUp") { e.preventDefault(); bump(1); }
          if (e.key === "ArrowDown") { e.preventDefault(); bump(-1); }
        }}
        disabled={disabled}
        inputMode={decimal ? "decimal" : "numeric"}
        aria-label={label}
        className={`h-full min-w-0 text-center font-bold text-purple bg-transparent outline-none
                    border-x border-lavender/90 disabled:cursor-not-allowed
                    ${grow ? "flex-1" : ""}`}
        style={{ width: grow ? undefined : s.field, fontSize: s.text, fontVariantNumeric: "tabular-nums" }}
      />
      {btn(1, atMax)}
    </div>
  );
}
