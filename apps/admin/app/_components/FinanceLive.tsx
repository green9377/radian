"use client";

/*
  Finance (ledger) — LIVE screens (:4000 /finance).
  RADIAN_FINANCE_MODULE_ARCHITECTURE.md v1.1.
  Stage 1 = money accounts + chart of accounts + opening balances +
  counting/reconciliation + raw ledger view + settings.
  Double-entry stays in the API — no Dr/Cr wording on screen (DEC-FIN-001).
  Demo-fallback + orange badge per project rule when the API is down.
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import {
  ApiFinanceAccount,
  ApiFinanceSetting,
  ApiFinanceSummary,
  ApiJournalEntry,
  ApiPostingFailure,
  ApiReconciliation,
  FIN_TYPE_META,
  FinAccountType,
  createFinanceAccount,
  financeAccounts,
  financeDemoClear,
  financeDemoSeed,
  financeFailures,
  financeLedger,
  replayFinanceFailure,
  financeReconcile,
  financeReconciliations,
  financeSettings,
  financeSummary,
  formatTaka,
  postOpeningBalances,
  updateFinanceAccount,
  updateFinanceSettings,
} from "../_data/api";
import {
  Bar, Banner, Card, Chip, Empty, FinHeader, Flash, Kpi, Lbl, Panel, Table, Tabs, Td, Th, TONE, WRAP,
  btnGhost, btnPrimary, btnPrimaryStyle, input, taka, toPaisa, todayStr,
} from "./FinanceUI";

const fromPaisa = (p: number) => (p / 100).toString();








/* ==================== ACCOUNTS ==================== */

const GROUP_ORDER: FinAccountType[] = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];

export function AccountsLive() {
  const [rows, setRows] = useState<ApiFinanceAccount[]>([]);
  const [sum, setSum] = useState<ApiFinanceSummary | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [counting, setCounting] = useState<ApiFinanceAccount | null>(null);
  const [countValue, setCountValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newAcc, setNewAcc] = useState({ code: "", name: "", type: "EXPENSE" as FinAccountType, costBehavior: "FIXED", isMoneyAccount: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, s] = await Promise.all([financeAccounts(), financeSummary()]);
      setRows(a);
      setSum(s);
      setOffline(false);
    } catch {
      setOffline(true);
      setRows([]);
      setSum(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const flash = (m: string) => { setMsg(m); setErr(""); window.setTimeout(() => setMsg(""), 4000); };
  const fail = (e: unknown) => { setErr(e instanceof Error ? e.message : "Something went wrong"); };

  const money = useMemo(() => rows.filter((r) => r.isMoneyAccount), [rows]);
  const saveOpening = async (a: ApiFinanceAccount) => {
    try {
      await updateFinanceAccount(a.id, { openingBalancePaisa: toPaisa(draft[a.id] ?? "0") });
      setEditing(null);
      await load();
      flash(`${a.name} — opening balance saved`);
    } catch (e) { fail(e); }
  };

  const doPostOpening = async () => {
    if (!window.confirm("Opening balances will be written into the ledger and can no longer be edited. Continue?")) return;
    try {
      await postOpeningBalances({ actorName: "admin" });
      await load();
      flash("Opening balances posted to the ledger");
    } catch (e) { fail(e); }
  };

  const doCount = async () => {
    if (!counting) return;
    try {
      const r = await financeReconcile({
        accountId: counting.id,
        countedBalancePaisa: toPaisa(countValue),
        actorName: "admin",
      });
      setCounting(null);
      setCountValue("");
      await load();
      flash(
        r.differencePaisa === 0
          ? "Counted — matches the books exactly"
          : `Counted — difference ${taka(r.differencePaisa)} recorded in the ledger`,
      );
    } catch (e) { fail(e); }
  };

  const doAdd = async () => {
    try {
      await createFinanceAccount({
        code: newAcc.code.trim(),
        name: newAcc.name.trim(),
        type: newAcc.type,
        isMoneyAccount: newAcc.isMoneyAccount,
        costBehavior: newAcc.type === "EXPENSE" ? newAcc.costBehavior : null,
      });
      setAdding(false);
      setNewAcc({ code: "", name: "", type: "EXPENSE", costBehavior: "FIXED", isMoneyAccount: false });
      await load();
      flash("Account added");
    } catch (e) { fail(e); }
  };

  return (
    <div className={WRAP}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <FinHeader title="Money accounts" emoji="💰" tone="sky" />
        <div className="flex items-center gap-2">
          {offline && <Chip tone="amber">API offline</Chip>}
          {!offline && (
            <>
              <button
                className={btnGhost}
                onClick={async () => {
                  try { const r = await financeDemoSeed(); await load(); flash(`Practice data loaded (${r.created} entries)`); }
                  catch (e) { fail(e); }
                }}
              >
                Load practice data
              </button>
              <button
                className={btnGhost}
                onClick={async () => {
                  if (!window.confirm("Remove all practice data and unlock opening balances?")) return;
                  try { const r = await financeDemoClear(); await load(); flash(`Practice data removed (${r.removed} entries)`); }
                  catch (e) { fail(e); }
                }}
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      <Flash ok={msg} err={err} />

      {sum && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <Kpi label="Money on hand" emoji="💰" tone="sky" value={taka(sum.cashPaisa)} hint={`${sum.moneyAccountCount} accounts`} />
          <Kpi
            label="Actually spendable"
            emoji="✅"
            value={taka(sum.spendablePaisa)}
            tone={sum.spendablePaisa < 0 ? "rose" : "emerald"}
            hint={sum.customerAdvancePaisa > 0 ? `${taka(sum.customerAdvancePaisa)} is customer advance` : "no customer advance held"}
          />
          <Kpi label="With rider / courier" emoji="🛵" value={taka(sum.carrierCashPaisa)} tone={sum.carrierCashPaisa > 0 ? "amber" : "slate"} hint="COD collected, not handed over" />
          <Kpi label="Customers owe / we owe" emoji="⚖" tone="brand" value={`${taka(sum.receivablePaisa)} / ${taka(sum.payablePaisa)}`} />
        </div>
      )}

      {sum && !sum.openingPosted && (
        <Card className="px-5 py-4 mb-5 border-[var(--l-warn)] bg-[var(--s-warn)]">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold text-[14px] text-purple mb-1">Opening balances are not in the ledger yet</div>
              <p className="text-[13px] text-body-soft m-0 max-w-[640px]">Locked once posted.</p>
            </div>
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => void doPostOpening()} disabled={sum.openingPendingPaisa === 0}>
              Post opening balances
            </button>
          </div>
        </Card>
      )}

      {/* money accounts */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-[19px] text-purple mb-3 flex items-center gap-2"><span className="w-1.5 h-5 rounded-full" style={{ background: "linear-gradient(180deg,var(--o-solid),var(--o-solid))" }} />Where the money is</h2>
        <button className={btnGhost} onClick={() => setAdding((v) => !v)}>
          <Icon name="plus" size={14} /> Add account
        </button>
      </div>

      {adding && (
        <Card className="px-5 py-4 mb-4">
          <div className="grid md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-[12px] font-semibold text-body-soft">Code</label>
              <input className={input} value={newAcc.code} onChange={(e) => setNewAcc({ ...newAcc, code: e.target.value })} placeholder="5495" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[12px] font-semibold text-body-soft">Name</label>
              <input className={input} value={newAcc.name} onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })} placeholder="Festival decoration" />
            </div>
            <div>
              <label className="text-[12px] font-semibold text-body-soft">Kind</label>
              <select className={input} value={newAcc.type} onChange={(e) => setNewAcc({ ...newAcc, type: e.target.value as FinAccountType })}>
                {GROUP_ORDER.map((t) => <option key={t} value={t}>{FIN_TYPE_META[t].label}</option>)}
              </select>
            </div>
            <div>
              {newAcc.type === "EXPENSE" ? (
                <>
                  <label className="text-[12px] font-semibold text-body-soft">Fixed or variable</label>
                  <select className={input} value={newAcc.costBehavior} onChange={(e) => setNewAcc({ ...newAcc, costBehavior: e.target.value })}>
                    <option value="FIXED">Fixed — every month regardless</option>
                    <option value="VARIABLE">Variable — grows with sales</option>
                  </select>
                </>
              ) : (
                <label className="flex items-center gap-2 text-[13px] mt-5">
                  <input type="checkbox" checked={newAcc.isMoneyAccount} onChange={(e) => setNewAcc({ ...newAcc, isMoneyAccount: e.target.checked })} />
                  Money sits here
                </label>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => void doAdd()} disabled={!newAcc.code.trim() || !newAcc.name.trim()}>Save</button>
            <button className={btnGhost} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden mb-7">
        <table className="w-full text-[13.5px]">
          <thead className="text-[10.5px] uppercase tracking-[0.06em] font-bold" style={{ background: "var(--s-accent)", color: "var(--t-accent)" }}>
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Account</th>
              <th className="text-right px-4 py-2.5 font-semibold">Opening</th>
              <th className="text-right px-4 py-2.5 font-semibold">Books say</th>
              <th className="text-right px-4 py-2.5 font-semibold w-[220px]">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="px-4 py-6 text-center text-body-soft">Loading…</td></tr>}
            {!loading && money.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-body-soft">
                {offline ? "API offline" : "Run the migration first — no accounts yet"}
              </td></tr>
            )}
            {money.map((a) => (
              <tr key={a.id} className="border-t border-[var(--l-accent)]">
                <td className="px-4 py-3">
                  <div className="font-semibold text-purple">{a.name}</div>
                  <div className="text-[11.5px] text-body-soft">{a.code}{a.payMethod ? ` · ${a.payMethod.toLowerCase()}` : ""}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  {editing === a.id ? (
                    <input
                      className={`${input} text-right w-[130px] inline-block`}
                      value={draft[a.id] ?? fromPaisa(a.openingBalancePaisa)}
                      onChange={(e) => setDraft({ ...draft, [a.id]: e.target.value })}
                      autoFocus
                    />
                  ) : (
                    <span className="text-body-soft">{taka(a.openingBalancePaisa)}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: a.balancePaisa < 0 ? "var(--t-bad)" : "var(--t-accent)" }}>
                  {taka(a.balancePaisa)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {sum && !sum.openingPosted && (
                    editing === a.id ? (
                      <>
                        <button className={`${btnPrimary} mr-2`} onClick={() => void saveOpening(a)}>Save</button>
                        <button className={btnGhost} onClick={() => setEditing(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className={`${btnGhost} mr-2`} onClick={() => { setEditing(a.id); setDraft({ ...draft, [a.id]: fromPaisa(a.openingBalancePaisa) }); }}>
                        Set opening
                      </button>
                    )
                  )}
                  <button className={btnGhost} onClick={() => { setCounting(a); setCountValue(fromPaisa(a.balancePaisa)); }}>
                    Count
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {counting && (
        <Card className="px-5 py-4 mb-7 border-[var(--l-accent)]">
          <div className="font-semibold text-[14px] text-purple mb-1">Counting — {counting.name}</div>
          <p className="text-[13px] text-body-soft mt-0 mb-3">
            The books say <b>{taka(counting.balancePaisa)}</b>.
          </p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-[12px] font-semibold text-body-soft">Actually there (৳)</label>
              <input className={`${input} w-[180px]`} value={countValue} onChange={(e) => setCountValue(e.target.value)} autoFocus />
            </div>
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => void doCount()}>Record count</button>
            <button className={btnGhost} onClick={() => setCounting(null)}>Cancel</button>
            <span className="text-[13px] text-body-soft">
              Difference: <b style={{ color: toPaisa(countValue) - counting.balancePaisa === 0 ? "var(--t-ok)" : "var(--t-warn)" }}>
                {taka(toPaisa(countValue) - counting.balancePaisa)}
              </b>
            </span>
          </div>
        </Card>
      )}

      {/* the full chart lives on its own screen now */}
      <Card className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold text-[14px] text-purple mb-0.5">All account headings</div>
          <p className="text-[13px] text-body-soft m-0">{rows.length} headings</p>
        </div>
        <a href="/finance/chart" className={btnGhost}>Open chart of accounts</a>
      </Card>
    </div>
  );
}

/* ==================== LEDGER ==================== */

export function LedgerLive() {
  const [rows, setRows] = useState<ApiJournalEntry[]>([]);
  const [fails, setFails] = useState<ApiPostingFailure[]>([]);
  const [accs, setAccs] = useState<ApiFinanceAccount[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accountId, setAccountId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, a, f] = await Promise.all([
        financeLedger(accountId ? { accountId, take: 200 } : { take: 200 }),
        financeAccounts(),
        financeFailures(),
      ]);
      setRows(l);
      setAccs(a);
      setFails(f);
      setOffline(false);
    } catch {
      setOffline(true);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className={WRAP}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <FinHeader title="Ledger" emoji="📖" tone="slate" />
        {offline && <Chip tone="amber">API offline</Chip>}
      </div>

      {fails.length > 0 && (
        <Panel title={`${fails.length} entr${fails.length > 1 ? "ies" : "y"} could not be posted`} emoji="⚠" tone="rose" className="mb-5"
          sub="the bookkeeping failed, not the sale">
          <div className="px-5 py-3">
            {fails.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-4 py-2.5 border-b border-[var(--l-accent)] last:border-0">
                <div>
                  <div className="font-semibold text-purple text-[13px]">{f.sourceType.toLowerCase().replace(/_/g, " ")}</div>
                  <div className="text-[11.5px] text-body-soft">{f.error}</div>
                </div>
                <button className={btnPrimary} style={btnPrimaryStyle} onClick={async () => {
                  const r = await replayFinanceFailure(f.id);
                  await load();
                  window.alert(r.message);
                }}>Try again</button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <select className={`${input} w-[280px]`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">All accounts</option>
          {accs.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
        </select>
        <button className={btnGhost} onClick={() => void load()}>Refresh</button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="text-[10.5px] uppercase tracking-[0.06em] font-bold" style={{ background: "var(--s-accent)", color: "var(--t-accent)" }}>
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold w-[110px]">No</th>
              <th className="text-left px-4 py-2.5 font-semibold w-[110px]">Date</th>
              <th className="text-left px-4 py-2.5 font-semibold">What happened</th>
              <th className="text-left px-4 py-2.5 font-semibold">Moved</th>
              <th className="text-right px-4 py-2.5 font-semibold w-[120px]">Amount</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-body-soft">Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-body-soft">Nothing in the ledger yet.</td></tr>
            )}
            {rows.map((e) => {
              const total = e.lines.reduce((n, l) => n + l.debitPaisa, 0);
              const into = e.lines.filter((l) => l.debitPaisa > 0).map((l) => l.account?.name ?? "").join(", ");
              const outOf = e.lines.filter((l) => l.creditPaisa > 0).map((l) => l.account?.name ?? "").join(", ");
              return (
                <tr key={e.id} className="border-t border-[var(--l-accent)] align-top">
                  <td className="px-4 py-3 font-semibold text-purple">{e.entryNo}</td>
                  <td className="px-4 py-3 text-body-soft">{e.entryDate.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <div>{e.narration}</div>
                    <div className="text-[11.5px] text-body-soft">
                      {e.sourceType.toLowerCase().replace(/_/g, " ")}{e.actorName ? ` · ${e.actorName}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12.5px]">
                    <span className="text-[var(--t-ok)] font-semibold">→ {into || "—"}</span>
                    <br />
                    <span className="text-body-soft">from {outOf || "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">{taka(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ==================== SETTINGS ==================== */

export function FinanceSettingsLive() {
  const [s, setS] = useState<ApiFinanceSetting | null>(null);
  const [accs, setAccs] = useState<ApiFinanceAccount[]>([]);
  const [recs, setRecs] = useState<ApiReconciliation[]>([]);
  const [offline, setOffline] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const [st, a, r] = await Promise.all([financeSettings(), financeAccounts(), financeReconciliations()]);
      setS(st); setAccs(a); setRecs(r); setOffline(false);
    } catch { setOffline(true); setS(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const patch = async (b: Record<string, unknown>) => {
    try {
      const next = await updateFinanceSettings(b);
      setS(next);
      setErr("");
      setMsg("Saved");
      window.setTimeout(() => setMsg(""), 2500);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
  };

  if (offline) return <div className={WRAP}><FinHeader title="Settings" emoji="৳" tone="brand" /><Chip tone="amber">API offline</Chip></div>;
  if (!s) return <div className={WRAP}><FinHeader title="Settings" emoji="৳" tone="brand" /><p className="text-body-soft">Loading…</p></div>;

  const money = accs.filter((a) => a.isMoneyAccount);

  return (
    <div className={WRAP}>
      <FinHeader title="Settings" emoji="⚙" tone="brand" />

      <Flash ok={msg} err={err} />

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="px-5 py-4">
          <h3 className="font-display text-[17px] text-purple mt-0 mb-3">Starting point</h3>
          <label className="text-[12px] font-semibold text-body-soft">Books start from</label>
          <input type="date" className={input} defaultValue={s.goLiveDate?.slice(0, 10) ?? ""}
            onBlur={(e) => void patch({ goLiveDate: e.target.value || null })} />
          <p className="text-[12px] text-body-soft mt-1.5 mb-3">Nothing before this date is counted.</p>

          <label className="text-[12px] font-semibold text-body-soft">Financial year starts in</label>
          <select className={input} defaultValue={String(s.fiscalYearStartMonth)}
            onChange={(e) => void patch({ fiscalYearStartMonth: Number(e.target.value) })}>
            {["January","February","March","April","May","June","July","August","September","October","November","December"]
              .map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>

          <label className="text-[12px] font-semibold text-body-soft mt-3 block">Default cash account</label>
          <select className={input} defaultValue={s.defaultCashAccountId ?? ""}
            onChange={(e) => void patch({ defaultCashAccountId: e.target.value || null })}>
            <option value="">—</option>
            {money.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          <label className="text-[12px] font-semibold text-body-soft mt-3 block">Books closed up to</label>
          <input type="date" className={input} defaultValue={s.lastClosedDate?.slice(0, 10) ?? ""}
            onBlur={(e) => void patch({ lastClosedDate: e.target.value || null })} />
          <p className="text-[12px] text-body-soft mt-1.5 mb-0">Nothing can be back-dated into a closed period.</p>
        </Card>

        <Card className="px-5 py-4">
          <h3 className="font-display text-[17px] text-purple mt-0 mb-3">Approval needed above</h3>
          {[
            { k: "expenseApprovalThresholdPaisa", label: "Expense", v: s.expenseApprovalThresholdPaisa },
            { k: "paymentApprovalThresholdPaisa", label: "Supplier payment", v: s.paymentApprovalThresholdPaisa },
            { k: "refundApprovalThresholdPaisa", label: "Cash refund", v: s.refundApprovalThresholdPaisa },
            { k: "wastageApprovalThresholdPaisa", label: "Wastage / write-off", v: s.wastageApprovalThresholdPaisa },
          ].map((f) => (
            <div key={f.k} className="mb-2.5">
              <label className="text-[12px] font-semibold text-body-soft">{f.label} (৳)</label>
              <input className={input} defaultValue={fromPaisa(f.v)}
                onBlur={(e) => void patch({ [f.k]: toPaisa(e.target.value) })} />
            </div>
          ))}
          <p className="text-[12px] text-body-soft mt-1 mb-0">0 turns the check off.</p>
        </Card>

        <Card className="px-5 py-4">
          <h3 className="font-display text-[17px] text-purple mt-0 mb-3">Partners</h3>
          <label className="text-[12px] font-semibold text-body-soft">Share of profit to the working partner before capital is repaid (%)</label>
          <input className={input} defaultValue={String(s.labourBonusPercentBp / 100)}
            onBlur={(e) => void patch({ labourBonusPercentBp: Math.round(Number(e.target.value || "0") * 100) })} />
          <p className="text-[12px] text-body-soft mt-1.5 mb-0">0 = capital is repaid first.</p>
          <label className="text-[12px] font-semibold text-body-soft mt-4 block">Anything above this is an asset, not an expense (৳)</label>
          <input className={input} defaultValue={fromPaisa(s.assetThresholdPaisa)}
            onBlur={(e) => void patch({ assetThresholdPaisa: toPaisa(e.target.value) })} />
          <label className="text-[12px] font-semibold text-body-soft mt-4 block">Warn when a rider is carrying more than (৳)</label>
          <input className={input} defaultValue={fromPaisa(s.riderCashLimitPaisa)}
            onBlur={(e) => void patch({ riderCashLimitPaisa: toPaisa(e.target.value) })} />
        </Card>

        <Card className="px-5 py-4">
          <h3 className="font-display text-[17px] text-purple mt-0 mb-3">VAT</h3>
          <label className="flex items-center gap-2 text-[13.5px] mb-3">
            <input type="checkbox" defaultChecked={s.vatEnabled} onChange={(e) => void patch({ vatEnabled: e.target.checked })} />
            We are VAT registered
          </label>
          <label className="text-[12px] font-semibold text-body-soft">VAT rate (%)</label>
          <input className={input} defaultValue={String(s.vatRateBps / 100)}
            onBlur={(e) => void patch({ vatRateBps: Math.round(Number(e.target.value || "0") * 100) })} />
          <label className="flex items-center gap-2 text-[13.5px] my-3">
            <input type="checkbox" defaultChecked={s.vatInclusivePricing} onChange={(e) => void patch({ vatInclusivePricing: e.target.checked })} />
            Our listed prices already include VAT
          </label>
          <label className="text-[12px] font-semibold text-body-soft">Our BIN</label>
          <input className={input} defaultValue={s.businessBin ?? ""} onBlur={(e) => void patch({ businessBin: e.target.value || null })} />
        </Card>
      </div>

      <h2 className="font-display text-[19px] text-purple mt-8 mb-3">Recent counts</h2>
      <Card className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="text-[10.5px] uppercase tracking-[0.06em] font-bold" style={{ background: "var(--s-accent)", color: "var(--t-accent)" }}>
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">No</th>
              <th className="text-left px-4 py-2.5 font-semibold">Account</th>
              <th className="text-left px-4 py-2.5 font-semibold">Date</th>
              <th className="text-right px-4 py-2.5 font-semibold">Books</th>
              <th className="text-right px-4 py-2.5 font-semibold">Counted</th>
              <th className="text-right px-4 py-2.5 font-semibold">Difference</th>
            </tr>
          </thead>
          <tbody>
            {recs.length === 0 && <tr><td colSpan={6} className="px-4 py-5 text-center text-body-soft">No counts yet</td></tr>}
            {recs.map((r) => (
              <tr key={r.id} className="border-t border-[var(--l-accent)]">
                <td className="px-4 py-2.5 font-semibold text-purple">{r.reconNo}</td>
                <td className="px-4 py-2.5">{r.account?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-body-soft">{r.asOfDate.slice(0, 10)}</td>
                <td className="px-4 py-2.5 text-right">{taka(r.systemBalancePaisa)}</td>
                <td className="px-4 py-2.5 text-right">{taka(r.countedBalancePaisa)}</td>
                <td className="px-4 py-2.5 text-right font-bold" style={{ color: r.differencePaisa === 0 ? "var(--t-ok)" : "var(--t-warn)" }}>
                  {taka(r.differencePaisa)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
