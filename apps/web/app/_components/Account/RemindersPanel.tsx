"use client";

import { useEffect, useState } from "react";

import {
  addReminder,
  getAddresses,
  getReminders,
  removeReminder,
  type AccountAddress,
  type AccountReminder,
} from "../../_data/accountApi";
import { useToken } from "../../_store/useAuthStore";
import { Empty, Loading, Panel } from "./AccountShell";

/*
  /account/reminders — the dates Radian remembers.

  These are `RecipientOccasion` rows: the same table Marketing already reads to
  send the reminder, hung off a person in the Address Book. That is why a date
  must belong to somebody — a birthday with nobody attached is a note, and a
  note cannot be delivered flowers.

  ⚠️ The year is not asked for. `date` is MM-DD because the occasion comes
  round every year; a year would only ever be used to say "10th anniversary",
  and nobody has asked for that yet.
*/

const input =
  "w-full border-[1.5px] border-lavender-deep rounded-[13px] px-4 py-3 text-[14px] text-body outline-none transition-colors focus:border-orchid";

const TYPES = [
  { id: "BIRTHDAY", label: "Birthday" },
  { id: "ANNIVERSARY", label: "Anniversary" },
  { id: "CUSTOM", label: "Something else" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pretty(date: string): string {
  const [mm, dd] = date.split("-").map(Number);
  if (!mm || !dd) return date;
  return `${dd} ${MONTHS[mm - 1] ?? ""}`.trim();
}

/** how many days until the next time this date comes round */
function daysAway(date: string): number | null {
  const [mm, dd] = date.split("-").map(Number);
  if (!mm || !dd) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), mm - 1, dd);
  if (next < today) next = new Date(now.getFullYear() + 1, mm - 1, dd);
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

export default function RemindersPanel() {
  const token = useToken();
  const [rows, setRows] = useState<AccountReminder[] | null>(null);
  const [people, setPeople] = useState<AccountAddress[]>([]);
  const [open, setOpen] = useState(false);
  const [recipientId, setRecipientId] = useState("");
  const [type, setType] = useState("BIRTHDAY");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getReminders(token)
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load your dates."));
    getAddresses(token)
      .then((a) => {
        setPeople(a);
        if (a[0]) setRecipientId(a[0].id);
      })
      .catch(() => setPeople([]));
  }, [token]);

  async function save() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      /*  The browser's date input gives YYYY-MM-DD; the shop keeps MM-DD.  */
      const mmdd = date.length === 10 ? date.slice(5) : date;
      setRows(await addReminder(token, { recipientId, type, date: mmdd, label }));
      setOpen(false);
      setLabel("");
      setDate("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save that date.");
    } finally {
      setBusy(false);
    }
  }

  async function drop(id: string) {
    if (!token) return;
    setBusy(true);
    try {
      setRows(await removeReminder(token, id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      icon="clock"
      title="Dates Radian remembers"
      sub="We message you before the day — never on the day, when it is already too late."
      action={
        !open &&
        people.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="bg-white text-purple border-2 border-white rounded-[13px] px-4 py-2.5 font-bold text-[13px]"
          >
            + Add a date
          </button>
        )
      }
    >
      {err && (
        <p className="mb-4 rounded-[13px] bg-[#FDECEE] border border-[#F5C2C7] px-4 py-3 text-[13px] text-[#8A1220]">
          {err}
        </p>
      )}

      {people.length === 0 && (
        <Empty
          title="Save somebody first"
          sub="A date belongs to a person — add them to your Address Book and their dates can live here."
          href="/account/addresses"
          cta="Open the Address Book"
        />
      )}

      {open && (
        <div className="border-[1.5px] border-orchid-mid bg-[#FDF8FF] rounded-[18px] p-5 mb-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-[12.5px] font-bold text-purple mb-1.5">Whose date</span>
              <select
                className={input}
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-[12.5px] font-bold text-purple mb-1.5">What is it</span>
              <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-[12.5px] font-bold text-purple mb-1.5">The day</span>
              <input
                className={input}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>

            {type === "CUSTOM" && (
              <label className="block">
                <span className="block text-[12.5px] font-bold text-purple mb-1.5">Call it</span>
                <input
                  className={input}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="The day we met"
                />
              </label>
            )}
          </div>

          <div className="flex gap-2.5 mt-5">
            <button
              type="button"
              onClick={save}
              disabled={busy || !date || !recipientId}
              className="bg-purple text-white rounded-[13px] px-6 py-3 font-bold text-[13.5px] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Remember this date"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="bg-white border-[1.5px] border-lavender-deep rounded-[13px] px-5 py-3 font-bold text-[13px] text-body"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!rows && !err && <Loading />}

      {rows && rows.length === 0 && people.length > 0 && !open && (
        <Empty
          title="No dates yet"
          sub="Tell us one birthday and you will never be the person who forgot it."
        />
      )}

      {rows?.map((r) => {
        const away = daysAway(r.date);
        return (
          <div key={r.id} className="border-[1.5px] border-lavender-deep rounded-[16px] p-4 mb-3">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <b className="text-[14px] text-purple">
                {r.label?.trim() ||
                  `${r.who}'s ${r.type === "ANNIVERSARY" ? "anniversary" : "birthday"}`}
              </b>
              {away !== null && (
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    away <= 14 ? "bg-[#FFF7E8] text-[#8A5A00]" : "bg-lavender text-purple"
                  }`}
                >
                  {away === 0 ? "today" : `in ${away} day${away === 1 ? "" : "s"}`}
                </span>
              )}
              <button
                type="button"
                onClick={() => drop(r.id)}
                className="ml-auto rounded-[11px] border-[1.5px] border-[#F5C2C7] bg-white px-3 py-1.5 text-[12.5px] font-bold text-[#C4172B]"
              >
                Delete
              </button>
            </div>
            <p className="text-[13px] text-body m-0">
              {pretty(r.date)} · for {r.who}
            </p>
          </div>
        );
      })}
    </Panel>
  );
}
