"use client";

import { useRef } from "react";
import Icon from "./Icon";

/*
  One box, one calendar — DEC-CUS-010.

  The owner, 10 Aug 2026, on the day/month/year triple I built first:
  *"date ar ghor kew avabe dey ai life 1st dekhlm"*. Fair. People pick a date
  from a calendar; they do not assemble one out of three dropdowns.

  The problem this solves: a native <input type="date"> ALWAYS carries a year,
  and most birthdays arrive without one ("14 February"). Showing a year the
  shop never learned would be a lie in the box.

  So the visible text is written by us and always tells the truth —
  "14 February 2015" or "3 December · every year" — while a real, invisible
  date input sits on top of it. Clicking anywhere opens the browser's own
  calendar; when a date comes back we take the month and day always, and the
  year only if this row is keeping one.

  Storage is unchanged: `date` stays "MM-DD" (the occasion list and the
  one-message-per-year rule both match on it), `year` is a separate nullable.
*/

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "02-14" + 2015 → "14 February 2015"; without a year → "14 February" */
export function readDate(mmdd: string, year?: number | null): string {
  const [m, d] = mmdd.split("-").map(Number);
  if (!m || !d) return mmdd;
  return `${d} ${MONTHS[Math.min(Math.max(m, 1), 12) - 1]}${year ? ` ${year}` : ""}`;
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
  const picker = useRef<HTMLInputElement>(null);
  const [mm, dd] = date.split("-");
  /*  no year on this row → the picker still needs one to open on. A leap year
      keeps 29 February reachable, which a real birthday can be.  */
  const pickerValue = `${year ?? 2024}-${mm || "01"}-${dd || "01"}`;
  const thisYear = new Date().getFullYear();

  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <span className="relative flex-1 min-w-0">
        <span className="ipt h-[40px] flex items-center justify-between gap-2 cursor-pointer">
          <span className="truncate text-[13px]">
            {readDate(date, year)}
            {!year && <span style={{ color: "#b76e79" }}> · every year</span>}
          </span>
          <span style={{ color: "#cf43ea" }}><Icon name="clock" size={15} /></span>
        </span>
        {/* the real control, invisible on top — the calendar is the browser's own */}
        <input
          ref={picker}
          type="date"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          value={pickerValue}
          onChange={(e) => {
            const v = e.target.value; // YYYY-MM-DD
            if (!v) return;
            const [y, m, d] = v.split("-").map(Number);
            onChange({ date: `${pad2(m)}-${pad2(d)}`, year: year ? y : null });
          }}
        />
      </span>

      {/*  the whole year question, in two words. His ruling: keep the year only
          if the customer gave one.  */}
      <button
        type="button"
        onClick={() => onChange({ date, year: year ? null : thisYear })}
        className="text-[11.5px] font-medium shrink-0 hover:underline"
        style={{ color: year ? "#cf43ea" : "#9b8aa6" }}
        title={year ? "The customer did not give a year" : "The customer gave a year"}
      >
        {year ? "no year" : "add year"}
      </button>

      {year ? (
        <span className="text-[11.5px] shrink-0" style={{ color: "#b76e79" }}>
          {ordinal(thisYear - year)} this year
        </span>
      ) : null}
    </span>
  );
}
