"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  WRAP, FinHeader, Card, Table, Th, Td, Chip, Flash, Empty, Banner,
  btnPrimary, btnPrimaryStyle, btnGhost, input, taka, todayStr, TONE,
} from "./FinanceUI";
import {
  attendanceSheet, saveAttendance,
  type ApiAttendanceSheet, type ApiAttendanceRow, type AttendanceStatus,
} from "../_data/api";

/*
  ATTENDANCE — the day sheet (HR-D04).

  The sheet opens with everybody already on PRESENT. On a normal day the owner
  opens it and presses save: two clicks. Only the exceptions get touched. This
  is the whole reason a daily sheet has a chance of surviving in a shop with
  eight people — a sheet that starts empty stops being filled in by week two,
  and then payroll is done from memory anyway.

  The status buttons and the clock are two ways of saying the same thing, and
  they keep each other honest (HR-D15): pressing a status fills the times,
  typing the times re-reads the status. Only Leave is one-way, because approval
  is a decision a clock cannot make.
*/

const OPTIONS: { key: AttendanceStatus; label: string; tone: "emerald" | "sky" | "amber" | "rose" }[] = [
  { key: "PRESENT", label: "Present", tone: "emerald" },
  { key: "HALF_DAY", label: "Half day", tone: "sky" },
  { key: "LEAVE", label: "Leave", tone: "amber" },
  { key: "ABSENT", label: "Absent", tone: "rose" },
];

/*  HR-D13 — an out-time at or before the in-time means the shift crossed
    midnight. That is not an error here: Radian delivers at midnight, so
    20:00 → 01:00 is a real five-hour shift. */
function span(inTime?: string | null, outTime?: string | null): number | null {
  const hm = (v?: string | null) => {
    const m = v ? /^(\d{1,2}):(\d{2})$/.exec(v.trim()) : null;
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    return h > 23 || mi > 59 ? null : h * 60 + mi;
  };
  const a = hm(inTime), b = hm(outTime);
  if (a === null || b === null) return null;
  const d = b - a;
  return d > 0 ? d : d + 1440;
}

/*  HR-D15 — the clock decides the status.
    Owner: "present / half / leave should work off the time."

    So the moment real hours exist, the row classifies itself:
        nothing worked            → Absent
        under 75% of their day    → Half day
        75% or more               → Present

    LEAVE is the one thing that is NEVER derived. A clock can say somebody was
    not here; it cannot say whether that was approved leave or simply absence.
    That is a decision, so it stays a button — and once it is pressed the times
    stop overriding it. */
const HALF_DAY_THRESHOLD = 0.75;

function statusFromMinutes(minutes: number, dutyHoursPerDay: number, current: AttendanceStatus): AttendanceStatus {
  if (current === "LEAVE") return "LEAVE";
  if (minutes <= 0) return "ABSENT";
  const duty = Math.max(1, Math.round(dutyHoursPerDay * 60));
  return minutes < duty * HALF_DAY_THRESHOLD ? "HALF_DAY" : "PRESENT";
}

function shiftDay(iso: string, by: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

export function AttendanceView() {
  const [date, setDate] = useState(todayStr());
  const [sheet, setSheet] = useState<ApiAttendanceSheet | null>(null);
  const [rows, setRows] = useState<ApiAttendanceRow[]>([]);
  /*  The hours box keeps its own raw text. Deriving it from `minutes` looked
      tidier but ate the decimal point: typing "7.5" passes through "7." which
      rounds back to "7", so the dot vanished as fast as it was typed. */
  const [hoursText, setHoursText] = useState<Record<string, string>>({});
  /** HR-D13 — hours follow the clock unless the box is typed in by hand */
  const [handTyped, setHandTyped] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");

  const load = useCallback(async (d: string) => {
    setErr("");
    try {
      const s = await attendanceSheet(d);
      setSheet(s); setRows(s.rows); setDirty(false);
      setHoursText(Object.fromEntries(s.rows.map((r) => [r.employeeId, r.minutes ? String(+(r.minutes / 60).toFixed(2)) : ""])));
      setHandTyped({});
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not load the sheet"); }
  }, []);
  useEffect(() => { void load(date); }, [date, load]);

  const setRow = (employeeId: string, patch: Partial<ApiAttendanceRow>) => {
    setRows((p) => p.map((r) => (r.employeeId === employeeId ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  /*  HR-D12 — pressing a status re-derives the hours from THIS person's own
      duty day. That is the whole answer to "how do I read half day without a
      time": for a 12-hour shop day it fills 6, for a 4-hour evening shift it
      fills 2, and either can be typed over. */
  const setStatus = (r: ApiAttendanceRow, status: AttendanceStatus) => {
    const away = status === "ABSENT" || status === "LEAVE";
    const full = Math.round(r.dutyHoursPerDay * 60);
    const inTime = away ? null : (r.inTime ?? r.shiftStart);
    const outTime = away ? null : status === "HALF_DAY" ? null : (r.outTime ?? r.shiftEnd);
    const minutes = away ? 0 : (span(inTime, outTime) ?? (status === "HALF_DAY" ? Math.round(full / 2) : full));
    setRow(r.employeeId, { status, inTime, outTime, minutes });
    setHoursText((p) => ({ ...p, [r.employeeId]: minutes ? String(+(minutes / 60).toFixed(2)) : "" }));
    setHandTyped((p) => ({ ...p, [r.employeeId]: false }));
  };

  /*  HR-D15 — typing a clock time re-derives the hours AND the status. Both,
      because the owner's point was that the two should not be argued about
      separately: if the times say four hours of a twelve-hour day, the row is a
      half day whether or not anybody remembered to press the button. */
  const setTime = (r: ApiAttendanceRow, which: "inTime" | "outTime", v: string) => {
    const next = { inTime: r.inTime, outTime: r.outTime, [which]: v || null } as { inTime: string | null; outTime: string | null };
    const s = span(next.inTime, next.outTime);
    if (s === null || handTyped[r.employeeId]) { setRow(r.employeeId, next); return; }
    setRow(r.employeeId, { ...next, minutes: s, status: statusFromMinutes(s, r.dutyHoursPerDay, r.status) });
    setHoursText((p) => ({ ...p, [r.employeeId]: String(+(s / 60).toFixed(2)) }));
  };

  /** the hours box does the same — it is the other way of saying the same thing */
  const setHours = (r: ApiAttendanceRow, text: string) => {
    const minutes = Math.round((Number(text) || 0) * 60);
    setHoursText((p) => ({ ...p, [r.employeeId]: text }));
    setHandTyped((p) => ({ ...p, [r.employeeId]: true }));
    setRow(r.employeeId, { minutes, status: statusFromMinutes(minutes, r.dutyHoursPerDay, r.status) });
  };

  const tally = useMemo(() => {
    const t = { present: 0, half: 0, leave: 0, absent: 0, minutes: 0 };
    for (const r of rows) {
      if (r.status === "PRESENT") t.present += 1;
      else if (r.status === "HALF_DAY") t.half += 1;
      else if (r.status === "LEAVE") t.leave += 1;
      else t.absent += 1;
      t.minutes += r.minutes;
    }
    return t;
  }, [rows]);

  const locked = !!sheet?.lockedBy || !!sheet?.isFuture;

  async function save() {
    setBusy(true); setErr(""); setOk("");
    try {
      const saved = await saveAttendance({
        onDate: date,
        rows: rows.map((r) => ({
          employeeId: r.employeeId,
          status: r.status,
          isPaidLeave: r.isPaidLeave,
          inTime: r.inTime,
          outTime: r.outTime,
          minutes: r.minutes,
          note: r.note,
        })),
      });
      setSheet(saved); setRows(saved.rows); setDirty(false);
      setHoursText(Object.fromEntries(saved.rows.map((r) => [r.employeeId, r.minutes ? String(+(r.minutes / 60).toFixed(2)) : ""])));
      setHandTyped({});
      setOk(`${new Date(date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })} saved`);
      window.setTimeout(() => setOk(""), 4000);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
    finally { setBusy(false); }
  }

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="People"
        title="Attendance"
        emoji="✓"
        tone="emerald"
        sub="Everybody starts the day marked present — change only the exceptions, then save. Payroll counts the days and hours from here, so it never has to be done from memory."
        right={
          <>
            <Link href="/employees" className={btnGhost}>Staff</Link>
            <Link href="/employees/payroll" className={btnGhost}>Payroll</Link>
          </>
        }
      />
      <Flash ok={ok} err={err} />

      {sheet && sheet.rows.length > 0 && !sheet.everMarked && !sheet.lockedBy && !sheet.isFuture && (
        <Banner tone="sky" emoji="?" title="What this screen is for">
          Once a day you open this, glance down the list, and press save. Everyone is already marked
          present with their normal hours, so on an ordinary day you change nothing. Each person has
          their own full day — 12 hours for the shop, 4 for an evening helper — so pressing
          <b> Half day</b> fills in half of <i>their</i> day, not a fixed number. It also works the
          other way round: put in the real in and out times and the row sorts itself out — anything
          under three quarters of their day becomes a half day, nothing worked becomes absent. Only
          <b> Leave</b> stays yours to press, because a clock can say somebody was not here but not
          whether you allowed it. An out-time earlier than the in-time simply means the shift ran
          past midnight.
        </Banner>
      )}

      <Card className="px-5 py-4 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button className={btnGhost} onClick={() => setDate(shiftDay(date, -1))}>‹</button>
            <input type="date" className={`${input} w-auto`} max={todayStr()} value={date}
              onChange={(e) => setDate(e.target.value)} />
            <button className={btnGhost} disabled={date >= todayStr()} onClick={() => setDate(shiftDay(date, 1))}>›</button>
            {date !== todayStr() && <button className={btnGhost} onClick={() => setDate(todayStr())}>Today</button>}
          </div>
          <div className="text-[13px] text-body-soft">
            <b style={{ color: TONE.emerald.bg }}>{tally.present}</b> present ·{" "}
            <b style={{ color: TONE.sky.bg }}>{tally.half}</b> half ·{" "}
            <b style={{ color: TONE.amber.bg }}>{tally.leave}</b> leave ·{" "}
            <b style={{ color: TONE.rose.bg }}>{tally.absent}</b> absent
            {tally.minutes > 0 && <> · <b className="text-purple">{(tally.minutes / 60).toFixed(1)}</b> hours</>}
          </div>
        </div>
        {sheet?.lockedBy && (
          <p className="text-[12.5px] mt-3 mb-0" style={{ color: TONE.amber.text }}>
            This day is inside approved payroll <b>{sheet.lockedBy}</b>, so it can no longer be changed —
            last month&apos;s payslips have to keep matching last month&apos;s days. A genuine mistake is
            corrected by reversing that payroll entry in Finance.
          </p>
        )}
        {sheet?.isFuture && (
          <p className="text-[12.5px] mt-3 mb-0" style={{ color: TONE.amber.text }}>That day has not happened yet.</p>
        )}
        {sheet && !sheet.everMarked && !locked && (
          <p className="text-[12.5px] text-body-soft mt-3 mb-0">
            Nothing saved for this day yet — everyone below is showing the default.
          </p>
        )}
      </Card>

      <Card className="overflow-hidden">
        <Table head={<><Th>Employee</Th><Th>Status</Th><Th>In / out</Th><Th right>Hours worked</Th><Th>Note</Th></>}>
          {rows.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-10">
              <Empty emoji="👥" title="Nobody to mark" sub="Add staff first, then the day sheet fills itself." />
            </td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.employeeId}>
              <Td>
                <Link href={`/employees/${r.employeeId}`} className="no-underline">
                  <b className="text-purple">{r.name}</b>
                </Link>
                <span className="block text-[11.5px] text-body-soft">
                  {r.roleName ?? r.employeeNo} · {r.payType === "MONTHLY" ? "monthly" : r.payType === "DAILY" ? `${taka(r.ratePaisa)}/day` : `${taka(r.ratePaisa)}/hour`}
                </span>
                <span className="block text-[11px] text-body-soft mt-0.5">
                  Full day {r.dutyHoursPerDay} h · half day {(r.dutyHoursPerDay / 2).toFixed(1)} h
                </span>
              </Td>
              <Td>
                <div className="inline-flex rounded-xl overflow-hidden border border-[#3d3248]">
                  {OPTIONS.map((o) => {
                    const on = r.status === o.key;
                    return (
                      <button
                        key={o.key}
                        disabled={locked}
                        onClick={() => setStatus(r, o.key)}
                        className={`px-3 py-1.5 text-[12px] font-semibold border-r border-[#3d3248] last:border-r-0 transition-colors disabled:opacity-50 ${on ? "text-white" : "bg-white text-body-soft hover:bg-[#2a1538]"}`}
                        style={on ? { background: TONE[o.tone].bg } : undefined}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
                {r.status === "LEAVE" ? (
                  <label className="flex items-center gap-2 mt-2 text-[12px] text-body-soft">
                    <input type="checkbox" disabled={locked} checked={r.isPaidLeave}
                      onChange={(e) => setRow(r.employeeId, { isPaidLeave: e.target.checked })} />
                    Paid leave
                  </label>
                ) : (
                  <span className="block text-[10.5px] text-body-soft mt-1.5">
                    {r.minutes > 0
                      ? `${(r.minutes / 60).toFixed(1)} h of ${r.dutyHoursPerDay} — set from the clock`
                      : "no hours yet"}
                  </span>
                )}
              </Td>
              <Td>
                {r.status === "ABSENT" || r.status === "LEAVE" ? (
                  <span className="text-[#c9b8d4] text-[12px]">
                    {r.status === "LEAVE" ? "on leave" : "did not come"}
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <label className="time-field">
                      <span>In</span>
                      <input type="time" disabled={locked} value={r.inTime ?? ""}
                        onChange={(e) => setTime(r, "inTime", e.target.value)} />
                    </label>
                    <span className="text-[#c9b8d4] text-[13px]">→</span>
                    <label className="time-field">
                      <span>Out</span>
                      <input type="time" disabled={locked} value={r.outTime ?? ""}
                        onChange={(e) => setTime(r, "outTime", e.target.value)} />
                    </label>
                  </div>
                )}
                {r.shiftStart && r.shiftEnd && (
                  <span className="block text-[11px] text-body-soft mt-1">
                    usually {r.shiftStart}–{r.shiftEnd}
                    {r.shiftEnd <= r.shiftStart ? " (past midnight)" : ""}
                  </span>
                )}
              </Td>
              <Td right>
                <input
                  className={`${input} w-[86px] text-right`}
                  inputMode="decimal"
                  disabled={locked || r.status === "ABSENT" || r.status === "LEAVE"}
                  value={hoursText[r.employeeId] ?? ""}
                  placeholder="0"
                  onChange={(e) => setHours(r, e.target.value)}
                />
                {r.payType === "HOURLY" ? (
                  <span className="block text-[11px] mt-1" style={{ color: TONE.brand.text }}>
                    = {taka(Math.round(((Number(hoursText[r.employeeId]) || 0) * r.ratePaisa)))}
                  </span>
                ) : (
                  <span className="block text-[11px] text-body-soft mt-1">record only</span>
                )}
                {handTyped[r.employeeId] && (
                  <span className="block text-[10.5px] mt-0.5" style={{ color: TONE.amber.text }}>typed by hand</span>
                )}
              </Td>
              <Td>
                <input className={input} disabled={locked} value={r.note ?? ""}
                  placeholder="optional" onChange={(e) => setRow(r.employeeId, { note: e.target.value })} />
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      {rows.length > 0 && (
        <div className="flex items-center justify-end gap-3 mt-4">
          {dirty && <span className="text-[12.5px]" style={{ color: TONE.amber.text }}>Unsaved changes</span>}
          {!dirty && sheet?.everMarked && <Chip tone="emerald">Saved</Chip>}
          <button className={btnPrimary} style={btnPrimaryStyle} disabled={busy || locked} onClick={save}>
            {busy ? "Saving…" : "Save the day"}
          </button>
        </div>
      )}
    </div>
  );
}
