"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

/*
  Special date — one box, our own calendar. DEC-CUS-010.

  TWO FAULTS THIS REPLACES, both mine, both reported by the owner on 10 Aug:

  1. *"pura ghoer ak konay click a kaj hoy"* — I had laid an invisible native
     <input type="date"> over the box. In Chrome only the little calendar
     indicator inside a date input opens the picker; clicking the rest of it
     merely focuses. So exactly one corner of my box worked. An invisible
     control is only as clickable as the control underneath it.

  2. *"jen year na show kre just month ar date show kruk"* — a native date
     picker ALWAYS shows a year. Most birthdays reach the shop without one, and
     a calendar that demands a year for "14 February" is asking a question the
     customer never answered.

  So the calendar is ours: month arrows and a grid of days, and the year row
  appears ONLY when this date is keeping a year. No operating-system glyphs, no
  browser popup, nothing that can behave differently on his machine than mine.

  Storage is unchanged: `date` stays "MM-DD" (the occasion list and the
  one-message-per-year rule both match on it); `year` is a separate nullable.
*/

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

const pad2 = (n: number) => String(n).padStart(2, "0");
/*  February keeps 29: a 29 February birthday is real. What to do in a common
    year is the reminder list's decision, not this picker's.  */
const daysIn = (m: number) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][clampMonth(m) - 1];
function clampMonth(m: number) { return Math.min(Math.max(m || 1, 1), 12); }

export function readDate(mmdd: string, year?: number | null): string {
  const [m, d] = mmdd.split("-").map(Number);
  if (!m || !d) return mmdd;
  return `${d} ${MONTHS[clampMonth(m) - 1]}${year ? ` ${year}` : ""}`;
}

export function ordinal(n: number): string {
  if (n <= 0) return "1st";
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${tail}`;
}

export default function SpecialDateField({
  date,
  year,
  onChange,
}: {
  date: string; // "MM-DD"
  year?: number | null;
  onChange: (next: { date: string; year: number | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const [mRaw, dRaw] = date.split("-").map(Number);
  const month = clampMonth(mRaw);
  const day = Math.min(Math.max(dRaw || 1, 1), daysIn(month));
  const thisYear = new Date().getFullYear();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  /*  মাস বদলালে ৩১ তারিখ ফেব্রুয়ারিতে থাকে না — চুপচাপ ভুল তারিখ না বানিয়ে
      মাসের শেষ দিনে নামাই。  */
  const setMonth = (m: number) => {
    const mm = ((m - 1 + 12) % 12) + 1;
    onChange({ date: `${pad2(mm)}-${pad2(Math.min(day, daysIn(mm)))}`, year: year ?? null });
  };
  const setDay = (d: number) => onChange({ date: `${pad2(month)}-${pad2(d)}`, year: year ?? null });
  const setYear = (y: number) => onChange({ date, year: Math.min(Math.max(y, 1900), thisYear) });

  return (
    <span ref={wrap} className="flex items-center gap-2.5 min-w-0 relative">
      {/* the WHOLE box opens the calendar — it is a button, not an overlay */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="ipt h-[40px] flex items-center justify-between gap-2 flex-1 min-w-0 text-left"
        style={open ? { borderColor: "#cf43ea", boxShadow: "0 0 0 3px #f9e9fd" } : undefined}
      >
        <span className="truncate text-[13px]">
          {readDate(date, year)}
          {!year && <span style={{ color: "#b76e79" }}> · every year</span>}
        </span>
        <span style={{ color: "#cf43ea" }} className="shrink-0"><Icon name="clock" size={15} /></span>
      </button>

      <button
        type="button"
        onClick={() => onChange({ date, year: year ? null : thisYear })}
        className="text-[11.5px] font-medium shrink-0 hover:underline"
        style={{ color: year ? "#cf43ea" : "#9b8aa6" }}
      >
        {year ? "no year" : "add year"}
      </button>

      {year ? (
        <span className="text-[11.5px] shrink-0" style={{ color: "#b76e79" }}>
          {ordinal(thisYear - year)} this year
        </span>
      ) : null}

      {open && (
        <div className="absolute z-50 top-[46px] left-0 w-[268px] bg-white border border-lavender-deep rounded-[14px] shadow-lift p-3">
          {/* month */}
          <div className="flex items-center justify-between mb-2.5">
            <button type="button" onClick={() => setMonth(month - 1)}
              className="w-[28px] h-[28px] rounded-[9px] grid place-items-center text-purple hover:bg-lavender">‹</button>
            <b className="text-[13.5px] text-purple">{MONTHS[month - 1]}</b>
            <button type="button" onClick={() => setMonth(month + 1)}
              className="w-[28px] h-[28px] rounded-[9px] grid place-items-center text-purple hover:bg-lavender">›</button>
          </div>

          {/*  ইচ্ছাকৃতভাবে বারের ঘর নেই。 সাল ছাড়া তারিখে "কোন বার" বলে কিছু
              নেই — সাজিয়ে দেখালে সেটা মিথ্যে হতো。                          */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: daysIn(month) }, (_, i) => i + 1).map((d) => {
              const on = d === day;
              return (
                <button key={d} type="button" onClick={() => { setDay(d); setOpen(false); }}
                  className="h-[30px] rounded-[8px] text-[12.5px] transition-colors"
                  style={on
                    ? { background: "#470066", color: "#fff", fontWeight: 500 }
                    : { color: "#3d2b4a" }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = "#f7f1fb"; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                  {d}
                </button>
              );
            })}
          </div>

          {/* the year row exists only when this date keeps a year */}
          {year ? (
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-lavender-deep">
              <span className="text-[12px] text-body-soft">Year</span>
              <span className="flex items-center gap-1.5">
                <button type="button" onClick={() => setYear(year - 1)}
                  className="w-[26px] h-[26px] rounded-[8px] grid place-items-center text-purple hover:bg-lavender">‹</button>
                <input className="ipt h-[30px] w-[68px] text-center text-[12.5px]" inputMode="numeric"
                  value={year}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                    if (v.length === 4) setYear(Number(v));
                    else onChange({ date, year: v ? Number(v) : null });
                  }} />
                <button type="button" onClick={() => setYear(year + 1)}
                  className="w-[26px] h-[26px] rounded-[8px] grid place-items-center text-purple hover:bg-lavender">›</button>
              </span>
            </div>
          ) : (
            <p className="text-[11.5px] text-body-soft mt-2.5 mb-0">
              Day and month only — it comes round every year.
            </p>
          )}
        </div>
      )}
    </span>
  );
}
