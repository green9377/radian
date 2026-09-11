"use client";

import { useCallback, useEffect, useState } from "react";
import { backdropClose } from "./backdropClose";
import Link from "next/link";
import Icon from "./Icon";
import {
  formatTaka,
  posAnalyticsToday,
  posListSales,
  posCurrentShift,
  posShiftSummary,
  posTakeCashOut,
  financeAccounts,
  type ApiFinanceAccount,
  type ApiPosShiftSummary,
  posDay,
  posCloseDay,
  type ApiPosDay,
  posDue,
  posCollectDue,
  posAdvanceOrders,
  posHandOverAdvance,
  type ApiPosAdvance,
  posSettings,
  posDiscountRules,
  updatePosSettings,
  type ApiPosSale,
  type ApiPosDue,
  type ApiPosShift,
  type ApiPosSettings,
  type ApiPosAnalytics,
} from "../_data/api";
import { PayDialog, usePayRows, usePaymentMethods, TILL_TENDERS } from "./MoneyBlock";

/*
  POS secondary screens (RADIAN_POS_MODULE_ARCHITECTURE.md §7).
  ⇄ SWAPPED: live from :4000/pos. Demo constants stay as a fail-soft fallback so
  the screens are still explorable if the API is down. All money is server-side
  (DEC-POS-014) — the browser never sums pages.
*/

const wrap = "px-5 md:px-7 pt-5 pb-10 max-w-[1600px]"; // 6 Aug — widened, see FinanceUI.WRAP note
const card = "bg-white border border-lavender-deep rounded-[16px] shadow-soft";

function Head({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-5 flex-wrap">
      <div>
        <h1 className="font-display text-[22px] text-purple m-0 leading-tight">{title}</h1>
        <p className="text-body-soft text-[12.5px] m-0">{sub}</p>
      </div>
      {action}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" | "plum" | "orchid" }) {
  const g: Record<string, [string, string]> = {
    plum: ["#5a1385", "#320049"],
    green: ["#159b63", "#0e6e46"],
    amber: ["#e0a23a", "#b45309"],
    orchid: ["#d857ef", "#a52fc0"],
  };
  const [from, to] = g[tone ?? "plum"];
  return (
    <div className="rounded-[16px] p-4 text-white shadow-soft relative overflow-hidden" style={{ background: `linear-gradient(145deg, ${from}, ${to})` }}>
      <div className="absolute -right-4 -top-4 w-[64px] h-[64px] rounded-full bg-white/10" />
      <div className="text-[12px] text-white/80 font-medium mb-1">{label}</div>
      <div className="font-display text-[22px] font-semibold">{value}</div>
    </div>
  );
}

/*  No demo constants here any more (owner's standing order): a POS screen that
    invents sales or dues teaches the shop to trust numbers that are not real.
    Empty API answer = empty screen.  */
/*  a plain date, for the day nav and for "open since" — takes either a
    YYYY-MM-DD day name or a full timestamp  */
const fmtDay = (v: string) =>
  new Date(v.length <= 10 ? `${v}T06:00:00.000Z` : v)
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
/*  P7-1 — a bare clock time is only honest inside one day. Sales history spans
    90 days and the shift board can span several, so anything that is not
    guaranteed to be today carries its date.  */
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const methodLabel = (s: ApiPosSale) => (s.transactions?.length ? Array.from(new Set(s.transactions.map((t) => t.method))).join(" + ") : "—");

/* ================= OVERVIEW ================= */
function GradientStat({ label, value, sub, icon, from, to }: { label: string; value: string; sub: string; icon: string; from: string; to: string }) {
  return (
    <div className="rounded-[18px] p-4 text-white shadow-soft relative overflow-hidden" style={{ background: `linear-gradient(145deg, ${from}, ${to})` }}>
      <div className="absolute -right-5 -top-5 w-[80px] h-[80px] rounded-full bg-white/10" />
      <div className="w-[38px] h-[38px] rounded-[11px] bg-white/20 grid place-items-center mb-3"><Icon name={icon} size={19} /></div>
      <div className="text-[12px] text-white/80 font-medium">{label}</div>
      <div className="font-display text-[24px] font-semibold leading-tight">{value}</div>
      <div className="text-[11.5px] text-white/75 mt-0.5">{sub}</div>
    </div>
  );
}

export function PosOverview() {
  const [a, setA] = useState<ApiPosAnalytics | null>(null);
  const [sales, setSales] = useState<ApiPosSale[]>([]);
  useEffect(() => {
    posAnalyticsToday().then(setA).catch(() => {});
    posListSales({ days: 30 }).then((r) => { if (r.length) setSales(r); }).catch(() => {});
  }, []);
  return (
    <div className={wrap}>
      <Head
        title="POS"
        sub="Counter sales — today at a glance. Every sale lands in the unified Order ledger (channel = POS)."
        action={<Link href="/pos/sell" className="bg-purple hover:bg-purple-deep text-white text-[13.5px] px-5 py-2.5 rounded-[11px] font-medium inline-flex items-center gap-2 shadow-soft"><Icon name="cash" size={17} /> Open Sell screen</Link>}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        <GradientStat label="Today's sales" value={formatTaka(a?.salesPaisa ?? 0)} sub={`${a?.count ?? 0} transactions`} icon="bag" from="#5a1385" to="#320049" />
        <GradientStat label="Cash in drawer" value={formatTaka(a?.cashInDrawer ?? 0)} sub={a?.shiftOpen ? "shift open" : "no open shift"} icon="cash" from="#159b63" to="#0e6e46" />
        <GradientStat label="Avg. bill" value={formatTaka(a?.avgPaisa ?? 0)} sub="today" icon="chart" from="#d857ef" to="#a52fc0" />
        <GradientStat label="Outstanding due" value={formatTaka(a?.duePaisa ?? 0)} sub="counter credit" icon="clock" from="#c98089" to="#a85a64" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className={card + " p-5"}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-[16px] text-purple m-0">Recent sales</h3>
            <Link href="/pos/sales" className="text-[12.5px] text-purple font-medium">View all →</Link>
          </div>
          <div className="flex flex-col">
            {sales.slice(0, 6).map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-2.5 border-b border-lavender-deep last:border-0">
                <div className="w-[38px] h-[38px] rounded-[11px] grid place-items-center text-white shrink-0" style={{ background: s.isGift ? "linear-gradient(145deg,#cf43ea,#b76e79)" : "linear-gradient(145deg,#7a2ea8,#470066)" }}><Icon name={s.isGift ? "heart" : "hash"} size={16} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-purple">{s.orderNo} {s.isGift && <span className="text-orchid">· gift</span>}</div>
                  <div className="text-[12px] text-body-soft">{fmtTime(s.placedAt)} · {s.customer?.name ?? s.senderName} · {s._count?.lines ?? 0} item(s) · {methodLabel(s)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[13.5px] font-medium">{formatTaka(s.totalPaisa)}</div>
                  {s.duePaisa > 0 && <div className="text-[11.5px] text-[#f7a96e]">{formatTaka(s.duePaisa)} due</div>}
                </div>
              </div>
            ))}
            {sales.length === 0 && <div className="text-[13px] text-body-soft py-6 text-center">No sales yet today.</div>}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className={card + " p-5"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-3">Quick actions</h3>
            <div className="grid grid-cols-1 gap-2">
              {[
                { href: "/pos/sell", label: "New sale", icon: "cash", from: "#b97fdc", to: "#ce6ef7" },
                { href: "/pos/day-close", label: "Day-close", icon: "clock", from: "#78edbc", to: "#77eebc" },
                { href: "/pos/due", label: "Collect due", icon: "user", from: "#c98089", to: "#c7949b" },
              ].map((x) => (
                <Link key={x.href} href={x.href} className="text-[13.5px] font-medium text-white rounded-[12px] px-3.5 py-3 inline-flex items-center gap-2.5 shadow-soft hover:opacity-90" style={{ background: `linear-gradient(145deg, ${x.from}, ${x.to})` }}>
                  <span className="w-[28px] h-[28px] rounded-[9px] bg-white/20 grid place-items-center"><Icon name={x.icon} size={15} /></span>
                  {x.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= SHIFT / TODAY ================= */

/** how long a drawer has been open, in the plainest words (P7-1) */
function openFor(openedAt: string): { text: string; stale: boolean } {
  const days = Math.floor((Date.now() - new Date(openedAt).getTime()) / 86400000);
  if (days <= 0) return { text: "opened today", stale: false };
  if (days === 1) return { text: "open since yesterday", stale: true };
  return { text: `open for ${days} days`, stale: true };
}

/**
 * P7-2 — the one way cash leaves the till.
 *
 * The owner's rule, 31 Aug: money comes out whenever the shop needs it, and it
 * is always recorded as an expense under a heading. So the heading is not
 * optional here and there is no free-text "reason" standing in for one — that
 * is what makes it reach Finance as a cost instead of surfacing as a mysterious
 * shortage at day-close.
 */
function CashOutDialog({
  shiftId, expectedCashPaisa, onClose, onDone,
}: { shiftId: string; expectedCashPaisa: number; onClose: () => void; onDone: (expected: number) => void }) {
  const [kind, setKind] = useState<"EXPENSE" | "DROP">("EXPENSE");
  const [accounts, setAccounts] = useState<ApiFinanceAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { financeAccounts().then(setAccounts).catch(() => setErr("Could not load the headings from Finance")); }, []);

  const headings = accounts.filter((a) => a.type === "EXPENSE" && a.isActive);
  /*  DEC-GBL-006 — the shop may keep more than one cash account, and the sell
      screen already refuses a cash tender without saying which. The drawer asks
      the same question, and only when there is really a choice.  */
  const cashAccounts = accounts.filter((a) => a.isMoneyAccount && a.isActive && a.payMethod === "CASH");
  const [fromAccountId, setFromAccountId] = useState("");
  const fromId = cashAccounts.length === 1 ? cashAccounts[0].id : fromAccountId;
  const destinations = accounts.filter((a) => a.isMoneyAccount && a.isActive && a.id !== fromId);
  const amountPaisa = Math.round((Number(amount) || 0) * 100);
  const tooMuch = amountPaisa > expectedCashPaisa;

  async function submit() {
    setErr(null);
    if (amountPaisa <= 0) { setErr("Type how much is coming out of the drawer."); return; }
    if (tooMuch) { setErr(`Only ${formatTaka(expectedCashPaisa)} is in the drawer.`); return; }
    if (kind === "EXPENSE" && !accountId) { setErr("Pick what this money was spent on."); return; }
    if (kind === "DROP" && !toAccountId) { setErr("Pick where the cash is going."); return; }
    if (!fromId) { setErr("Say which cash the notes came out of."); return; }
    setBusy(true);
    try {
      const r = await posTakeCashOut(shiftId, {
        kind, amountPaisa,
        fromAccountId: fromId,
        accountId: kind === "EXPENSE" ? accountId : undefined,
        toAccountId: kind === "DROP" ? toAccountId : undefined,
        payeeName: payeeName.trim() || undefined,
        note: note.trim() || undefined,
      });
      onDone(r.expectedCashPaisa);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not record it");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center px-4" {...backdropClose(onClose)}>
      <div className="bg-white rounded-[16px] shadow-lift p-6 w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-[17px] text-purple m-0 mb-1">Take cash out of the drawer</h3>
        <p className="text-[12.5px] text-body-soft mb-4">In the drawer now: <span className="font-semibold text-purple">{formatTaka(expectedCashPaisa)}</span></p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {(["EXPENSE", "DROP"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={
                "py-2.5 rounded-[11px] text-[13px] font-bold border transition " +
                (kind === k
                  ? "bg-purple text-white border-purple shadow-soft"
                  : "bg-white text-body-soft border-lavender-deep hover:border-orchid-mid")
              }
            >
              {k === "EXPENSE" ? "Spent it" : "Moved to bank/safe"}
            </button>
          ))}
        </div>

        <label className="text-[12.5px] text-body-soft font-medium mb-1 block">Amount ৳</label>
        <input type="text" inputMode="decimal" className="ipt h-[44px] text-[15px] mb-3" placeholder="0.00"
          value={amount} onChange={(e) => { const v = e.target.value; if (/^\d*\.?\d{0,2}$/.test(v)) setAmount(v); }} />

        {cashAccounts.length > 1 && (
          <>
            <label className="text-[12.5px] text-body-soft font-medium mb-1 block">Out of which cash</label>
            <select className="ipt h-[44px] mb-3" value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
              <option value="">Pick the drawer…</option>
              {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </>
        )}

        {kind === "EXPENSE" ? (
          <>
            <label className="text-[12.5px] text-body-soft font-medium mb-1 block">What was it spent on</label>
            <select className="ipt h-[44px] mb-3" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Pick a heading…</option>
              {headings.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <label className="text-[12.5px] text-body-soft font-medium mb-1 block">Paid to (optional)</label>
            <input className="ipt h-[44px] mb-3" placeholder="Who took the money" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} />
          </>
        ) : (
          <>
            <label className="text-[12.5px] text-body-soft font-medium mb-1 block">Where it is going</label>
            <select className="ipt h-[44px] mb-3" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Pick an account…</option>
              {destinations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </>
        )}

        <label className="text-[12.5px] text-body-soft font-medium mb-1 block">Note (optional)</label>
        <input className="ipt h-[44px]" placeholder="Anything to remember" value={note} onChange={(e) => setNote(e.target.value)} />

        {err && <p className="text-[12px] text-[#e1837a] mt-3 mb-0">{err}</p>}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-[11px] border border-lavender-deep text-purple font-bold text-[13px]">Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className="flex-1 py-2.5 rounded-[11px] bg-purple hover:bg-purple-deep text-white font-bold text-[13px] disabled:opacity-50">
            {busy ? "Recording…" : "Take it out"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PosShiftBoard() {
  const [shift, setShift] = useState<ApiPosShift | null>(null);
  const [sum, setSum] = useState<ApiPosShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [cashOut, setCashOut] = useState(false);
  useEffect(() => {
    posCurrentShift()
      .then(async (s) => {
        setShift(s);
        if (s) setSum(await posShiftSummary(s.id).catch(() => null));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  /*  P7-1 — the drawer figure comes from the shift, and so does everything
      beside it. The panel used to print TODAY's takings under the words "Sales
      this shift"; on a drawer that had been open since 20 August that read
      "0 transactions" next to ৳15,156.76 of cash.  */
  const expected = sum?.expectedCashPaisa ?? 0;
  const age = shift ? openFor(shift.openedAt) : null;
  return (
    <div className={wrap}>
      <Head title="Today / Shift" sub="The running picture — who is on the counter and what's in the drawer right now." />
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
        {shift ? (
          <div className="rounded-[18px] p-5 text-white shadow-soft relative overflow-hidden" style={{ background: "linear-gradient(160deg,#159b63,#0d5f3f)" }}>
            <div className="absolute -right-6 -top-6 w-[90px] h-[90px] rounded-full bg-white/10" />
            <div className="flex items-center gap-2 mb-3"><span className="w-[9px] h-[9px] rounded-full bg-white" /><h3 className="font-display text-[16px] text-white m-0">Shift open{sum?.shiftNo ? ` · ${sum.shiftNo}` : ""}</h3></div>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between"><span className="text-white/75">Cashier</span><span className="font-medium">{shift.cashierName}</span></div>
              <div className="flex justify-between"><span className="text-white/75">Counter</span><span className="font-medium">{sum?.registerName ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-white/75">Opened</span><span>{fmtDateTime(shift.openedAt)}</span></div>
              <div className="flex justify-between"><span className="text-white/75">Opening float</span><span>{formatTaka(shift.openingFloatPaisa)}</span></div>
              <div className="flex justify-between border-t border-white/20 pt-2"><span className="text-white/90 font-medium">Expected cash</span><span className="font-semibold text-white text-[15px]">{formatTaka(expected)}</span></div>
            </div>
            {age?.stale && (
              <div className="mt-3 rounded-[11px] bg-white/15 px-3 py-2 text-[12px] font-medium">
                This drawer has been {age.text}. Count it and close the shift.
              </div>
            )}
            <button type="button" onClick={() => setCashOut(true)} className="w-full mt-4 bg-white/15 hover:bg-white/25 border border-white/30 text-white text-[13px] py-2.5 rounded-[11px] font-bold">
              Take cash out
            </button>
            <Link href="/pos/day-close" className="block text-center mt-2 bg-white hover:bg-white/90 text-[#78edbf] text-[13.5px] py-2.5 rounded-[11px] font-bold">Start day-close</Link>
          </div>
        ) : (
          <div className={card + " p-5"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-2">{loading ? "Looking for an open shift…" : "No open shift"}</h3>
            {!loading && (
              <>
                <p className="text-[13px] text-body-soft mb-0">Open a shift from the Sell screen to start taking counter sales.</p>
                <Link href="/pos/sell" className="inline-block mt-3 bg-purple text-white text-[13px] px-4 py-2 rounded-[10px] font-medium">Go to Sell</Link>
              </>
            )}
          </div>
        )}

        <div className={card + " p-5"}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Sales this shift" value={formatTaka(sum?.salesPaisa ?? 0)} tone="plum" />
            <Stat label="Transactions" value={String(sum?.count ?? 0)} tone="orchid" />
            <Stat label="Avg. bill" value={formatTaka(sum?.avgPaisa ?? 0)} tone="green" />
          </div>
          <h3 className="font-display text-[15px] text-purple m-0 mb-2">Sales this shift</h3>
          <div className="flex flex-col">
            {(sum?.sales ?? []).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-lavender-deep last:border-0 text-[13px]">
                <span className="text-body-soft">{fmtDateTime(s.placedAt)} · {s.customerName}</span>
                <span className="font-medium">
                  {formatTaka(s.totalPaisa)}
                  {s.duePaisa > 0 && <span className="text-[#f7a96e] font-normal"> · {formatTaka(s.duePaisa)} due</span>}
                </span>
              </div>
            ))}
            {shift && (sum?.sales.length ?? 0) === 0 && <div className="text-[13px] text-body-soft py-4">No sales on this shift yet.</div>}
            {!shift && !loading && <div className="text-[13px] text-body-soft py-4">Nothing to show until a shift is open.</div>}
          </div>
        </div>
      </div>

      {cashOut && shift && (
        <CashOutDialog
          shiftId={shift.id}
          expectedCashPaisa={expected}
          onClose={() => setCashOut(false)}
          onDone={(next) => {
            setCashOut(false);
            setSum((s) => (s ? { ...s, expectedCashPaisa: next } : s));
          }}
        />
      )}
    </div>
  );
}

/* ================= SALES HISTORY ================= */
export function PosSalesHistory() {
  const [q, setQ] = useState("");
  const [sales, setSales] = useState<ApiPosSale[]>([]);
  const [rx, setRx] = useState<ApiPosSale | null>(null);
  useEffect(() => { posListSales({ days: 90 }).then((r) => { if (r.length) setSales(r); }).catch(() => {}); }, []);
  const list = sales.filter((s) => (s.orderNo + (s.customer?.name ?? s.senderName)).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className={wrap}>
      <Head title="Sales history" sub="Every past counter sale — search, open, reprint the receipt." />
      <div className={card + " p-4 mb-4"}>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-soft"><Icon name="search" size={17} /></span>
          <input className="ipt h-[42px] ipt-icon" placeholder="Search by receipt no or customer…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className={card + " overflow-hidden"}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-white" style={{ background: "linear-gradient(90deg,#5a1385,#7a2ea8)" }}>
              <th className="px-4 py-2.5 font-medium">Receipt</th>
              <th className="px-4 py-2.5 font-medium">Time</th>
              <th className="px-4 py-2.5 font-medium">Customer</th>
              <th className="px-4 py-2.5 font-medium">Items</th>
              <th className="px-4 py-2.5 font-medium">Payment</th>
              <th className="px-4 py-2.5 font-medium text-right">Total</th>
              <th className="px-4 py-2.5 font-medium text-right">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id} className="border-t border-lavender-deep hover:bg-lavender/30">
                <td className="px-4 py-2.5 font-medium text-purple">{s.orderNo}{s.isGift && <span className="text-orchid text-[11px]"> · gift</span>}</td>
                <td className="px-4 py-2.5 text-body-soft">{fmtDateTime(s.placedAt)}</td>
                <td className="px-4 py-2.5">{s.customer?.name ?? s.senderName}</td>
                <td className="px-4 py-2.5">{s._count?.lines ?? 0}</td>
                <td className="px-4 py-2.5 text-body-soft">{methodLabel(s)}</td>
                <td className="px-4 py-2.5 text-right font-medium">{formatTaka(s.totalPaisa)}{s.duePaisa > 0 && <span className="block text-[11px] text-[#f7a96e]">{formatTaka(s.duePaisa)} due</span>}</td>
                <td className="px-4 py-2.5 text-right"><button type="button" onClick={() => setRx(s)} className="text-[12px] text-purple font-medium inline-flex items-center gap-1 border border-lavender-deep rounded-[8px] px-2.5 py-1.5 hover:border-orchid-mid"><Icon name="hash" size={13} /> Reprint</button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-body-soft">No sales match.</td></tr>}
          </tbody>
        </table>
      </div>

      {rx && (
        <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center px-4" {...backdropClose(() => setRx(null))}>
          <div className="bg-white rounded-[16px] shadow-lift p-6 w-full max-w-[320px]" onClick={(e) => e.stopPropagation()}>
            <div className="text-center border-b border-dashed border-lavender-deep pb-3 mb-3">
              <div className="font-display text-[17px] text-purple">Radian</div>
              <div className="text-[11.5px] text-body-soft">Counter receipt · {rx.orderNo}</div>
            </div>
            <div className="text-[12.5px] space-y-1.5">
              <div className="flex justify-between"><span className="text-body-soft">Time</span><span>{fmtTime(rx.placedAt)}</span></div>
              <div className="flex justify-between"><span className="text-body-soft">Customer</span><span>{rx.customer?.name ?? rx.senderName}</span></div>
              <div className="flex justify-between"><span className="text-body-soft">Items</span><span>{rx._count?.lines ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-body-soft">Payment</span><span>{methodLabel(rx)}</span></div>
              <div className="flex justify-between border-t border-lavender-deep pt-2 mt-2 font-medium text-purple"><span>Total</span><span>{rx.isGift ? "— (gift)" : formatTaka(rx.totalPaisa)}</span></div>
              {rx.duePaisa > 0 && <div className="flex justify-between text-[#f7a96e]"><span>Due</span><span>{formatTaka(rx.duePaisa)}</span></div>}
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => window.print()} className="flex-1 py-2.5 rounded-[11px] border border-lavender-deep text-purple font-medium text-[13px] inline-flex items-center justify-center gap-1.5"><Icon name="hash" size={14} /> Print</button>
              <button type="button" onClick={() => setRx(null)} className="flex-1 py-2.5 rounded-[11px] bg-purple text-white font-medium text-[13px]">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= DAY-CLOSE ================= */
/*  ═══ DAY CLOSE — owner, 11 Sep 2026 ═════════════════════════════════════════

    > *"Separate shift, drawer — our business does not need these. There will
    >  be a Day close, and clicking it shows how much money came in today and
    >  how."*

    So this screen answers one question and the cash box is a detail inside it,
    not the subject. Two numbers sit side by side and are never added together,
    because they answer different questions and a shop owner asks both:

      · SOLD TODAY   — what today's counter bills are worth
      · CAME IN TODAY — money that actually arrived, whichever bill it was for

    They differ the moment an old bill's due is paid at the counter this
    morning, and only the second one can ever agree with the cash in the box.
    The screen says which is which rather than quietly picking one.            */
export function PosDayClose() {
  const [day, setDay] = useState<ApiPosDay | null>(null);
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [cashOut, setCashOut] = useState(false);

  const load = useCallback(async (d?: string) => {
    setLoading(true);
    try { setDay(await posDay(d || undefined)); setErr(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not load the day"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(date); }, [load, date]);

  /*  P7-7 lives on: the count is kept in PAISA and the box holds its own draft
      while it is being typed. A controlled number input rewritten as
      Math.round(actual/100) on every keystroke ate the decimal point, so a
      drawer expecting ৳15,156.76 could not be counted at all.  */
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [closeErr, setCloseErr] = useState<string | null>(null);

  const drawer = day?.drawer;
  const open = drawer?.isOpen ? drawer : null;
  const expected = open?.expectedCashPaisa ?? 0;
  const actual = Math.round((Number(draft) || 0) * 100);
  const counted = draft.trim() !== "" && Number.isFinite(Number(draft));
  const over = actual - expected;

  async function doClose() {
    if (!open) { setCloseErr("There is no open cash box to close."); return; }
    if (!counted) { setCloseErr("Count the box first — type what is actually in it."); return; }
    setBusy(true); setCloseErr(null);
    try { await posCloseDay({ countedCashPaisa: actual }); setClosed(true); await load(date); }
    catch (e) { setCloseErr(e instanceof Error ? e.message : "Could not close the day"); }
    finally { setBusy(false); }
  }

  const shiftDay = (by: number) => {
    const base = day ? new Date(`${day.date}T06:00:00.000Z`) : new Date();
    base.setUTCDate(base.getUTCDate() + by);
    setDate(base.toISOString().slice(0, 10));
    setDraft("");
    setClosed(false);
  };

  const money = day?.money;
  const biggest = Math.max(1, ...(money?.methods ?? []).map((m) => m.paisaTotal));

  return (
    <div className={wrap}>
      <Head
        title="Day close"
        sub="What came in today and how — then count the box and close the day."
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-[11px] border border-lavender-deep overflow-hidden">
              <button type="button" onClick={() => shiftDay(-1)} className="px-3 py-2 text-[13px] text-purple font-bold hover:bg-lavender">‹</button>
              <span className="px-3 py-2 text-[12.5px] font-medium text-purple min-w-[132px] text-center">
                {day ? (day.isToday ? "Today" : fmtDay(day.date)) : "…"}
              </span>
              <button type="button" onClick={() => shiftDay(1)} disabled={!!day?.isToday}
                className="px-3 py-2 text-[13px] text-purple font-bold hover:bg-lavender disabled:opacity-30">›</button>
            </div>
            {!day?.isToday && (
              <button type="button" onClick={() => { setDate(""); setDraft(""); }} className="text-[12.5px] px-3 py-2 rounded-[11px] border border-lavender-deep text-purple font-medium">Back to today</button>
            )}
          </div>
        }
      />

      {err && <div className="rounded-[12px] px-4 py-3 mb-4 text-[13px] bg-[#fdecea] text-[#c0392b]">{err}</div>}
      {loading && !day && <div className={card + " p-6 text-[13px] text-body-soft"}>Counting the day…</div>}

      {day && (
        <>
          {/*  The five numbers a shop owner asks for at closing time, in the
              order he asks them: what came in, what we sold, what is still
              owed, what left the box, what should be sitting in it.  */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <Stat label="Money in" value={formatTaka(money?.takenPaisa ?? 0)} tone="green" />
            <Stat label={`Sold · ${day.bills.count} bill${day.bills.count === 1 ? "" : "s"}`} value={formatTaka(day.bills.salesPaisa)} tone="plum" />
            <Stat label="Owed on today's bills" value={formatTaka(day.bills.duePaisa)} tone="amber" />
            <Stat label="Cash taken out" value={formatTaka(money?.cashOutPaisa ?? 0)} tone="orchid" />
            <Stat label="Cash box should hold" value={formatTaka(expected)} tone="green" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
            <div className="flex flex-col gap-5">
              {/* ---- how the money came in ---- */}
              <div className={card + " p-5"}>
                <h3 className="font-display text-[16px] text-purple m-0 mb-1">How the money came in</h3>
                <p className="text-[12px] text-body-soft m-0 mb-3">
                  Every payment taken at the counter {day.isToday ? "today" : "on this day"} — including an older bill&apos;s due paid at the till.
                </p>
                {(money?.methods.length ?? 0) === 0 && <div className="text-[13px] text-body-soft py-4">No money came in {day.isToday ? "yet today" : "on this day"}.</div>}
                <div className="flex flex-col gap-2.5">
                  {(money?.methods ?? []).map((m) => (
                    <div key={m.method}>
                      <div className="flex items-center justify-between text-[13px] mb-1">
                        <span className="text-purple font-medium capitalize">{m.method}</span>
                        <span className="text-body-soft">{m.count} payment{m.count === 1 ? "" : "s"} · <span className="text-purple font-semibold">{formatTaka(m.paisaTotal)}</span></span>
                      </div>
                      <div className="h-[7px] rounded-full bg-lavender overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.round((m.paisaTotal / biggest) * 100)}%`, background: "linear-gradient(90deg,#7a2ea8,#cf43ea)" }} />
                      </div>
                    </div>
                  ))}
                </div>
                {(money?.olderBillPaisa ?? 0) > 0 && (
                  <p className="text-[12px] text-body-soft mt-3 mb-0">
                    {formatTaka(money?.olderBillPaisa ?? 0)} of that was against bills from an earlier day — which is why &quot;money in&quot; and &quot;sold&quot; do not match.
                  </p>
                )}
                {(money?.refundedPaisa ?? 0) > 0 && (
                  <p className="text-[12px] mt-1 mb-0" style={{ color: "#c0392b" }}>
                    {formatTaka(money?.refundedPaisa ?? 0)} went back out as refunds — not counted in the figures above.
                  </p>
                )}
              </div>

              {/* ---- what sold ---- */}
              <div className={card + " p-5"}>
                <div className="flex items-end justify-between mb-3">
                  <h3 className="font-display text-[16px] text-purple m-0">What sold</h3>
                  <span className="text-[12px] text-body-soft">
                    avg bill {formatTaka(day.bills.avgPaisa)}
                    {day.bills.discountPaisa > 0 && <> · {formatTaka(day.bills.discountPaisa)} given as discount</>}
                  </span>
                </div>
                {day.topItems.length === 0 && <div className="text-[13px] text-body-soft py-2">Nothing sold {day.isToday ? "yet today" : "on this day"}.</div>}
                <div className="flex flex-col">
                  {day.topItems.map((t) => (
                    <div key={t.name} className="flex items-center justify-between py-2 border-b border-lavender-deep last:border-0 text-[13px]">
                      <span className="text-purple">{t.name}</span>
                      <span className="text-body-soft">{t.qty} × · <span className="text-purple font-medium">{formatTaka(t.paisa)}</span></span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ---- the bills themselves ---- */}
              <div className={card + " p-5"}>
                <h3 className="font-display text-[16px] text-purple m-0 mb-3">Bills</h3>
                {day.bills.rows.length === 0 && <div className="text-[13px] text-body-soft py-2">No bills {day.isToday ? "yet today" : "on this day"}.</div>}
                <div className="flex flex-col">
                  {day.bills.rows.map((b) => (
                    <Link key={b.id} href={`/pos/sale/${b.id}`} className="flex items-center justify-between py-2 border-b border-lavender-deep last:border-0 text-[13px] hover:opacity-80">
                      <span className="text-body-soft">{fmtTime(b.placedAt)} · <span className="text-purple font-medium">{b.orderNo}</span> · {b.customerName}</span>
                      <span className="font-medium text-purple">
                        {formatTaka(b.totalPaisa)}
                        {b.duePaisa > 0 && <span className="text-[#b45309] font-normal"> · {formatTaka(b.duePaisa)} due</span>}
                      </span>
                    </Link>
                  ))}
                </div>
                {day.bills.count > day.bills.rows.length && (
                  <p className="text-[12px] text-body-soft mt-2 mb-0">Showing the last {day.bills.rows.length} of {day.bills.count} — the rest are on Sales history.</p>
                )}
              </div>
            </div>

            {/* ---- the cash box ---- */}
            <div className="flex flex-col gap-5">
              {open ? (
                <div className={card + " p-5"}>
                  <h3 className="font-display text-[16px] text-purple m-0 mb-1">Count the cash box</h3>
                  <p className="text-[12px] text-body-soft m-0 mb-3">Cash only. bKash, card and Nagad are already with the bank.</p>
                  <div className="space-y-2 text-[13px] mb-3">
                    <div className="flex justify-between"><span className="text-body-soft">Started with</span><span>{formatTaka(open.openingFloatPaisa)}</span></div>
                    <div className="flex justify-between"><span className="text-body-soft">Cash in and out since</span><span className="text-[#0e7a3d]">{formatTaka(expected - open.openingFloatPaisa)}</span></div>
                    <div className="flex justify-between border-t border-lavender-deep pt-2"><span className="text-purple font-medium">Should be in the box</span><span className="font-semibold text-purple">{formatTaka(expected)}</span></div>
                  </div>

                  {/*  ⚠️ A BOX OPEN SINCE BEFORE TODAY HOLDS MORE THAN TODAY.
                      Saying so is the difference between a count that looks
                      wrong and a count that is understood.  */}
                  {open.openedBeforeToday && (
                    <div className="rounded-[11px] px-3 py-2 mb-3 text-[12px] font-medium" style={{ background: "#3a2d10", color: "#f5c451" }}>
                      This box has been open since {fmtDay(open.openedOn ?? open.openedAt)}, so it holds those days&apos; cash too. Closing it counts everything in it.
                    </div>
                  )}

                  {day.isToday ? (
                    <>
                      <label className="text-[12.5px] text-body-soft font-medium mb-1 block">Actual cash counted ৳</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="ipt h-[46px] text-[16px]"
                        placeholder={(expected / 100).toFixed(2)}
                        value={draft}
                        onChange={(e) => { const v = e.target.value; if (/^\d*\.?\d{0,2}$/.test(v)) setDraft(v); }}
                      />
                      {counted && (
                        <div className={"mt-3 rounded-[12px] px-4 py-3 text-[13px] font-medium " + (over === 0 ? "bg-[#e9f9ef] text-[#0e7a3d]" : over > 0 ? "bg-[#eef4ff] text-[#1d4ed8]" : "bg-[#fdecea] text-[#c0392b]")}>
                          {over === 0 ? "Matches exactly" : over > 0 ? `Excess: ${formatTaka(over)} more in the box` : `Shortfall: ${formatTaka(-over)} missing`}
                        </div>
                      )}
                      <button type="button" onClick={doClose} disabled={busy || closed}
                        className="w-full mt-4 bg-purple hover:bg-purple-deep text-white text-[14px] py-3 rounded-[12px] font-bold disabled:opacity-50">
                        {closed ? "Day closed" : busy ? "Closing…" : "Close the day"}
                      </button>
                      {closeErr && <p className="text-[11.5px] text-[#c0392b] mt-2 mb-0">{closeErr}</p>}
                      <button type="button" onClick={() => setCashOut(true)} className="w-full mt-2 border border-lavender-deep text-purple text-[13px] py-2.5 rounded-[11px] font-bold">
                        Take cash out
                      </button>
                    </>
                  ) : (
                    <p className="text-[12px] text-body-soft m-0">Only today&apos;s box can be counted. Come back to today to close it.</p>
                  )}
                </div>
              ) : (
                <div className={card + " p-5"}>
                  <h3 className="font-display text-[16px] text-purple m-0 mb-2">The cash box is closed</h3>
                  <p className="text-[13px] text-body-soft m-0">
                    {day.bills.count > 0
                      ? "Today's takings are counted and closed. The next sale opens a new box on its own."
                      : "Nothing has been sold since the last close. The first sale opens the box on its own — nobody has to start anything."}
                  </p>
                </div>
              )}

              {open && open.movements.length > 0 && (
                <div className={card + " p-5"}>
                  <h3 className="font-display text-[15px] text-purple m-0 mb-2">Cash movements</h3>
                  <div className="flex flex-col">
                    {open.movements.map((m, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-lavender-deep last:border-0 text-[12.5px]">
                        <span className="text-body-soft">{fmtDateTime(m.at)} · {m.note || m.kind.toLowerCase().replace(/_/g, " ")}</span>
                        <span className={"font-medium " + (m.amountPaisa < 0 ? "text-[#c0392b]" : "text-[#0e7a3d]")}>
                          {m.amountPaisa < 0 ? "−" : "+"}{formatTaka(Math.abs(m.amountPaisa))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {cashOut && open && (
        <CashOutDialog
          shiftId={open.id}
          expectedCashPaisa={expected}
          onClose={() => setCashOut(false)}
          onDone={() => { setCashOut(false); void load(date); }}
        />
      )}
    </div>
  );
}


/* ================= DUE BOARD ================= */
export function PosDueBoard() {
  const [rows, setRows] = useState<ApiPosDue[]>([]);
  const [open, setOpen] = useState<{ row: ApiPosDue; only?: string } | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { posDue().then((r) => setRows(r)).catch(() => {}); }, []);
  const total = rows.reduce((s, r) => s + r.duePaisa, 0);

  /*  BILL BY BILL (owner, 21 Aug: "order by order show krbe and customer
      information shoho"). One customer with four unpaid bills is four rows —
      each with its own number, date, age and Collect — because that is how the
      shop chases money: "the 12th of last month is still open".  */
  const bills = rows
    .flatMap((r) => r.orders.map((o) => ({ row: r, o })))
    .filter(({ row, o }) => {
      const needle = q.trim().toLowerCase();
      if (!needle) return true;
      return row.name.toLowerCase().includes(needle)
        || row.phone.includes(needle)
        || o.orderNo.toLowerCase().includes(needle);
    })
    .sort((a, b) => +new Date(a.o.placedAt) - +new Date(b.o.placedAt));

  const days = (iso: string) => Math.floor((Date.now() - +new Date(iso)) / 86_400_000);

  return (
    <div className={wrap}>
      <Head title="Due board" sub="Every unpaid counter bill, oldest first — who owes it, since when, and what is still open on it." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 max-w-[760px]">
        <Stat label="Total outstanding" value={formatTaka(total)} tone="amber" />
        <Stat label="Bills open" value={String(bills.length)} tone="plum" />
        <Stat label="Customers" value={String(rows.length)} tone="orchid" />
        <Stat label="Oldest" value={bills.length ? `${days(bills[0].o.placedAt)} days` : "—"} tone="plum" />
      </div>

      <div className="mb-3 max-w-[420px]">
        <input className="ipt" placeholder="Search a bill number, name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className={card + " overflow-hidden"}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-white" style={{ background: "linear-gradient(90deg,#5a1385,#7a2ea8)" }}>
              <th className="px-4 py-2.5 font-medium">Bill</th>
              <th className="px-4 py-2.5 font-medium">Customer</th>
              <th className="px-4 py-2.5 font-medium">Since</th>
              <th className="px-4 py-2.5 font-medium text-right">Still owed</th>
              <th className="px-4 py-2.5 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {bills.map(({ row, o }) => {
              const age = days(o.placedAt);
              return (
                <tr key={o.id} className={"border-t border-lavender-deep " + (age >= 7 ? "bg-[#3a2b16]" : "hover:bg-lavender/30")}>
                  <td className="px-4 py-2.5">
                    <Link href={`/orders/${o.id}`} className="font-mono font-semibold text-purple text-[12.5px] hover:underline">{o.orderNo}</Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-purple">{row.name}</div>
                    <div className="text-[12px] text-body-soft">
                      {row.phone}
                      {row.orders.length > 1 && <> · {row.orders.length} bills open · {formatTaka(row.duePaisa)} in all</>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-body-soft">
                    {new Date(o.placedAt).toLocaleDateString()}
                    <span className={age >= 7 ? "text-[#f7a96e] font-medium" : ""}> · {age === 0 ? "today" : `${age} days`}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-[#f7a96e]">{formatTaka(o.duePaisa)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => setOpen({ row, only: o.id })}
                      className="text-[12px] text-white bg-purple font-medium rounded-[8px] px-3 py-1.5">Collect</button>
                    {row.orders.length > 1 && (
                      <button type="button" onClick={() => setOpen({ row })}
                        className="text-[12px] text-purple border border-lavender-deep rounded-[8px] px-3 py-1.5 ml-1.5">All {formatTaka(row.duePaisa)}</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {bills.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-body-soft">{q ? "Nothing matches." : "No outstanding due."}</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <CollectDue row={open.row} onlyOrderId={open.only} onClose={() => setOpen(null)}
          onDone={async () => { setOpen(null); setRows(await posDue().catch(() => [])); }} />
      )}
    </div>
  );
}

/**
 * Taking a due IS taking money, so it wears the house dialog (CLAUDE.md §14).
 * It used to be one button that assumed the whole amount in cash and shouted
 * through alert() when the server refused (owner, 21 Aug).
 */
function CollectDue({ row, onlyOrderId, onClose, onDone }: {
  row: ApiPosDue; onlyOrderId?: string; onClose: () => void; onDone: () => void;
}) {
  const bills = onlyOrderId ? row.orders.filter((o) => o.id === onlyOrderId) : row.orders;
  const owed = bills.reduce((s, o) => s + o.duePaisa, 0);
  /*  P7-9 (31 Aug) — the shop's own payment list, the same one the sell screen
      reads. Without it this dialog fell back to the built-in four, which carry
      no accounts, so the "Which account…" picker never appeared and the server
      refused every cash collection with "Say which Cash the money went to —
      there are 2." Walked on the due board before it was fixed.  */
  const methods = usePaymentMethods(TILL_TENDERS);
  const pay = usePayRows(owed, methods[0]?.id ?? "CASH");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function collect() {
    setBusy(true); setErr(null);
    try {
      /*  oldest bill first — the shop's own habit, and it keeps the ageing
          report honest. Each bill takes from the methods in the order typed.  */
      const purses = pay.pays.filter((r) => r.amountPaisa > 0)
        .map((r) => ({ method: r.method.toLowerCase(), accountId: r.accountId, left: r.amountPaisa }));
      for (const o of [...bills].sort((a, b) => +new Date(a.placedAt) - +new Date(b.placedAt))) {
        let need = o.duePaisa;
        const parts: { method: string; amountPaisa: number; accountId?: string }[] = [];
        for (const purse of purses) {
          if (need <= 0) break;
          const take = Math.min(purse.left, need);
          if (take > 0) { parts.push({ method: purse.method, amountPaisa: take, accountId: purse.accountId }); purse.left -= take; need -= take; }
        }
        if (parts.length) await posCollectDue({ orderId: o.id, payments: parts });
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not collect the due");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PayDialog
      title="Collect due" who={`${row.name} · ${row.phone}`}
      owedPaisa={owed} owedLabel="Owed"
      note={bills.length === 1
        ? `${bills[0].orderNo} · ${new Date(bills[0].placedAt).toLocaleDateString()}`
        : `${bills.length} bills · oldest ${new Date(row.oldest).toLocaleDateString()}`}
      pay={pay} methods={methods} busy={busy} error={err}
      confirmLabel="Collect" leftLabel="Taking now"
      onConfirm={collect} onClose={onClose} />
  );
}

/* ================= SETTINGS ================= */
export function PosSettings() {
  const [s, setS] = useState<ApiPosSettings | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(patch: Partial<ApiPosSettings>) {
    try {
      setS(await updatePosSettings(patch));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch { /* the next load tells the truth */ }
  }
  /*  no invented discount rules here either — an empty rule table means the
      shop has not written one yet, and the screen should say exactly that  */
  const [rules, setRules] = useState<{ cat: string; cap: string; appr: string }[]>([]);

  useEffect(() => {
    posSettings().then(setS).catch(() => {});
    posDiscountRules().then((r) => {
      if (r.length) setRules(r.map((x) => ({ cat: x.categoryId ?? x.productId ?? "—", cap: `${x.maxPercent}%`, appr: x.requiresApproval ? "Yes" : "No" })));
    }).catch(() => {});
  }, []);
  return (
    <div className={wrap}>
      <Head title="POS settings" sub="Everything admin-configurable — no business value is hardcoded." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <div className={card + " p-5"}>
          <h3 className="font-display text-[16px] text-purple m-0 mb-3">Discount rules (per category)</h3>
          <p className="text-[12px] text-body-soft mb-3">Category cap with an optional per-product override. Over the cap needs manager approval.</p>
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-body-soft"><th className="py-2 font-medium">Category</th><th className="py-2 font-medium">Max discount</th><th className="py-2 font-medium">Approval</th></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.cat} className="border-t border-lavender-deep"><td className="py-2.5 font-medium text-purple">{r.cat}</td><td className="py-2.5">{r.cap}</td><td className="py-2.5 text-body-soft">{r.appr}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-5">
          {/*  Everything here is the shop's to set (owner, 21 Aug: nothing on this
               screen could be changed). Each field saves as it is left.  */}
          {/*  ⚠️ P7-18 (31 Aug 2026) — these are UNCONTROLLED inputs with
               `defaultValue`, and React only reads that on the first render.
               The settings arrive a moment later, so every box sat at 0 no
               matter what the shop had saved — and worse, leaving a box then
               SAVED that 0 over the real number. The credit limit read 0 for
               days for exactly this reason.
               `key` on the wrapper remounts the fields the moment the real
               values land, which is what makes `defaultValue` honest again.  */}
          <div className={card + " p-5"} key={s?.id ?? "loading"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-1">Cash &amp; receipt</h3>
            <p className="text-[12.5px] text-body-soft m-0 mb-3">
              {s ? <>Saved as soon as you leave a box.{saved && <span className="text-[#76efab] font-medium"> · saved</span>}</> : "Reading the shop's settings…"}
            </p>
            <div className="space-y-3 text-[13px]">
              <div>
                <label className="lbl">Default opening float (৳)</label>
                <input className="ipt" inputMode="decimal" defaultValue={String((s?.openingFloatDefaultPaisa ?? 0) / 100)}
                  onBlur={(e) => save({ openingFloatDefaultPaisa: Math.max(0, Math.round(Number(e.target.value) * 100)) })} />
              </div>
              {/*  DEC-GBL-002 — one VAT rate for the shop, and Finance owns it
                   (it is what the government challan prints). The till used to
                   keep a second rate of its own.  */}
              <div>
                <label className="lbl">VAT rate</label>
                <div className="flex items-center justify-between gap-3 border border-lavender-deep rounded-[12px] px-3.5 h-[40px] bg-[#271f30]">
                  <span className="text-[13.5px] font-medium text-purple">
                    {(s?.defaultTaxRateBps ?? 0) === 0 ? "No VAT" : `${(s?.defaultTaxRateBps ?? 0) / 100}%`}
                  </span>
                  <Link href="/finance/settings" className="text-[12px] underline text-body-soft shrink-0">
                    Set in Finance
                  </Link>
                </div>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-[#7a2ea8]"
                  checked={s?.giftReceiptHidePrice ?? true}
                  onChange={(e) => save({ giftReceiptHidePrice: e.target.checked })} />
                <span>Gift receipt hides the price</span>
              </label>
              <div>
                <label className="lbl">Default credit limit (৳)</label>
                <input className="ipt" inputMode="decimal" defaultValue={String((s?.defaultCreditLimitPaisa ?? 0) / 100)}
                  onBlur={(e) => save({ defaultCreditLimitPaisa: Math.max(0, Math.round(Number(e.target.value) * 100)) })} />
              </div>
              <div>
                <label className="lbl">Receipt header</label>
                <input className="ipt" defaultValue={s?.receiptHeader ?? ""} placeholder="Radian Flower &amp; Gift"
                  onBlur={(e) => save({ receiptHeader: e.target.value || null })} />
              </div>
              <div>
                <label className="lbl">Receipt footer</label>
                <input className="ipt" defaultValue={s?.receiptFooter ?? ""} placeholder="Thank you — come again"
                  onBlur={(e) => save({ receiptFooter: e.target.value || null })} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ================= ADVANCE ORDERS (DEC-POS-022) ================= */

/**
 * Ordered today, taken later. The owner's three rules, 21 Aug:
 *   · the stock leaves on the day it is handed over, not the day it is ordered
 *   · whatever is paid today is an advance; the rest is a due like any other
 *   · it waits here until "Hand over", which takes the rest and moves the stock
 */
export function PosAdvanceOrders() {
  const [rows, setRows] = useState<ApiPosAdvance[]>([]);
  const [open, setOpen] = useState<ApiPosAdvance | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => posAdvanceOrders().then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const days = (iso: string | null) => (iso ? Math.round((+new Date(iso) - Date.now()) / 86_400_000) : null);
  const owed = rows.reduce((s, r) => s + r.duePaisa, 0);

  return (
    <div className={wrap}>
      <Head title="Advance orders" sub="Ordered now, taken later. The goods stay on the shelf until the day comes — hand over here." />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5 max-w-[560px]">
        <Stat label="Waiting" value={String(rows.length)} tone="plum" />
        <Stat label="Still to collect" value={formatTaka(owed)} tone="amber" />
        <Stat label="Next one" value={rows[0]?.promisedBy ? new Date(rows[0].promisedBy).toLocaleDateString() : "—"} tone="orchid" />
      </div>

      <div className={card + " overflow-hidden"}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-white" style={{ background: "linear-gradient(90deg,#5a1385,#7a2ea8)" }}>
              <th className="px-4 py-2.5 font-medium">Bill</th>
              <th className="px-4 py-2.5 font-medium">Customer</th>
              <th className="px-4 py-2.5 font-medium">Taking it</th>
              <th className="px-4 py-2.5 font-medium">What is on it</th>
              <th className="px-4 py-2.5 font-medium text-right">Paid / still owed</th>
              <th className="px-4 py-2.5 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = days(r.promisedBy);
              const late = d !== null && d < 0;
              const today = d === 0;
              return (
                <tr key={r.id} className={"border-t border-lavender-deep " + (late ? "bg-[#3c2e17]" : today ? "bg-[#1c3424]" : "hover:bg-lavender/30")}>
                  <td className="px-4 py-2.5">
                    <Link href={`/orders/${r.id}`} className="font-mono font-semibold text-purple text-[12.5px] hover:underline">{r.orderNo}</Link>
                    <div className="text-[11px] text-body-soft">ordered {new Date(r.placedAt).toLocaleDateString()}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-purple">{r.customerName}</div>
                    <div className="text-[12px] text-body-soft">{r.customerPhone}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.promisedBy ? new Date(r.promisedBy).toLocaleDateString() : "—"}
                    <div className={"text-[11.5px] " + (late ? "text-[#f7a96e] font-medium" : "text-body-soft")}>
                      {d === null ? "" : late ? `${-d} day${-d === 1 ? "" : "s"} overdue` : today ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-body-soft">
                    {r.lines.slice(0, 3).map((l) => `${l.name} ×${l.qty}`).join(", ")}
                    {r.lines.length > 3 ? ` +${r.lines.length - 3} more` : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div>{formatTaka(r.paidPaisa)} of {formatTaka(r.totalPaisa)}</div>
                    {r.duePaisa > 0 && <div className="text-[12px] text-[#f7a96e] font-medium">{formatTaka(r.duePaisa)} to collect</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button type="button" onClick={() => { setErr(null); setOpen(r); }}
                      className="text-[12px] text-white bg-purple font-medium rounded-[8px] px-3 py-1.5">Hand over</button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-body-soft">No advance order is waiting.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && <HandOver row={open} busy={busy} err={err}
        onClose={() => setOpen(null)}
        onDone={async (payments) => {
          setBusy(true); setErr(null);
          try {
            await posHandOverAdvance(open.id, { payments });
            setOpen(null);
            await load();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not hand it over");
          } finally { setBusy(false); }
        }} />}
    </div>
  );
}

function HandOver({ row, busy, err, onClose, onDone }: {
  row: ApiPosAdvance; busy: boolean; err: string | null;
  onClose: () => void; onDone: (p: { method: string; amountPaisa: number }[]) => void;
}) {
  // P7-9 — the shop's list here too, or a hand-over with money still owed dies the same way
  const methods = usePaymentMethods(TILL_TENDERS);
  const pay = usePayRows(row.duePaisa, methods[0]?.id ?? "CASH");
  const rest = pay.pays.filter((r) => r.amountPaisa > 0)
    .map((r) => ({ method: r.method.toLowerCase(), amountPaisa: r.amountPaisa, accountId: r.accountId }));

  /*  nothing left to collect: it is a hand-over, not a payment, so the dialog
      says so and the button simply releases the goods  */
  if (row.duePaisa === 0) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center px-4" style={{ background: "rgba(40,20,50,.45)" }} onClick={onClose}>
        <div className="w-full max-w-[380px] rounded-[16px] text-white shadow-lift p-4"
          style={{ background: "linear-gradient(170deg,#3c0a5a,#26063a)" }} onClick={(e) => e.stopPropagation()}>
          <div className="text-[12px] text-[#c9a6e4] font-medium uppercase tracking-[0.06em]">Hand over</div>
          <div className="text-[14px] font-medium mb-3">{row.orderNo} · {row.customerName}</div>
          <div className="rounded-[12px] px-3 py-3 text-center mb-3" style={{ background: "rgba(127,224,168,.14)" }}>
            <div className="text-[10.5px] uppercase tracking-[0.08em] font-medium" style={{ color: "#7fe0a8" }}>Already paid in full</div>
            <div className="text-[26px] font-semibold font-display" style={{ color: "#bff3d5" }}>{formatTaka(row.totalPaisa)}</div>
          </div>
          <p className="text-[12px] text-[#c9a6e4] mt-0 mb-3">The stock leaves the shelf when you press this.</p>
          {err && <div className="mb-2 text-[11.5px] text-[#ff9b9b] bg-white/10 rounded-[8px] px-3 py-2">{err}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-3 rounded-[12px] text-[13.5px] font-medium border border-white/25 text-white bg-white/10">Cancel</button>
            <button type="button" disabled={busy} onClick={() => onDone([])}
              className="flex-1 bg-white text-purple text-[14.5px] py-3 rounded-[12px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">
              <Icon name="check" size={17} /> {busy ? "Working…" : "Hand it over"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PayDialog
      title="Hand over" who={`${row.orderNo} · ${row.customerName}`}
      owedPaisa={row.duePaisa} owedLabel="Still to collect"
      note={`${formatTaka(row.paidPaisa)} paid in advance · the stock leaves when this is done`}
      pay={pay} methods={methods} busy={busy} error={err}
      confirmLabel="Take & hand over" leftLabel="Taking now"
      dueAfterLabel="Still owed after this" clearedLabel="Settled"
      onConfirm={() => onDone(rest)} onClose={onClose} />
  );
}
