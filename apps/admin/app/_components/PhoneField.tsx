"use client";

import { useEffect, useRef, useState } from "react";
import {
  COUNTRY_CODES,
  splitPhone,
  joinPhone,
} from "../_data/countryCodes";

/*
  Phone input with a SEARCHABLE country-code picker. Staff pick the code once
  (type to filter — "saudi", "966", "sa"), then type only the local number.
  Value stays a single international string ("+8801712345678") so WhatsApp
  identity stays clean. Any country is allowed.

  Note: inline widths are used on the trigger/number so they beat the global
  `.ipt { width:100% }` rule (otherwise the boxes collapse).
*/
export default function PhoneField({
  value,
  onChange,
  size = 44,
  placeholder = "1712 345678",
}: {
  value: string;
  onChange: (v: string) => void;
  size?: 40 | 44;
  placeholder?: string;
}) {
  const { dial, local } = splitPhone(value);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);

  const current =
    COUNTRY_CODES.find((c) => c.dial === dial) ?? COUNTRY_CODES[0];
  const h = size === 44 ? 44 : 40;

  // close on outside click / Esc
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQ("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const s = q.trim().toLowerCase();
  const list = COUNTRY_CODES.filter(
    (c) =>
      !s ||
      c.name.toLowerCase().includes(s) ||
      c.dial.includes(s) ||
      c.iso.toLowerCase().includes(s),
  );

  const pick = (d: string) => {
    onChange(joinPhone(d, local));
    setOpen(false);
    setQ("");
  };

  return (
    <div className="flex gap-2 w-full" ref={wrap}>
      {/*  ⚠️ পতাকার emoji ব্যবহার করা যাবে না。 Windows-এ flag font নেই, তাই
          🇧🇩 পর্দায় ওঠে অক্ষর হয়ে — "BD"。 মালিকের পর্দায় ঠিক তাই দেখা গেছে
          (১০ আগস্ট)。 তাই ISO কোডটাই ইচ্ছাকৃতভাবে একটা ছোট chip হিসেবে দেখাই:
          যা রেন্ডার হবেই, আর পড়তেও পরিষ্কার。                                */}
      <div className="relative shrink-0" style={{ width: 132 }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="ipt flex items-center gap-2"
          style={{ width: 132, height: h, paddingLeft: 10, paddingRight: 8 }}
          title="Country code — click to search"
        >
          <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-[5px] shrink-0"
            style={{ background: "var(--s-accent)", color: "var(--t-accent)", letterSpacing: ".02em" }}>
            {current.iso}
          </span>
          <span className="truncate font-medium">{current.dial}</span>
          <span className="text-body-soft text-[11px] ml-auto">▾</span>
        </button>

        {open && (
          <div className="absolute z-40 left-0 mt-1 w-[280px] bg-white border border-lavender-deep rounded-[12px] shadow-lift p-2">
            <div className="relative mb-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-soft text-[13px]">
                ⌕
              </span>
              <input
                autoFocus
                className="ipt"
                style={{ height: 38, paddingLeft: 30 }}
                placeholder="Search country or code…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="max-h-[230px] overflow-auto">
              {list.map((c) => (
                <button
                  key={c.iso}
                  type="button"
                  onClick={() => pick(c.dial)}
                  className={
                    "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-left text-[13px] transition-colors " +
                    (c.dial === dial
                      ? "bg-orchid-soft text-purple"
                      : "hover:bg-lavender text-body")
                  }
                >
                  <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-[5px] shrink-0 w-[30px] text-center"
                    style={{ background: "var(--s-accent)", color: "var(--t-accent)" }}>{c.iso}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-body-soft">{c.dial}</span>
                </button>
              ))}
              {list.length === 0 && (
                <div className="text-[13px] text-body-soft px-2.5 py-3">
                  No country matches “{q}”.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* local number — min-width so a narrow column cannot squash it to nothing */}
      <input
        className="ipt flex-1"
        style={{ height: h, minWidth: 150 }}
        inputMode="tel"
        value={local}
        onChange={(e) => onChange(joinPhone(dial, e.target.value))}
        placeholder={placeholder}
      />
    </div>
  );
}
