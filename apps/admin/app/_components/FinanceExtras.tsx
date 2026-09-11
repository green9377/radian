"use client";

/*
  Finance extras closed after comparing with Biznify (RADIAN_FINANCE_BIZNIFY_GAP.md):
    G1  monthly repeats  — rent/internet/salary prepared for you, posted on a click
    G2  staff advance    — one account + the person as a dimension (never an
                           account per employee, which is what the other system does)
    G6  accountant mode  — the only place Dr/Cr is ever shown, for year-end fixes
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import {
  ApiFinanceAccount,
  ApiRecurring,
  ApiStaffAdvance,
  createFinanceRecurring,
  deleteFinanceRecurring,
  financeAccounts,
  financeManualJournal,
  financeRecurring,
  financeStaffAdvances,
  formatTaka,
  giveStaffAdvance,
  hrPayable,
  payStaffSalary,
  postFinanceRecurring,
  updateFinanceRecurring,
  type ApiPayableEmployee,
} from "../_data/api";
import Link from "next/link";
import {
  Bar, Banner, Card, Chip, Empty, FinHeader, Flash, Kpi, Lbl, Panel, Table, Tabs, Td, Th, TONE, WRAP,
  btnGhost, btnPrimary, btnPrimaryStyle, input, taka, toPaisa, todayStr,
} from "./FinanceUI";



/* ==================== G1 · MONTHLY REPEATS ==================== */

export function RecurringLive() {
  const [rows, setRows] = useState<ApiRecurring[]>([]);
  const [accs, setAccs] = useState<ApiFinanceAccount[]>([]);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", accountId: "", paidFromId: "", amount: "", dayOfMonth: "1" });

  const load = useCallback(async () => {
    try { const [r, a] = await Promise.all([financeRecurring(), financeAccounts()]); setRows(r); setAccs(a); }
    catch (e) { setErr(e instanceof Error ? e.message : "API offline"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const cats = useMemo(() => accs.filter((a) => a.type === "EXPENSE" && a.isActive), [accs]);
  const money = useMemo(() => accs.filter((a) => a.isMoneyAccount && a.isActive), [accs]);
  const due = rows.filter((r) => r.isDue);
  const flash = (m: string) => { setOk(m); setErr(""); window.setTimeout(() => setOk(""), 4000); };
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : "Could not save");

  return (
    <div className={WRAP}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <FinHeader title="Monthly bills" emoji="📅" tone="amber" sub="Nothing posts until you press post" />
        <button className={btnGhost} onClick={() => setAdding((v) => !v)}><Icon name="plus" size={14} /> Add</button>
      </div>
      <Flash ok={ok} err={err} />

      {adding && (
        <Card className="px-5 py-4 mb-5">
          <div className="grid md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-[12px] font-semibold text-body-soft">Name</label>
              <input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Shop rent" />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-body-soft">What for</label>
              <select className={input} value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
                <option value="">Choose…</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-body-soft">Paid from</label>
              <select className={input} value={f.paidFromId} onChange={(e) => setF({ ...f, paidFromId: e.target.value })}>
                <option value="">Choose…</option>
                {money.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-body-soft">Amount (৳)</label>
              <input className={input} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-body-soft">Day of month</label>
              <input className={input} value={f.dayOfMonth} onChange={(e) => setF({ ...f, dayOfMonth: e.target.value })} placeholder="1–28" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button className={btnPrimary} style={btnPrimaryStyle} disabled={!f.name || !f.accountId || !f.paidFromId || toPaisa(f.amount) <= 0}
              onClick={async () => {
                try {
                  await createFinanceRecurring({ name: f.name, accountId: f.accountId, paidFromId: f.paidFromId, amountPaisa: toPaisa(f.amount), dayOfMonth: Number(f.dayOfMonth || "1") });
                  setF({ name: "", accountId: "", paidFromId: "", amount: "", dayOfMonth: "1" }); setAdding(false);
                  await load(); flash("Added");
                } catch (e) { fail(e); }
              }}>Save</button>
            <button className={btnGhost} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </Card>
      )}

      {due.length > 0 && (
        <Card className="px-5 py-4 mb-6 border-[#f5d9a8] bg-[#fffdf7]">
          <div className="font-semibold text-[14px] text-purple mb-2">{due.length} due this month</div>
          {due.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-4 py-2 border-b border-[#f6f2f9] last:border-0">
              <div>
                <div className="font-semibold text-purple">{r.name} · {taka(r.amountPaisa)}</div>
                <div className="text-[12px] text-body-soft">due on day {r.dayOfMonth}</div>
              </div>
              <button className={btnPrimary} style={btnPrimaryStyle} onClick={async () => {
                try { await postFinanceRecurring(r.id, { actorName: "admin" }); await load(); flash(`${r.name} posted`); }
                catch (e) { fail(e); }
              }}>Post it</button>
            </div>
          ))}
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="text-[10.5px] uppercase tracking-[0.06em] font-bold" style={{ background: "#f3e9fa", color: "#7c1a92" }}>
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Name</th>
              <th className="text-left px-4 py-2.5 font-semibold">Day</th>
              <th className="text-right px-4 py-2.5 font-semibold">Amount</th>
              <th className="text-right px-4 py-2.5 font-semibold w-[220px]">This month</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-body-soft">Nothing set up yet</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#f3eef7]">
                <td className="px-4 py-2.5 font-semibold text-purple">{r.name}{!r.isActive && <span className="text-body-soft font-normal"> · off</span>}</td>
                <td className="px-4 py-2.5 text-body-soft">{r.dayOfMonth}</td>
                <td className="px-4 py-2.5 text-right font-bold">{taka(r.amountPaisa)}</td>
                <td className="px-4 py-2.5 text-right">
                  {r.postedThisMonth ? <span className="text-[#0f7d55] font-semibold">Posted</span>
                    : r.isDue ? <span className="text-[#b45309] font-semibold">Due</span>
                    : <span className="text-body-soft">Not yet</span>}
                  <button className="ml-3 text-[12px] text-purple font-semibold" onClick={async () => {
                    try { await updateFinanceRecurring(r.id, { isActive: !r.isActive }); await load(); } catch (e) { fail(e); }
                  }}>{r.isActive ? "Turn off" : "Turn on"}</button>
                  <button className="ml-2 text-[12px] text-[#b91c1c] font-semibold" onClick={async () => {
                    if (!window.confirm(`Remove ${r.name}?`)) return;
                    try { await deleteFinanceRecurring(r.id); await load(); } catch (e) { fail(e); }
                  }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ==================== G2 · STAFF ADVANCE & SALARY ==================== */

/*  HR-D06 — the owner's rule: no advance and no salary unless the person is
    already on the staff list. So the two name boxes that used to be here are
    gone; both forms pick from HR's payable list. That is what makes "Rakib",
    "rakib" and "Rakib Hasan" impossible to create in the first place, rather
    than something to clean up afterwards.

    Rows in the ledger from before the HR module have a name but no person
    behind them. They are shown as they are, flagged, and never guessed at —
    a posted entry is history (FIN-RULE-003). */
export function StaffMoneyLive() {
  const [rows, setRows] = useState<ApiStaffAdvance[]>([]);
  const [staff, setStaff] = useState<ApiPayableEmployee[]>([]);
  const [accs, setAccs] = useState<ApiFinanceAccount[]>([]);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  const [adv, setAdv] = useState({ employeeId: "", amount: "", accountId: "", note: "" });
  const [sal, setSal] = useState({ employeeId: "", gross: "", recover: "", accountId: "", period: "" });

  const load = useCallback(async () => {
    try {
      const [r, a, s] = await Promise.all([
        financeStaffAdvances(),
        financeAccounts(),
        hrPayable().catch(() => [] as ApiPayableEmployee[]),
      ]);
      setRows(r); setAccs(a); setStaff(s);
      const cash = a.find((x) => x.isMoneyAccount)?.id ?? "";
      setAdv((p) => ({ ...p, accountId: p.accountId || cash }));
      setSal((p) => ({ ...p, accountId: p.accountId || cash }));
    } catch (e) { setErr(e instanceof Error ? e.message : "API offline"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const money = useMemo(() => accs.filter((a) => a.isMoneyAccount && a.isActive), [accs]);
  const flash = (m: string) => { setOk(m); setErr(""); window.setTimeout(() => setOk(""), 4000); };
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : "Could not save");
  const chosen = useMemo(() => staff.find((s) => s.id === sal.employeeId), [staff, sal.employeeId]);
  const outstanding = chosen?.advanceOutstandingPaisa ?? 0;
  const legacyRows = rows.filter((r) => r.legacy && r.outstandingPaisa !== 0);

  /*  HR-R25 — leavers stay on this list while they still owe an advance, but a
      NEW advance to somebody who has gone is money you will not see again, so
      that picker leaves them out. Final salary can still go to them. */
  const picker = (value: string, onChange: (v: string) => void, includeLeavers: boolean) => {
    const options = includeLeavers ? staff : staff.filter((s) => !s.hasLeft);
    return (
      <select className={input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Pick who…</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{s.role?.name ? ` · ${s.role.name}` : ""}{s.hasLeft ? " — has left" : ""}
          </option>
        ))}
      </select>
    );
  };

  return (
    <div className={WRAP}>
      <FinHeader title="Staff advance & salary" emoji="👤" tone="sky" sub="An advance is owed back, not a cost" />
      <Flash ok={ok} err={err} />

      {staff.length === 0 && (
        <Banner tone="amber" emoji="👥" title="Nobody on the staff list yet"
          right={<Link href="/employees/new" className={btnPrimary} style={btnPrimaryStyle}>Add an employee</Link>}>
          Money can only go to a real person on the staff list — that is the rule that keeps one
          employee from becoming three spellings in the books. Add them first.
        </Banner>
      )}

      {legacyRows.length > 0 && (
        <Banner tone="slate" emoji="🕘" title="Advances from before the staff list">
          {legacyRows.map((r) => r.name).join(", ")} — {legacyRows.length === 1 ? "this row was" : "these rows were"} posted
          when the name was still typed by hand, so there is no person behind {legacyRows.length === 1 ? "it" : "them"}.
          The books stay exactly as they were posted. Settle {legacyRows.length === 1 ? "it" : "them"} the old way, or
          leave {legacyRows.length === 1 ? "it" : "them"} as history.
        </Banner>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card className="px-5 py-4">
          <h3 className="font-display text-[17px] text-purple mt-0 mb-3">Give an advance</h3>
          <Lbl>Who</Lbl>
          {picker(adv.employeeId, (v) => setAdv({ ...adv, employeeId: v }), false)}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <Lbl>Amount (৳)</Lbl>
              <input className={input} value={adv.amount} onChange={(e) => setAdv({ ...adv, amount: e.target.value })} />
            </div>
            <div>
              <Lbl>From</Lbl>
              <select className={input} value={adv.accountId} onChange={(e) => setAdv({ ...adv, accountId: e.target.value })}>
                {money.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <button className={`${btnPrimary} mt-3`} style={btnPrimaryStyle} disabled={!adv.employeeId || toPaisa(adv.amount) <= 0}
            onClick={async () => {
              try {
                await giveStaffAdvance({ employeeId: adv.employeeId, amountPaisa: toPaisa(adv.amount), accountId: adv.accountId, note: adv.note || null });
                setAdv({ ...adv, amount: "", note: "" }); await load(); flash("Advance given");
              } catch (e) { fail(e); }
            }}>Give advance</button>
        </Card>

        <Card className="px-5 py-4">
          <h3 className="font-display text-[17px] text-purple mt-0 mb-1">Pay one salary</h3>
          <p className="text-[12px] text-body-soft mt-0 mb-3">
            Monthly payroll is <Link href="/employees/payroll" className="text-orchid">Staff → Payroll</Link>.
          </p>
          <Lbl>Who</Lbl>
          {picker(sal.employeeId, (v) => {
            const s = staff.find((x) => x.id === v);
            setSal({ ...sal, employeeId: v, gross: s && s.payType === "MONTHLY" ? String(s.ratePaisa / 100) : sal.gross });
          }, true)}
          {chosen?.hasLeft && (
            <div className="text-[12px] mt-1" style={{ color: TONE.amber.text }}>
              {chosen.name} has left — this is a final settlement.
            </div>
          )}
          {chosen && outstanding > 0 && (
            <div className="text-[12px] text-[#b45309] font-semibold mt-1">Advance outstanding: {taka(outstanding)}</div>
          )}
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div>
              <Lbl>Salary (৳)</Lbl>
              <input className={input} value={sal.gross} onChange={(e) => setSal({ ...sal, gross: e.target.value })} />
            </div>
            <div>
              <Lbl>Deduct advance</Lbl>
              <input className={input} value={sal.recover} onChange={(e) => setSal({ ...sal, recover: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Lbl>From</Lbl>
              <select className={input} value={sal.accountId} onChange={(e) => setSal({ ...sal, accountId: e.target.value })}>
                {money.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <div className="text-[12.5px] text-body-soft mt-2">
            Actually handed over: <b className="text-purple">{taka(Math.max(0, toPaisa(sal.gross) - toPaisa(sal.recover)))}</b>
          </div>
          {toPaisa(sal.recover) > outstanding && (
            <div className="text-[12px] font-semibold mt-1" style={{ color: TONE.rose.bg }}>
              That is more advance than {chosen?.name ?? "this person"} owes.
            </div>
          )}
          <button className={`${btnPrimary} mt-3`} style={btnPrimaryStyle}
            disabled={!sal.employeeId || toPaisa(sal.gross) <= 0 || toPaisa(sal.recover) > outstanding}
            onClick={async () => {
              try {
                await payStaffSalary({ employeeId: sal.employeeId, grossPaisa: toPaisa(sal.gross), recoverAdvancePaisa: toPaisa(sal.recover), accountId: sal.accountId, period: sal.period || undefined });
                setSal({ ...sal, gross: "", recover: "" }); await load(); flash("Salary paid");
              } catch (e) { fail(e); }
            }}>Pay salary</button>
        </Card>
      </div>

      <h2 className="font-display text-[19px] text-purple mb-3 flex items-center gap-2"><span className="w-1.5 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#a021b8,#d98cb3)" }} />Who owes what</h2>
      <Card className="overflow-hidden">
        <Table head={<><Th>Staff</Th><Th right>Given</Th><Th right>Deducted</Th><Th right>Still owed</Th></>}>
          {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-body-soft">No advances yet</td></tr>}
          {rows.map((r) => (
            <tr key={r.employeeId ?? `legacy:${r.name}`}>
              <Td>
                {r.employeeId ? (
                  <Link href={`/employees/${r.employeeId}`} className="no-underline"><b className="text-purple">{r.name}</b></Link>
                ) : (
                  <b className="text-purple">{r.name}</b>
                )}
                {r.legacy
                  ? <Chip tone="slate">before the staff list</Chip>
                  : r.designation
                    ? <span className="block text-[11.5px] text-body-soft">{r.designation}</span>
                    : null}
              </Td>
              <Td right className="text-body-soft">{taka(r.givenPaisa)}</Td>
              <Td right className="text-body-soft">{taka(r.recoveredPaisa)}</Td>
              <Td right>
                <b style={{ color: r.outstandingPaisa > 0 ? "#b45309" : "#0f7d55" }}>{taka(r.outstandingPaisa)}</b>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

/* ==================== G6 · ACCOUNTANT MODE ==================== */

type JLine = { accountId: string; debit: string; credit: string; note: string };

export function AccountantJournalLive() {
  const [accs, setAccs] = useState<ApiFinanceAccount[]>([]);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState("");
  const [actor, setActor] = useState("");
  const [lines, setLines] = useState<JLine[]>([
    { accountId: "", debit: "", credit: "", note: "" },
    { accountId: "", debit: "", credit: "", note: "" },
  ]);

  useEffect(() => { void (async () => { try { setAccs(await financeAccounts()); } catch { setErr("API offline"); } })(); }, []);

  const debit = lines.reduce((n, l) => n + toPaisa(l.debit), 0);
  const credit = lines.reduce((n, l) => n + toPaisa(l.credit), 0);
  const balanced = debit === credit && debit > 0;

  const set = (i: number, patch: Partial<JLine>) =>
    setLines((prev) => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  return (
    <div className={WRAP}>
      <FinHeader title="Manual journal" emoji="⚖" tone="slate" sub="Debit and credit — entries are permanent" />
      <Flash ok={ok} err={err} />

      <Card className="px-5 py-4">
        <div className="grid md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="text-[12px] font-semibold text-body-soft">Date</label>
            <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-[12px] font-semibold text-body-soft">Why</label>
            <input className={input} value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Year-end depreciation adjustment" />
          </div>
          <div>
            <label className="text-[12px] font-semibold text-body-soft">Entered by</label>
            <input className={input} value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Name" />
          </div>
        </div>

        <table className="w-full text-[13px] mb-3">
          <thead className="text-body-soft text-[11.5px] uppercase tracking-[0.04em]">
            <tr>
              <th className="text-left py-2 font-semibold">Account</th>
              <th className="text-right py-2 font-semibold w-[140px]">Debit</th>
              <th className="text-right py-2 font-semibold w-[140px]">Credit</th>
              <th className="text-left py-2 font-semibold w-[200px]">Note</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="py-1.5 pr-2">
                  <select className={input} value={l.accountId} onChange={(e) => set(i, { accountId: e.target.value })}>
                    <option value="">Choose…</option>
                    {accs.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                  </select>
                </td>
                <td className="py-1.5 px-1"><input className={`${input} text-right`} value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: "" })} /></td>
                <td className="py-1.5 px-1"><input className={`${input} text-right`} value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: "" })} /></td>
                <td className="py-1.5 pl-2"><input className={input} value={l.note} onChange={(e) => set(i, { note: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <button className={btnGhost} onClick={() => setLines([...lines, { accountId: "", debit: "", credit: "", note: "" }])}>
            <Icon name="plus" size={14} /> Add line
          </button>
          <div className="text-[13px]">
            Debit <b>{taka(debit)}</b> · Credit <b>{taka(credit)}</b>{" "}
            <span className="ml-2 font-semibold" style={{ color: balanced ? "#0f7d55" : "#b91c1c" }}>
              {balanced ? "balanced" : `out by ${taka(Math.abs(debit - credit))}`}
            </span>
          </div>
          <button className={btnPrimary} style={btnPrimaryStyle} disabled={!balanced || !narration.trim()}
            onClick={async () => {
              try {
                await financeManualJournal({
                  entryDate: date,
                  narration,
                  actorName: actor || "accountant",
                  lines: lines.filter((l) => l.accountId && (toPaisa(l.debit) > 0 || toPaisa(l.credit) > 0))
                    .map((l) => ({ accountId: l.accountId, debitPaisa: toPaisa(l.debit), creditPaisa: toPaisa(l.credit), note: l.note || null })),
                });
                setLines([{ accountId: "", debit: "", credit: "", note: "" }, { accountId: "", debit: "", credit: "", note: "" }]);
                setNarration(""); setOk("Journal posted"); setErr("");
                window.setTimeout(() => setOk(""), 4000);
              } catch (e) { setErr(e instanceof Error ? e.message : "Could not post"); }
            }}>
            Post journal
          </button>
        </div>
      </Card>
    </div>
  );
}
