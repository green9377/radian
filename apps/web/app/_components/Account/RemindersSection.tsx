"use client";

import { useMemo, useState } from "react";

import {
  MONTHS,
  daysUntil,
  nextOccurrence,
  untilLabel,
} from "../../_data/reminders";
import {
  useReminderHydrated,
  useReminderStore,
} from "../../_store/useReminderStore";
import Icon from "../Pdp/PdpIcons";

/*
  "Dates Radian Remembers" — occasion reminder (mock)।
  add/delete functional; WhatsApp reminder daysBefore আগে (মক)।
*/

const OFFSETS = [1, 2, 3, 5, 7, 10, 14];

export default function RemindersSection() {
  const hydrated = useReminderHydrated();
  const reminders = useReminderStore((s) => s.reminders);
  const add = useReminderStore((s) => s.add);
  const remove = useReminderStore((s) => s.remove);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [month, setMonth] = useState(1);
  const [day, setDay] = useState(1);
  const [daysBefore, setDaysBefore] = useState(5);
  const [err, setErr] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...reminders]
        .map((r) => ({
          r,
          date: nextOccurrence(r.month, r.day),
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [reminders],
  );

  function save() {
    if (title.trim().length < 2) return setErr("Occasion-এর নাম দিন।");
    add({ title: title.trim(), month, day, daysBefore });
    setTitle("");
    setMonth(1);
    setDay(1);
    setDaysBefore(5);
    setErr(null);
    setOpen(false);
  }

  return (
    <section className="bg-white border-[1.5px] border-lavender-deep rounded-[22px] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[18px] text-purple font-semibold">
          <Icon name="clock" className="w-[17px] h-[17px] text-orchid" />
          Dates Radian Remembers
        </h2>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[12.5px] font-semibold text-orchid hover:text-purple transition-colors"
          >
            Add a date +
          </button>
        )}
      </div>

      {/* add form */}
      {open && (
        <div className="bg-lavender border border-lavender-deep rounded-[16px] p-4 mt-4">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Occasion — e.g. Meem's birthday"
            className="ipt"
          />
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="ipt"
              aria-label="Month"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              className="ipt"
              aria-label="Day"
            >
              {Array.from({ length: 31 }).map((_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
            <select
              value={daysBefore}
              onChange={(e) => setDaysBefore(Number(e.target.value))}
              className="ipt"
              aria-label="Remind before"
            >
              {OFFSETS.map((o) => (
                <option key={o} value={o}>
                  {o}d before
                </option>
              ))}
            </select>
          </div>
          {err && <p className="text-[12px] text-[#B42318] mt-2">{err}</p>}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={save}
              className="h-[40px] px-5 rounded-[12px] bg-purple text-white font-semibold text-[13px] hover:bg-purple-deep transition-colors"
            >
              Save date
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setErr(null);
              }}
              className="h-[40px] px-4 rounded-[12px] text-[13px] font-semibold text-body-soft hover:text-purple transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* list */}
      {!hydrated ? (
        <p className="text-[13px] text-body-soft mt-4">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-[13px] text-body-soft mt-4">
          No dates saved yet. Add birthdays and anniversaries — we&apos;ll nudge
          you on WhatsApp in time.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {sorted.map(({ r, date }) => {
            const days = daysUntil(date);
            return (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-[14px] border border-lavender p-2.5"
              >
                <span className="w-11 h-11 rounded-[12px] bg-lavender grid place-items-center shrink-0 leading-none">
                  <b className="font-display text-[16px] text-purple">{r.day}</b>
                  <span className="text-[10px] text-body-soft -mt-0.5">
                    {MONTHS[r.month - 1]}
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-purple truncate">
                    {r.title}
                  </span>
                  <span className="block text-[11.5px] text-body-soft">
                    WhatsApp reminder {r.daysBefore} days before
                  </span>
                </div>
                <span className="text-[11.5px] font-semibold text-orchid shrink-0">
                  {untilLabel(days)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  aria-label="Delete date"
                  className="w-7 h-7 rounded-full grid place-items-center text-body-soft hover:text-[#B42318] hover:bg-lavender transition-colors shrink-0"
                >
                  <svg
                    className="w-4 h-4 stroke-current fill-none stroke-[1.8]"
                    viewBox="0 0 24 24"
                  >
                    <path d="M5 5l14 14M19 5 5 19" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
