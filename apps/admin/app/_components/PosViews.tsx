"use client";

import { useEffect, useState } from "react";
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
  posCloseShift,
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
import { PayDialog, usePayRows } from "./MoneyBlock";

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
                  {s.duePaisa > 0 && <div className="text-[11.5px] text-[#b45309]">{formatTaka(s.duePaisa)} due</div>}
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
                { href: "/pos/sell", label: "New sale", icon: "cash", from: "#7a2ea8", to: "#470066" },
                { href: "/pos/day-close", label: "Day-close", icon: "clock", from: "#159b63", to: "#0e6e46" },
                { href: "/pos/due", label: "Collect due", icon: "user", from: "#c98089", to: "#a85a64" },
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

        {err && <p className="text-[12px] text-[#c0392b] mt-3 mb-0">{err}</p>}

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
            <Link href="/pos/day-close" className="block text-center mt-2 bg-white hover:bg-white/90 text-[#0d5f3f] text-[13.5px] py-2.5 rounded-[11px] font-bold">Start day-close</Link>
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
                  {s.duePaisa > 0 && <span className="text-[#b45309] font-normal"> · {formatTaka(s.duePaisa)} due</span>}
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
                <td className="px-4 py-2.5 text-right font-medium">{formatTaka(s.totalPaisa)}{s.duePaisa > 0 && <span className="block text-[11px] text-[#b45309]">{formatTaka(s.duePaisa)} due</span>}</td>
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
              {rx.duePaisa > 0 && <div className="flex justify-between text-[#b45309]"><span>Due</span><span>{formatTaka(rx.duePaisa)}</span></div>}
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
export function PosDayClose() {
  const [shift, setShift] = useState<ApiPosShift | null>(null);
  const [sum, setSum] = useState<ApiPosShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    posCurrentShift()
      .then(async (s) => {
        setShift(s);
        if (s) setSum(await posShiftSummary(s.id).catch(() => null));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  /*  P7-5 — this used to fall back to the literal 1226000 when no shift was
      open, so a screen whose whole job is counting money printed ৳12,260 that
      belonged to nothing. A money screen shows what it knows or shows nothing.  */
  const expected = sum?.expectedCashPaisa ?? 0;
  /*  P7-7 — the count is kept in PAISA and the box holds its own draft while it
      is being typed. It used to be a controlled number input rewritten as
      Math.round(actual/100) on every keystroke, so the decimal point never
      survived: a drawer expecting ৳15,156.76 could not be counted, and closing
      it wrote a 24-paisa "over" that never existed.  */
  const [draft, setDraft] = useState("");
  const actual = Math.round((Number(draft) || 0) * 100);
  const counted = draft.trim() !== "" && Number.isFinite(Number(draft));
  const over = actual - expected;
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function doClose() {
    if (!shift) { setErr("No open shift to close."); return; }
    if (!counted) { setErr("Count the drawer first — type what is actually in it."); return; }
    setBusy(true); setErr(null);
    try { await posCloseShift(shift.id, { countedCashPaisa: actual }); setClosed(true); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not close the shift"); }
    finally { setBusy(false); }
  }
  return (
    <div className={wrap}>
      <Head title="Day-close" sub="Count the drawer and match it against the system — shortfall or excess is flagged, never blocked." />
      {!loading && !shift && (
        <div className={card + " p-6 max-w-[820px] text-center"}>
          <h3 className="font-display text-[16px] text-purple m-0 mb-2">No shift is open</h3>
          <p className="text-[13px] text-body-soft mb-3">There is no drawer to count. Open a shift on the Sell screen when the counter starts.</p>
          <Link href="/pos/sell" className="inline-block bg-purple text-white text-[13px] px-4 py-2 rounded-[10px] font-semibold">Go to Sell</Link>
        </div>
      )}
      {shift && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start max-w-[820px]">
        <div className={card + " p-5"}>
          <h3 className="font-display text-[16px] text-purple m-0 mb-3">System expects{sum?.shiftNo ? ` · ${sum.shiftNo}` : ""}</h3>
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between"><span className="text-body-soft">Opening float</span><span>{formatTaka(shift.openingFloatPaisa)}</span></div>
            <div className="flex justify-between"><span className="text-body-soft">Cash movements</span><span className="text-[#0e7a3d]">+ {formatTaka(expected - shift.openingFloatPaisa)}</span></div>
            <div className="flex justify-between border-t border-lavender-deep pt-2"><span className="text-purple font-medium">Expected cash</span><span className="font-semibold text-purple">{formatTaka(expected)}</span></div>
          </div>
          {sum && (
            <div className="mt-3 pt-3 border-t border-lavender-deep space-y-2 text-[13px]">
              <div className="flex justify-between"><span className="text-body-soft">Bills on this shift</span><span>{sum.count}</span></div>
              <div className="flex justify-between"><span className="text-body-soft">Sales</span><span>{formatTaka(sum.salesPaisa)}</span></div>
              {sum.duePaisa > 0 && <div className="flex justify-between"><span className="text-body-soft">Still owed on them</span><span className="text-[#b45309]">{formatTaka(sum.duePaisa)}</span></div>}
              <div className="flex justify-between"><span className="text-body-soft">Open since</span><span>{fmtDateTime(sum.openedAt)}</span></div>
            </div>
          )}
        </div>
        <div className={card + " p-5"}>
          <h3 className="font-display text-[16px] text-purple m-0 mb-3">Counted in drawer</h3>
          <label className="text-[12.5px] text-body-soft font-medium mb-1 block">Actual cash counted ৳ (paisa allowed)</label>
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
              {over === 0 ? "Matches exactly ✓" : over > 0 ? `Excess: ${formatTaka(over)} (more in drawer)` : `Shortfall: ${formatTaka(-over)} (missing)`}
            </div>
          )}
          <button type="button" onClick={doClose} disabled={busy || closed} className="w-full mt-4 bg-purple hover:bg-purple-deep text-white text-[14px] py-3 rounded-[12px] font-bold disabled:opacity-50">{closed ? "Shift closed ✓" : busy ? "Closing…" : "Close shift"}</button>
          {err && <p className="text-[11.5px] text-[#c0392b] mt-2 mb-0">{err}</p>}
        </div>
      </div>
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
                <tr key={o.id} className={"border-t border-lavender-deep " + (age >= 7 ? "bg-[#fff7ec]" : "hover:bg-lavender/30")}>
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
                    <span className={age >= 7 ? "text-[#b45309] font-medium" : ""}> · {age === 0 ? "today" : `${age} days`}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-[#b45309]">{formatTaka(o.duePaisa)}</td>
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
  const pay = usePayRows(owed);
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
      pay={pay} busy={busy} error={err}
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
          <div className={card + " p-5"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-1">Cash &amp; receipt</h3>
            <p className="text-[12.5px] text-body-soft m-0 mb-3">Saved as soon as you leave a box.{saved && <span className="text-[#0e7a3d] font-medium"> · saved</span>}</p>
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
                <div className="flex items-center justify-between gap-3 border border-lavender-deep rounded-[12px] px-3.5 h-[40px] bg-[#faf8fc]">
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
                <tr key={r.id} className={"border-t border-lavender-deep " + (late ? "bg-[#fff4e2]" : today ? "bg-[#f2fbf5]" : "hover:bg-lavender/30")}>
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
                    <div className={"text-[11.5px] " + (late ? "text-[#b45309] font-medium" : "text-body-soft")}>
                      {d === null ? "" : late ? `${-d} day${-d === 1 ? "" : "s"} overdue` : today ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-body-soft">
                    {r.lines.slice(0, 3).map((l) => `${l.name} ×${l.qty}`).join(", ")}
                    {r.lines.length > 3 ? ` +${r.lines.length - 3} more` : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div>{formatTaka(r.paidPaisa)} of {formatTaka(r.totalPaisa)}</div>
                    {r.duePaisa > 0 && <div className="text-[12px] text-[#b45309] font-medium">{formatTaka(r.duePaisa)} to collect</div>}
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
  const pay = usePayRows(row.duePaisa);
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
      pay={pay} busy={busy} error={err}
      confirmLabel="Take & hand over" leftLabel="Taking now"
      dueAfterLabel="Still owed after this" clearedLabel="Settled"
      onConfirm={() => onDone(rest)} onClose={onClose} />
  );
}
