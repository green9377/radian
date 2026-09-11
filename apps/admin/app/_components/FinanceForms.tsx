"use client";

/*
  Finance — the four things the owner enters by hand (W2 of the architecture):
  expense · other income · moving money between our own accounts · partner capital.
  Everything else is posted by the operational modules.
  Double entry stays in the API — no Dr/Cr wording here (DEC-FIN-001).
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import { useAuth } from "./AuthGate";
import {
  ApiExpense,
  ApiFinanceAccount,
  ApiIncome,
  ApiPartner,
  ApiTransfer,
  approveFinanceExpense,
  createFinanceExpense,
  createFinanceIncome,
  createFinancePartner,
  createFinanceTransfer,
  declineFinanceExpense,
  deleteFinanceExpense,
  financeAccounts,
  financeExpenses,
  financeIncomes,
  financePartnerTxn,
  financePartners,
  financeSettings,
  financeTransfers,
  formatTaka,
  listCampaigns,
  updateFinancePartner,
  apiGet,
  apiPost,
} from "../_data/api";

/** what the server proposes for this month's profit split (server-side maths,
    FIN-RULE-016 — the screen never recomputes it) */
interface Share {
  profitPaisa: number; cashAvailablePaisa: number; payoutPaisa: number; enoughCash: boolean;
  plan: { partnerId: string; name: string; bonusPaisa: number; capitalReturnPaisa: number; profitSharePaisa: number; totalPaisa: number }[];
}
import {
  Bar, Banner, Card, Chip, Empty, FinHeader, Flash, Kpi, Lbl, Panel, Table, Tabs, Td, Th, TONE, WRAP,
  btnGhost, btnPrimary, btnPrimaryStyle, input, taka, toPaisa, todayStr,
} from "./FinanceUI";




/* ==================== EXPENSES ==================== */

export function ExpensesLive() {
  /*  ⚠️ WHO APPROVED IT IS NOT SOMETHING TO TYPE — 31 Aug 2026. This asked
      `window.prompt("Approved by (your name)")` and fell back to the literal
      string "admin" when it was dismissed. An approval on MONEY whose
      signature is free text, with a default, is not an approval anybody can
      stand behind later. The session knows who is signed in.  */
  const { me } = useAuth();
  const [rows, setRows] = useState<ApiExpense[]>([]);
  const [accs, setAccs] = useState<ApiFinanceAccount[]>([]);
  const [threshold, setThreshold] = useState(0);
  const [offline, setOffline] = useState(false);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  const [form, setForm] = useState({ spentAt: todayStr(), accountId: "", paidFromId: "", amount: "", payeeName: "", note: "", campaignId: "" });
  // MKT-D05 — the campaign tag lives HERE, on the money, because Finance owns
  // the money. Marketing only reads the sum back. Two ledgers for one taka
  // never reconcile, so there is only ever one.
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; campaignNo: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const [e, a, s] = await Promise.all([financeExpenses(), financeAccounts(), financeSettings()]);
      setRows(e); setAccs(a); setThreshold(s.expenseApprovalThresholdPaisa); setOffline(false);
    } catch { setOffline(true); }
    // a missing Marketing module must not break the expense form
    try { setCampaigns(await listCampaigns({ status: "RUNNING" })); } catch { setCampaigns([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  /*  MKT-D20 — arriving from the Meta ad screen with the figure already in
      hand. Read from window.location rather than useSearchParams, which would
      force a Suspense boundary on this page for no benefit.

      Note what is NOT prefilled: the money account and the category. Those are
      decisions about the books, and the person recording the expense makes
      them. And when the ad account bills in dollars the amount arrives empty
      on purpose — a dollar figure sitting in a taka field is exactly the
      mistake that screen exists to prevent. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (![...q.keys()].length) return;
    setForm((f) => ({
      ...f,
      amount: q.get("amount") ?? f.amount,
      payeeName: q.get("payee") ?? f.payeeName,
      note: q.get("note") ?? f.note,
      campaignId: q.get("campaignId") ?? f.campaignId,
    }));
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const categories = useMemo(() => accs.filter((a) => a.type === "EXPENSE" && a.isActive), [accs]);
  const money = useMemo(() => accs.filter((a) => a.isMoneyAccount && a.isActive), [accs]);
  const pending = rows.filter((r) => r.approval === "PENDING");
  const amountPaisa = toPaisa(form.amount);
  const willNeedApproval = threshold > 0 && amountPaisa >= threshold;

  const flash = (m: string) => { setOk(m); setErr(""); window.setTimeout(() => setOk(""), 4000); };
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : "Could not save");

  const save = async () => {
    try {
      await createFinanceExpense({
        spentAt: form.spentAt, accountId: form.accountId, paidFromId: form.paidFromId,
        amountPaisa, payeeName: form.payeeName || null, note: form.note || null,
        campaignId: form.campaignId || null, actorName: "admin",
      });
      setForm({ ...form, amount: "", payeeName: "", note: "" });
      await load();
      flash(willNeedApproval ? "Saved — waiting for the other partner to approve" : "Expense recorded");
    } catch (e) { fail(e); }
  };

  return (
    <div className={WRAP}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <FinHeader title="Expenses" emoji="🧾" tone="amber" />
        {offline && <Chip tone="amber">API offline</Chip>}
      </div>
      <Flash ok={ok} err={err} />

      <Card className="px-5 py-4 mb-6" tone="brand" style={{ background: "#fdfaff" }}>
        <div className="grid md:grid-cols-6 gap-3 items-end">
          <div>
            <label className="text-[12px] font-semibold text-body-soft">Date</label>
            <input type="date" className={input} value={form.spentAt} onChange={(e) => setForm({ ...form, spentAt: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="text-[12px] font-semibold text-body-soft">What for</label>
            <select className={input} value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.costBehavior === "FIXED" ? " (fixed)" : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-body-soft">Paid from</label>
            <select className={input} value={form.paidFromId} onChange={(e) => setForm({ ...form, paidFromId: e.target.value })}>
              <option value="">Choose…</option>
              {money.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-body-soft">Amount (৳)</label>
            <input className={input} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
          </div>
          <div>
            <label className="text-[12px] font-semibold text-body-soft">Paid to</label>
            <input className={input} value={form.payeeName} onChange={(e) => setForm({ ...form, payeeName: e.target.value })} placeholder="Optional" />
          </div>
        </div>
        <div className="grid md:grid-cols-6 gap-3 items-end mt-3">
          <div className="md:col-span-2">
            <label className="text-[12px] font-semibold text-body-soft">Note</label>
            <input className={input} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional" />
          </div>
          {/* MKT-D05 — optional. Blank is a perfectly good answer; the expense is
              still correctly in the books, it just is not counted against any campaign. */}
          <div className="md:col-span-2">
            <label className="text-[12px] font-semibold text-body-soft">
              For which campaign? <span className="font-normal text-body-soft">(optional)</span>
            </label>
            <select className={input} value={form.campaignId} onChange={(e) => setForm({ ...form, campaignId: e.target.value })}>
              <option value="">Not part of a campaign</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => void save()} disabled={!form.accountId || !form.paidFromId || amountPaisa <= 0}>
              Record expense
            </button>
            {willNeedApproval && <span className="text-[12px] text-[#b45309] font-semibold">Needs approval</span>}
          </div>
        </div>
      </Card>

      {pending.length > 0 && (
        <>
          <h2 className="font-display text-[19px] text-purple mb-3 flex items-center gap-2"><span className="w-1.5 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#a021b8,#d98cb3)" }} />Waiting for approval</h2>
          <Card className="overflow-hidden mb-7">
            {pending.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3 border-b border-[#f6f2f9] last:border-0">
                <div>
                  <div className="font-semibold text-purple">{taka(r.amountPaisa)} · {r.account?.name}</div>
                  <div className="text-[12px] text-body-soft">
                    {r.expenseNo} · {r.spentAt.slice(0, 10)} · from {r.paidFrom?.name}{r.payeeName ? ` · to ${r.payeeName}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className={btnPrimary} style={btnPrimaryStyle} onClick={async () => { try { await approveFinanceExpense(r.id, { actorName: me?.name ?? "Admin" }); await load(); flash("Approved and recorded"); } catch (e) { fail(e); } }}>Approve</button>
                  <button className={btnGhost} onClick={async () => { try { await declineFinanceExpense(r.id, { actorName: "admin" }); await load(); flash("Declined"); } catch (e) { fail(e); } }}>Decline</button>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      <h2 className="font-display text-[19px] text-purple mb-3 flex items-center gap-2"><span className="w-1.5 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#a021b8,#d98cb3)" }} />Recorded</h2>
      <Card className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="text-[10.5px] uppercase tracking-[0.06em] font-bold" style={{ background: "#f3e9fa", color: "#7c1a92" }}>
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold w-[110px]">No</th>
              <th className="text-left px-4 py-2.5 font-semibold w-[100px]">Date</th>
              <th className="text-left px-4 py-2.5 font-semibold">What for</th>
              <th className="text-left px-4 py-2.5 font-semibold">Paid from</th>
              <th className="text-right px-4 py-2.5 font-semibold w-[120px]">Amount</th>
              <th className="text-right px-4 py-2.5 font-semibold w-[110px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-body-soft">Nothing recorded yet</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#f3eef7]">
                <td className="px-4 py-2.5 font-semibold text-purple">{r.expenseNo}</td>
                <td className="px-4 py-2.5 text-body-soft">{r.spentAt.slice(0, 10)}</td>
                <td className="px-4 py-2.5">
                  {r.account?.name}
                  {r.note && <span className="text-[11.5px] text-body-soft ml-2">{r.note}</span>}
                </td>
                <td className="px-4 py-2.5 text-body-soft">{r.paidFrom?.name}</td>
                <td className="px-4 py-2.5 text-right font-bold">{taka(r.amountPaisa)}</td>
                <td className="px-4 py-2.5 text-right">
                  {r.journalEntryId ? <span className="text-[#0f7d55] font-semibold">In the books</span>
                    : r.approval === "PENDING" ? <span className="text-[#b45309] font-semibold">Waiting</span>
                    : <span className="text-body-soft">{r.approval.toLowerCase()}</span>}
                  {!r.journalEntryId && r.approval !== "PENDING" && (
                    <button className="ml-2 text-[12px] text-[#b91c1c] font-semibold"
                      onClick={async () => { if (!window.confirm("Remove this?")) return; try { await deleteFinanceExpense(r.id); await load(); } catch (e) { fail(e); } }}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ==================== INCOME + TRANSFER ==================== */

export function IncomeLive() {
  const [rows, setRows] = useState<ApiIncome[]>([]);
  const [trs, setTrs] = useState<ApiTransfer[]>([]);
  const [accs, setAccs] = useState<ApiFinanceAccount[]>([]);
  const [offline, setOffline] = useState(false);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  const [form, setForm] = useState({ earnedAt: todayStr(), accountId: "", receivedInId: "", amount: "", payerName: "", note: "" });
  const [mv, setMv] = useState({ movedAt: todayStr(), fromId: "", toId: "", amount: "", fee: "", note: "" });

  const load = useCallback(async () => {
    try {
      const [i, t, a] = await Promise.all([financeIncomes(), financeTransfers(), financeAccounts()]);
      setRows(i); setTrs(t); setAccs(a); setOffline(false);
    } catch { setOffline(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const headings = useMemo(() => accs.filter((a) => a.type === "INCOME" && a.isActive && a.code !== "4000"), [accs]);
  const money = useMemo(() => accs.filter((a) => a.isMoneyAccount && a.isActive), [accs]);
  const flash = (m: string) => { setOk(m); setErr(""); window.setTimeout(() => setOk(""), 4000); };
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : "Could not save");

  return (
    <div className={WRAP}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <FinHeader title="Money in & moving" emoji="🔁" tone="emerald" />
        {offline && <Chip tone="amber">API offline</Chip>}
      </div>
      <Flash ok={ok} err={err} />

      <h2 className="font-display text-[19px] text-purple mb-3 flex items-center gap-2"><span className="w-1.5 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#a021b8,#d98cb3)" }} />Move money between your accounts</h2>
      <Card className="px-5 py-4 mb-7">
        <div className="grid md:grid-cols-6 gap-3 items-end">
          <div>
            <label className="text-[12px] font-semibold text-body-soft">Date</label>
            <input type="date" className={input} value={mv.movedAt} onChange={(e) => setMv({ ...mv, movedAt: e.target.value })} />
          </div>
          <div>
            <label className="text-[12px] font-semibold text-body-soft">From</label>
            <select className={input} value={mv.fromId} onChange={(e) => setMv({ ...mv, fromId: e.target.value })}>
              <option value="">Choose…</option>
              {money.map((m) => <option key={m.id} value={m.id}>{m.name} — {taka(m.balancePaisa)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-body-soft">To</label>
            <select className={input} value={mv.toId} onChange={(e) => setMv({ ...mv, toId: e.target.value })}>
              <option value="">Choose…</option>
              {money.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-body-soft">Amount (৳)</label>
            <input className={input} value={mv.amount} onChange={(e) => setMv({ ...mv, amount: e.target.value })} placeholder="0" />
          </div>
          <div>
            <label className="text-[12px] font-semibold text-body-soft">Charge (৳)</label>
            <input className={input} value={mv.fee} onChange={(e) => setMv({ ...mv, fee: e.target.value })} placeholder="0" />
          </div>
          <div>
            <button className={btnPrimary} style={btnPrimaryStyle}
              disabled={!mv.fromId || !mv.toId || toPaisa(mv.amount) <= 0}
              onClick={async () => {
                try {
                  await createFinanceTransfer({ movedAt: mv.movedAt, fromId: mv.fromId, toId: mv.toId, amountPaisa: toPaisa(mv.amount), feePaisa: toPaisa(mv.fee), note: mv.note || null, actorName: "admin" });
                  setMv({ ...mv, amount: "", fee: "", note: "" });
                  await load(); flash("Money moved");
                } catch (e) { fail(e); }
              }}>
              Move money
            </button>
          </div>
        </div>
        <p className="text-[12px] text-body-soft mt-2 mb-0">
          The cash-out charge (bKash agent fee etc) is recorded as a bank charge — it is a real cost.
        </p>
      </Card>

      {trs.length > 0 && (
        <Card className="overflow-hidden mb-8">
          <table className="w-full text-[13px]">
            <tbody>
              {trs.map((t) => (
                <tr key={t.id} className="border-b border-[#f6f2f9] last:border-0">
                  <td className="px-4 py-2.5 w-[110px] font-semibold text-purple">{t.transferNo}</td>
                  <td className="px-4 py-2.5 w-[100px] text-body-soft">{t.movedAt.slice(0, 10)}</td>
                  <td className="px-4 py-2.5">{t.from?.name} → <b>{t.to?.name}</b>{t.note ? <span className="text-[11.5px] text-body-soft ml-2">{t.note}</span> : null}</td>
                  <td className="px-4 py-2.5 w-[110px] text-right text-body-soft">{t.feePaisa > 0 ? `charge ${taka(t.feePaisa)}` : ""}</td>
                  <td className="px-4 py-2.5 w-[120px] text-right font-bold">{taka(t.amountPaisa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <h2 className="font-display text-[19px] text-purple mb-3 flex items-center gap-2"><span className="w-1.5 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#a021b8,#d98cb3)" }} />Other income</h2>
      <Card className="px-5 py-4 mb-6" tone="brand" style={{ background: "#fdfaff" }}>
        <div className="grid md:grid-cols-6 gap-3 items-end">
          <div>
            <label className="text-[12px] font-semibold text-body-soft">Date</label>
            <input type="date" className={input} value={form.earnedAt} onChange={(e) => setForm({ ...form, earnedAt: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="text-[12px] font-semibold text-body-soft">What kind</label>
            <select className={input} value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
              <option value="">Choose…</option>
              {headings.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-body-soft">Received in</label>
            <select className={input} value={form.receivedInId} onChange={(e) => setForm({ ...form, receivedInId: e.target.value })}>
              <option value="">Choose…</option>
              {money.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-semibold text-body-soft">Amount (৳)</label>
            <input className={input} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
          </div>
          <div>
            <button className={btnPrimary} style={btnPrimaryStyle}
              disabled={!form.accountId || !form.receivedInId || toPaisa(form.amount) <= 0}
              onClick={async () => {
                try {
                  await createFinanceIncome({ earnedAt: form.earnedAt, accountId: form.accountId, receivedInId: form.receivedInId, amountPaisa: toPaisa(form.amount), payerName: form.payerName || null, note: form.note || null, actorName: "admin" });
                  setForm({ ...form, amount: "", payerName: "", note: "" });
                  await load(); flash("Income recorded");
                } catch (e) { fail(e); }
              }}>
              Record income
            </button>
          </div>
        </div>
        <p className="text-[12px] text-body-soft mt-2 mb-0">Sales are not entered here — they arrive from Orders and POS.</p>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-[13px]">
          <tbody>
            {rows.length === 0 && <tr><td className="px-4 py-6 text-center text-body-soft">No other income yet</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[#f6f2f9] last:border-0">
                <td className="px-4 py-2.5 w-[110px] font-semibold text-purple">{r.incomeNo}</td>
                <td className="px-4 py-2.5 w-[100px] text-body-soft">{r.earnedAt.slice(0, 10)}</td>
                <td className="px-4 py-2.5">{r.account?.name}{r.note ? <span className="text-[11.5px] text-body-soft ml-2">{r.note}</span> : null}</td>
                <td className="px-4 py-2.5 text-body-soft">into {r.receivedIn?.name}</td>
                <td className="px-4 py-2.5 w-[120px] text-right font-bold">{taka(r.amountPaisa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ==================== PARTNERS ==================== */

const KIND_LABEL: Record<string, string> = {
  CAPITAL_IN: "Put money in",
  CAPITAL_RETURN: "Capital returned",
  DRAWING: "Took money out",
  SALARY: "Salary",
};

export function PartnersLive() {
  /** which partner figure is being typed, in the open rather than in a prompt */
  const [editing, setEditing] = useState<{ id: string; field: "share" | "salary"; value: string } | null>(null);
  const [rows, setRows] = useState<ApiPartner[]>([]);
  const [accs, setAccs] = useState<ApiFinanceAccount[]>([]);
  const [offline, setOffline] = useState(false);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [np, setNp] = useState({ name: "", kind: "CAPITAL", share: "", salary: "" });
  const [txn, setTxn] = useState<{ partner: ApiPartner; kind: string } | null>(null);
  const [share, setShare] = useState<Share | null>(null);
  const [tAmount, setTAmount] = useState(""); const [tAcc, setTAcc] = useState(""); const [tNote, setTNote] = useState("");

  async function saveEdit(p: ApiPartner) {
    if (!editing) return;
    const n = Number(editing.value);
    if (!Number.isFinite(n) || n < 0) { setErr("That is not a number."); return; }
    if (editing.field === "share" && n > 100) { setErr("A share cannot be more than 100%."); return; }
    try {
      await updateFinancePartner(
        p.id,
        editing.field === "share"
          ? { sharePercentBp: Math.round(n * 100) }
          : { monthlySalaryPaisa: toPaisa(editing.value) },
      );
      setEditing(null);
      await load();
      setOk(editing.field === "share" ? `${p.name}'s share is now ${n}%.` : `${p.name}'s salary is now ${taka(toPaisa(editing.value))}.`);
    } catch (e) { fail(e); }
  }

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([financePartners(), financeAccounts()]);
      setRows(p); setAccs(a); setOffline(false);
      if (!tAcc) setTAcc(a.find((x) => x.isMoneyAccount)?.id ?? "");
    } catch { setOffline(true); }
  }, [tAcc]);
  useEffect(() => { void load(); }, [load]);

  const money = useMemo(() => accs.filter((a) => a.isMoneyAccount && a.isActive), [accs]);
  const flash = (m: string) => { setOk(m); setErr(""); window.setTimeout(() => setOk(""), 4000); };
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : "Could not save");

  const totalCapital = rows.reduce((n, p) => n + p.capitalOutstandingPaisa, 0);

  return (
    <div className={WRAP}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <FinHeader title="Partners" emoji="🤝" tone="brand" />
        <div className="flex items-center gap-2">
          {offline && <Chip tone="amber">API offline</Chip>}
          <button className={btnGhost} onClick={() => setAdding((v) => !v)}><Icon name="plus" size={14} /> Add partner</button>
        </div>
      </div>
      <Flash ok={ok} err={err} />

      {adding && (
        <Card className="px-5 py-4 mb-5">
          <div className="grid md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="text-[12px] font-semibold text-body-soft">Name</label>
              <input className={input} value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-body-soft">Type</label>
              <select className={input} value={np.kind} onChange={(e) => setNp({ ...np, kind: e.target.value })}>
                <option value="CAPITAL">Puts in money</option>
                <option value="LABOUR">Runs the business</option>
                <option value="BOTH">Both</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-body-soft">Profit share (%)</label>
              <input className={input} value={np.share} onChange={(e) => setNp({ ...np, share: e.target.value })} placeholder="50" />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-body-soft">Monthly salary (৳)</label>
              <input className={input} value={np.salary} onChange={(e) => setNp({ ...np, salary: e.target.value })} placeholder="0" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button className={btnPrimary} style={btnPrimaryStyle} disabled={!np.name.trim()}
              onClick={async () => {
                try {
                  await createFinancePartner({ name: np.name, kind: np.kind, sharePercentBp: Math.round(Number(np.share || "0") * 100), monthlySalaryPaisa: toPaisa(np.salary) });
                  setNp({ name: "", kind: "CAPITAL", share: "", salary: "" }); setAdding(false);
                  await load(); flash("Partner added");
                } catch (e) { fail(e); }
              }}>Save</button>
            <button className={btnGhost} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </Card>
      )}

      {rows.length === 0 && !offline && (
        <Card className="px-5 py-6 text-center text-body-soft">
          No partners yet. Add each partner, then record what they put into the business.
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {rows.map((p) => (
          <Card key={p.id} className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-[18px] text-purple">{p.name}</div>
                <div className="text-[12px] text-body-soft">
                  {p.kind === "CAPITAL" ? "Puts in money" : p.kind === "LABOUR" ? "Runs the business" : "Both"}
                  {p.sharePercentBp > 0 ? ` · ${p.sharePercentBp / 100}% of profit` : ""}
                  {p.monthlySalaryPaisa > 0 ? ` · salary ${taka(p.monthlySalaryPaisa)}/month` : ""}
                </div>
              </div>
              <select className="border border-[#e7dff0] rounded-lg px-2 py-1 text-[12px] bg-white"
                value="" onChange={(e) => { if (e.target.value) { setTxn({ partner: p, kind: e.target.value }); setTAmount(""); setTNote(""); } }}>
                <option value="">Record…</option>
                <option value="CAPITAL_IN">Put money in</option>
                <option value="SALARY">Pay salary</option>
                <option value="DRAWING">Took money out</option>
                <option value="CAPITAL_RETURN">Return capital</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.04em] text-body-soft font-semibold">Put in</div>
                <div className="text-[17px] font-bold text-purple">{taka(p.capitalInPaisa)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.04em] text-body-soft font-semibold">Still owed back</div>
                <div className="text-[17px] font-bold" style={{ color: p.capitalOutstandingPaisa > 0 ? "#b45309" : "#0f7d55" }}>
                  {taka(p.capitalOutstandingPaisa)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.04em] text-body-soft font-semibold">Salary paid</div>
                <div className="text-[15px] font-semibold text-body-soft">{taka(p.salaryPaidPaisa)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.04em] text-body-soft font-semibold">Taken out</div>
                <div className="text-[15px] font-semibold text-body-soft">{taka(p.drawingsPaisa)}</div>
              </div>
            </div>

            {p.transactions.length > 0 && (
              <div className="mt-4 border-t border-[#f3eef7] pt-3">
                {p.transactions.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex justify-between text-[12.5px] py-0.5">
                    <span className="text-body-soft">{t.happenedAt.slice(0, 10)} · {KIND_LABEL[t.kind] ?? t.kind}</span>
                    <span className="font-semibold">{taka(t.amountPaisa)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex gap-2">
              {/*  ⚠️ A PARTNER'S SHARE AND SALARY ARE NOT PROMPT MATERIAL —
                   31 Aug 2026. Both were `window.prompt()`: the page froze
                   while it waited, Escape threw the number away, and a figure
                   that decides how the profit is split got no chance to be
                   read back before it was saved. They are typed in the open
                   now, with Enter to save and Escape to leave it alone.  */}
              {editing?.id === p.id ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-[12px] text-body-soft font-semibold">{editing.field === "share" ? "Share %" : "Salary ৳"}</span>
                  <input
                    autoFocus
                    className="ipt h-[34px] w-[110px]"
                    value={editing.value}
                    onChange={(e) => setEditing({ ...editing, value: e.target.value.replace(/[^\d.]/g, "") })}
                    onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(p); if (e.key === "Escape") setEditing(null); }}
                  />
                  <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => void saveEdit(p)}>Save</button>
                  <button className={btnGhost} onClick={() => setEditing(null)}>Cancel</button>
                </span>
              ) : (
                <>
                  <button className={btnGhost} onClick={() => setEditing({ id: p.id, field: "share", value: String(p.sharePercentBp / 100) })}>Edit share</button>
                  <button className={btnGhost} onClick={() => setEditing({ id: p.id, field: "salary", value: String(p.monthlySalaryPaisa / 100) })}>Edit salary</button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      {rows.length > 0 && (
        <Card className="px-5 py-4 mt-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-[13px] text-body-soft">
              Capital still to be repaid across all partners:{" "}
              <b className="text-purple text-[15px]">{taka(totalCapital)}</b>
              {" "}— profit goes here first, before any share is split (locked rule).
            </div>
            <button className={btnGhost} onClick={async () => {
              try {
                setShare(await apiGet<Share>("/finance/distribution/preview"));
              } catch (e) { fail(e); }
            }}>Share this month&apos;s profit</button>
          </div>

          {share && (
            <div className="mt-4 border-t border-[#f3eef7] pt-4">
              <div className="text-[13px] mb-2">
                This month left over: <b style={{ color: share.profitPaisa < 0 ? "#b91c1c" : "#0f7d55" }}>{taka(share.profitPaisa)}</b>
                {share.profitPaisa > 0 && <> · in hand: <b>{taka(share.cashAvailablePaisa)}</b></>}
              </div>
              {share.profitPaisa <= 0 ? (
                <p className="text-[13px] text-body-soft m-0">Nothing to share this month — there was no profit.</p>
              ) : (
                <>
                  {share.plan.map((p) => (
                    <div key={p.partnerId} className="flex justify-between text-[13px] py-1">
                      <span className="text-body-soft">
                        {p.name}
                        {p.capitalReturnPaisa > 0 && <span className="text-[11.5px]"> · {taka(p.capitalReturnPaisa)} capital back</span>}
                        {p.bonusPaisa > 0 && <span className="text-[11.5px]"> · {taka(p.bonusPaisa)} bonus</span>}
                        {p.profitSharePaisa > 0 && <span className="text-[11.5px]"> · {taka(p.profitSharePaisa)} share</span>}
                      </span>
                      <b>{taka(p.totalPaisa)}</b>
                    </div>
                  ))}
                  <div className="mt-3 flex gap-2 items-center">
                    <button className={btnPrimary} style={btnPrimaryStyle} disabled={!share.enoughCash}
                      onClick={async () => {
                        if (!window.confirm("Pay this out now? It is written into the books and cannot be edited.")) return;
                        try {
                          // actorName is set by the server from the session — never sent from here
                          await apiPost("/finance/distribution", {});
                          setShare(null); await load(); flash("Profit shared");
                        } catch (e) { fail(e); }
                      }}>Pay it out</button>
                    <button className={btnGhost} onClick={() => setShare(null)}>Close</button>
                    {!share.enoughCash && <span className="text-[12.5px] text-[#b91c1c] font-semibold">Not enough cash in hand to pay this</span>}
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      )}

      {txn && (
        <Card className="px-5 py-4 mt-5 border-[#e7dff0]">
          <div className="font-semibold text-[14px] text-purple mb-1">
            {KIND_LABEL[txn.kind]} — {txn.partner.name}
          </div>
          <p className="text-[12.5px] text-body-soft mt-0 mb-3">
            {txn.kind === "SALARY"
              ? "A business cost — it reduces profit."
              : txn.kind === "CAPITAL_IN"
              ? "Investment — it increases what the business owes this partner."
              : "Not a business cost — it reduces what the business owes this partner."}
          </p>
          <div className="grid md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-[12px] font-semibold text-body-soft">Amount (৳)</label>
              <input className={input} value={tAmount} onChange={(e) => setTAmount(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-body-soft">{txn.kind === "CAPITAL_IN" ? "Into" : "From"}</label>
              <select className={input} value={tAcc} onChange={(e) => setTAcc(e.target.value)}>
                {money.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-semibold text-body-soft">Note</label>
              <input className={input} value={tNote} onChange={(e) => setTNote(e.target.value)} placeholder="Optional" />
            </div>
            <div className="flex gap-2">
              <button className={btnPrimary} style={btnPrimaryStyle} disabled={toPaisa(tAmount) <= 0}
                onClick={async () => {
                  try {
                    await financePartnerTxn({ partnerId: txn.partner.id, kind: txn.kind, amountPaisa: toPaisa(tAmount), accountId: tAcc, note: tNote || null, actorName: "admin" });
                    setTxn(null); await load(); flash("Recorded");
                  } catch (e) { fail(e); }
                }}>Save</button>
              <button className={btnGhost} onClick={() => setTxn(null)}>Cancel</button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
