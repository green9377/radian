"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  posCancelAdvance,
  type ApiPosAdvance,
  posSettings,
  posDiscountRules,
  updatePosSettings,
  posVoidSale,
  posRegisters,
  listPaymentMethods,
  type ApiPosRegister,
  type ApiPaymentMethod,
  type ApiPosSale,
  type ApiPosDue,
  type ApiPosShift,
  type ApiPosSettings,
  type ApiPosAnalytics,
} from "../_data/api";
import { PayDialog, PaymentLines, RefundDialog, usePayRows, usePaymentMethods, TILL_TENDERS } from "./MoneyBlock";
import ReceiptDialog, { ReceiptPreview, sampleReceipt } from "./PosReceipt";

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
/*  ── POS audit 11 Sep 2026 §3 #19 ───────────────────────────────────────────
    Three things were wrong with this screen and all three were the same thing:
    it looked like a way into a bill and was not one.

      · the rows linked NOWHERE. `/pos/sale/:id` existed and was reachable only
        in the seconds after a sale, through the Sell screen's `router.push`;
      · "Reprint" opened a four-line summary with no items, no prices, no VAT and
        no discount, and its Print button called `window.print()` on the WHOLE
        admin page — sidebar, chrome and all;
      · the list is a 90-day fetch filtered in the browser and said so nowhere,
        so an older bill that was simply not in the window read as "no match".

    Now: every row opens its bill, Reprint prints the real slip (PosReceipt) and
    nothing else, a wrong bill can be voided from here (§3 #21), and the screen
    states the window it actually covers.  */
export function PosSalesHistory() {
  const [q, setQ] = useState("");
  const [sales, setSales] = useState<ApiPosSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rx, setRx] = useState<string | null>(null);
  const [voidRow, setVoidRow] = useState<ApiPosSale | null>(null);
  /*  the open cash box, read once: a bill from an older box cannot be voided
      (the box has been counted and its over/short posted), so the button is not
      offered there at all — see PosSaleView for the same four rules  */
  const [drawerOpenedAt, setDrawerOpenedAt] = useState<string | null>(null);
  const [drawerKnown, setDrawerKnown] = useState(false);

  const DAYS = 90;
  const load = useCallback(() => {
    setLoading(true);
    posListSales({ days: DAYS })
      .then((r) => { setSales(r); setErr(null); })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not read the sales"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    posDay()
      .then((d) => setDrawerOpenedAt(d.drawer.isOpen ? d.drawer.openedAt : null))
      .catch(() => setDrawerOpenedAt(null))
      .finally(() => setDrawerKnown(true));
  }, []);

  const list = sales.filter((s) => (s.orderNo + (s.customer?.name ?? s.senderName)).toLowerCase().includes(q.toLowerCase()));

  /** why Void is not offered on this row — null means it is */
  const voidBlock = (s: ApiPosSale): string | null => {
    if (s.salesStatus === "cancelled") return null;   // already void; no button either way
    if ((s.refundPaisa ?? 0) > 0) return "Returns has already paid money back on this bill.";
    if (!drawerKnown) return "Checking the cash box…";
    if (!drawerOpenedAt) return "The cash box is closed — unwind this one in Returns.";
    if (+new Date(s.placedAt) < +new Date(drawerOpenedAt)) return "This bill is from a cash box that has already been counted.";
    return null;
  };

  return (
    <div className={wrap}>
      <Head title="Sales history" sub="Every counter bill of the last 90 days — open it, print its receipt, or void one that was rung up by mistake." />
      <div className={card + " p-4 mb-4"}>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-soft"><Icon name="search" size={17} /></span>
          <input className="ipt h-[42px] ipt-icon" placeholder="Search by receipt no or customer…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {/*  SAY WHAT THE LIST IS. The fetch asks for 90 days and the server caps
             it at 200 rows; the search box then filters what came back, in the
             browser. A cashier hunting a bill from March deserves to know that
             rather than to read "No sales match".  */}
        <p className="text-[11.5px] text-body-soft m-0 mt-2">
          {loading ? "Reading the last 90 days…" : `${list.length} of ${sales.length} bill(s) from the last ${DAYS} days.`}
          {" "}The search filters this list only — an older bill is not in it. {sales.length >= 200 && <b>The server sends at most 200 bills, so this is the most recent 200.</b>}
        </p>
      </div>

      {err && <div className="rounded-[12px] px-4 py-3 mb-4 text-[13px]" style={{ background: "#3a1616", color: "#ff9c92" }}>{err}</div>}

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
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const voided = s.salesStatus === "cancelled";
              const advance = s.salesStatus === "placed";
              const block = voidBlock(s);
              return (
                <tr key={s.id} className={"border-t border-lavender-deep " + (voided ? "opacity-60" : "hover:bg-lavender/30")}>
                  <td className="px-4 py-2.5">
                    {/*  the row opens the bill — the whole point of the screen  */}
                    <Link href={`/pos/sale/${s.id}`} className="font-medium text-purple hover:underline">{s.orderNo}</Link>
                    {s.isGift && <span className="text-orchid text-[11px]"> · gift</span>}
                    {/*  §4 — an advance order is NOT a completed sale; it showed
                         here as one with a due beside it and nothing said the
                         goods were still on the shelf  */}
                    {advance && <span className="block text-[11px] text-[#f7a96e]">advance — not handed over</span>}
                    {voided && <span className="block text-[11px] text-[#ff9c92] font-medium">VOIDED</span>}
                  </td>
                  <td className="px-4 py-2.5 text-body-soft">{fmtDateTime(s.placedAt)}</td>
                  <td className="px-4 py-2.5"><Link href={`/pos/sale/${s.id}`} className="hover:underline">{s.customer?.name ?? s.senderName}</Link></td>
                  <td className="px-4 py-2.5">{s._count?.lines ?? 0}</td>
                  <td className="px-4 py-2.5 text-body-soft">{methodLabel(s)}</td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    <span className={voided ? "line-through" : ""}>{formatTaka(s.totalPaisa)}</span>
                    {!voided && s.duePaisa > 0 && <span className="block text-[11px] text-[#f7a96e]">{formatTaka(s.duePaisa)} due</span>}
                    {(s.refundPaisa ?? 0) > 0 && <span className="block text-[11px] text-[#f7a96e]">{formatTaka(s.refundPaisa ?? 0)} refunded</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => setRx(s.id)}
                      className="text-[12px] text-purple font-medium inline-flex items-center gap-1 border border-lavender-deep rounded-[8px] px-2.5 py-1.5 hover:border-orchid-mid">
                      <Icon name="hash" size={13} /> Receipt
                    </button>
                    {/*  the button is not offered where the API would refuse it,
                         and the row says why instead of leaving a dead button  */}
                    {!voided && (
                      block
                        ? <div className="text-[11px] text-body-soft mt-1 max-w-[190px] ml-auto leading-snug">{block}</div>
                        : <button type="button" onClick={() => setVoidRow(s)}
                            className="text-[12px] font-medium rounded-[8px] px-2.5 py-1.5 ml-1.5 border"
                            style={{ color: "#ff9c92", borderColor: "#6a2a25", background: "#2c1413" }}>
                            Void
                          </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-body-soft">
                {loading ? "Reading…" : q ? `No bill in the last ${DAYS} days matches "${q}".` : "No counter sales in the last 90 days."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {rx && <ReceiptDialog orderId={rx} onClose={() => setRx(null)} />}
      {voidRow && (
        <VoidSaleDialog
          sale={voidRow}
          onClose={() => setVoidRow(null)}
          onDone={() => { setVoidRow(null); load(); }}
        />
      )}
    </div>
  );
}

/**
 * POS audit §3 #21 — the same undo as the bill page, from the row.
 *
 * It states the consequences before it asks, because each one is a real movement
 * somebody has to be able to explain later: the goods go back on the shelf, the
 * money is reversed, and a cash bill takes the notes back out of the drawer. The
 * reason is required — the server refuses without one and it goes on the
 * order's timeline.
 */
function VoidSaleDialog({ sale, onClose, onDone }: { sale: ApiPosSale; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const advance = sale.salesStatus === "placed";
  const cashBack = (sale.transactions ?? [])
    .filter((t) => t.method.toUpperCase() === "CASH")
    .reduce((n, t) => n + t.amountPaisa, 0);

  async function go() {
    const r = reason.trim();
    if (!r) { setErr("Say why this bill is being voided — it goes on the record."); return; }
    setBusy(true); setErr(null);
    try { await posVoidSale(sale.id, { reason: r }); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not void the bill"); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-4" {...backdropClose(onClose)}>
      <div className="bg-white rounded-[16px] shadow-lift p-6 w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-[18px] text-purple m-0 mb-1">Void {sale.orderNo}?</h3>
        <p className="text-[12.5px] text-body-soft m-0 mb-4">
          {sale.customer?.name ?? sale.senderName} · {fmtDateTime(sale.placedAt)} · {formatTaka(sale.totalPaisa)}
        </p>

        <div className="rounded-[12px] px-4 py-3 mb-4 text-[12.5px]" style={{ background: "#3a2d10", color: "#f5c451" }}>
          <b className="block mb-1.5">What happens when you press it</b>
          <ul className="m-0 pl-4 space-y-1">
            {advance
              ? <li>The order is cancelled. No stock moves — an advance order never took any off the shelf.</li>
              : <li>Every item goes back on the shelf.</li>}
            {sale.paidPaisa > 0
              ? <li>{formatTaka(sale.paidPaisa)} of payment is reversed.</li>
              : <li>Nothing was paid on this bill, so no money moves.</li>}
            {cashBack > 0 && <li>{formatTaka(cashBack)} comes back OUT of the cash box — take the notes out of the drawer now.</li>}
            <li>The bill stays visible, marked cancelled, with your reason on it.</li>
          </ul>
        </div>

        <label className="text-[12.5px] text-body-soft font-medium mb-1 block">Why</label>
        <input className="ipt h-[44px] mb-3" autoFocus placeholder="In your own words" value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy) void go(); }} />

        {err && <p className="text-[12px] text-[#e1837a] m-0 mb-3">{err}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-[11px] border border-lavender-deep text-purple font-bold text-[13px]">Keep the bill</button>
          <button type="button" onClick={go} disabled={busy}
            className="flex-1 py-2.5 rounded-[11px] text-white font-bold text-[13px] disabled:opacity-50" style={{ background: "#a33a32" }}>
            {busy ? "Voiding…" : "Void it"}
          </button>
        </div>
      </div>
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
            <Stat label={expected < 0 ? "Cash box is short" : "Cash box should hold"} value={formatTaka(expected)} tone={expected < 0 ? "amber" : "green"} />
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
                    <div className="flex justify-between">
                      <span className="text-body-soft">Cash in and out since</span>
                      <span className={expected - open.openingFloatPaisa < 0 ? "text-[#c0392b]" : "text-[#0e7a3d]"}>{formatTaka(expected - open.openingFloatPaisa)}</span>
                    </div>
                    <div className="flex justify-between border-t border-lavender-deep pt-2"><span className="text-purple font-medium">Should be in the box</span><span className="font-semibold text-purple">{formatTaka(expected)}</span></div>
                  </div>

                  {/*  ⚠️ A NEGATIVE BOX IS NOT AN ARITHMETIC ERROR, it is a
                      real thing that happened: more cash was paid OUT of this
                      box than ever came in — a refund handed over at the
                      counter on a day the till had barely taken anything. The
                      screen says which, because the alternative is a person
                      staring at a minus sign while counting notes.  */}
                  {expected < 0 && (
                    <div className="rounded-[11px] px-3 py-2 mb-3 text-[12px] font-medium" style={{ background: "#3a1616", color: "#ff9c92" }}>
                      More cash has gone out of this box than came into it — {formatTaka(-expected)} more. Look at the movements below: a refund or a cash-out was paid from money that was never in the box. Count what is actually there; the difference will show as an excess.
                    </div>
                  )}

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
                        placeholder={(Math.max(0, expected) / 100).toFixed(2)}
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
  /*  audit §4 — "Oldest" read bills[0] AFTER the search filter, so typing a
      name changed a figure that is about the whole board. The four tiles
      describe what the shop is owed, not what is on screen.  */
  const oldestDays = rows.length
    ? Math.max(...rows.flatMap((r) => r.orders.map((o) => days(o.placedAt))))
    : null;

  return (
    <div className={wrap}>
      <Head title="Due board" sub="Every unpaid counter bill, oldest first — who owes it, since when, and what is still open on it." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 max-w-[760px]">
        <Stat label="Total outstanding" value={formatTaka(total)} tone="amber" />
        <Stat label="Bills open" value={String(rows.reduce((n, r) => n + r.orders.length, 0))} tone="plum" />
        <Stat label="Customers" value={String(rows.length)} tone="orchid" />
        <Stat label="Oldest" value={oldestDays === null ? "—" : `${oldestDays} days`} tone="plum" />
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
 *
 * ── POS audit 11 Sep 2026 §3 #20 ────────────────────────────────────────────
 * MULTI-BILL COLLECTION WAS A LOOP OF SEPARATE POSTS with one shared error line.
 * "All ৳X" fired one `posCollectDue` per bill; a failure on bill 3 of 5 left 1
 * and 2 collected, showed a single red line that named none of them, and left
 * the dialog sitting there with the full amount still typed in — so the obvious
 * thing to do next, pressing Collect again, took the first two bills' money a
 * second time. There is no multi-bill endpoint, so this cannot be made one
 * transaction from here. What it CAN be is honest:
 *
 *   · every bill is posted on its own and reports its own outcome, live;
 *   · a failure STOPS the run — the bills after it are never attempted;
 *   · when the run has been through once, the payment form does not come back.
 *     The only way on is Close, which reloads the board, so a retry is always
 *     against what is really still owed and never against a bill already paid;
 *   · a second submit while one is in flight is refused twice over — a ref that
 *     the click handler reads synchronously, and the dialog's own busy state.
 */
type CollectOutcome = {
  orderId: string;
  orderNo: string;
  amountPaisa: number;
  state: "waiting" | "working" | "done" | "failed" | "not attempted";
  error?: string;
};

function CollectDue({ row, onlyOrderId, onClose, onDone }: {
  row: ApiPosDue; onlyOrderId?: string; onClose: () => void; onDone: () => void;
}) {
  const bills = onlyOrderId ? row.orders.filter((o) => o.id === onlyOrderId) : row.orders;
  const owed = bills.reduce((s, o) => s + o.duePaisa, 0);
  /*  P7-9 (31 Aug) — the shop's own payment list, the same one the sell screen
      reads. Without it this dialog fell back to the built-in four, which carry
      no accounts, so the "Which account…" picker never appeared and the server
      refused every cash collection with "Say which Cash the money went to —
      there are 2." Walked on the due board before it was fixed.
      (POS audit §3 #26) — narrowed to the methods the shop says the counter
      takes, so DEC-POS-021 finally decides something.  */
  const methods = usePaymentMethods(useTillTenders());
  const pay = usePayRows(owed, methods[0]?.id ?? "CASH");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [run, setRun] = useState<CollectOutcome[] | null>(null);
  /*  state is not read back synchronously inside one click, and a double-press
      on a slow link is exactly the failure this whole item is about  */
  const inFlight = useRef(false);

  async function collect() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setErr(null);

    /*  oldest bill first — the shop's own habit, and it keeps the ageing
        report honest. Each bill takes from the methods in the order typed.  */
    const ordered = [...bills].sort((a, b) => +new Date(a.placedAt) - +new Date(b.placedAt));
    const purses = pay.pays.filter((r) => r.amountPaisa > 0)
      .map((r) => ({ method: r.method.toLowerCase(), accountId: r.accountId, left: r.amountPaisa }));

    /*  work out every bill's share BEFORE any of it is sent, so the plan the
        cashier is watching is the plan that runs  */
    const plan = ordered.map((o) => {
      let need = o.duePaisa;
      const parts: { method: string; amountPaisa: number; accountId?: string }[] = [];
      for (const purse of purses) {
        if (need <= 0) break;
        const take = Math.min(purse.left, need);
        if (take > 0) { parts.push({ method: purse.method, amountPaisa: take, accountId: purse.accountId }); purse.left -= take; need -= take; }
      }
      return { o, parts, amountPaisa: parts.reduce((n, p) => n + p.amountPaisa, 0) };
    }).filter((p) => p.parts.length > 0);

    if (plan.length === 0) {
      setErr("Type how much is being paid.");
      setBusy(false); inFlight.current = false;
      return;
    }

    let state: CollectOutcome[] = plan.map((p) => ({
      orderId: p.o.id, orderNo: p.o.orderNo, amountPaisa: p.amountPaisa, state: "waiting",
    }));
    setRun(state);

    for (let i = 0; i < plan.length; i++) {
      state = state.map((r, n) => (n === i ? { ...r, state: "working" } : r));
      setRun(state);
      try {
        await posCollectDue({ orderId: plan[i].o.id, payments: plan[i].parts });
        state = state.map((r, n) => (n === i ? { ...r, state: "done" } : r));
        setRun(state);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "The server refused it";
        state = state.map((r, n) =>
          n === i ? { ...r, state: "failed", error: msg } : n > i ? { ...r, state: "not attempted" } : r);
        setRun(state);
        break;
      }
    }

    setBusy(false);
    inFlight.current = false;
  }

  /*  ---- the result of the run. It replaces the form on purpose: there is no
      second Collect here, because the amounts on that form are already spent. */
  if (run) {
    const took = run.filter((r) => r.state === "done").reduce((n, r) => n + r.amountPaisa, 0);
    const failed = run.find((r) => r.state === "failed");
    const finished = !busy;
    return (
      <div className="fixed inset-0 z-50 grid place-items-center px-4" style={{ background: "rgba(40,20,50,.45)" }}
        {...backdropClose(() => { if (finished) onDone(); })}>
        <div className="w-full max-w-[420px] rounded-[16px] text-white shadow-lift p-4"
          style={{ background: "linear-gradient(170deg,#3c0a5a,#26063a)" }} onClick={(e) => e.stopPropagation()}>
          <div className="text-[12px] text-[#c9a6e4] font-medium uppercase tracking-[0.06em]">Collecting</div>
          <div className="text-[14px] font-medium mb-3">{row.name} · {row.phone}</div>

          <div className="rounded-[12px] px-3 py-3 mb-3" style={{ background: "rgba(255,255,255,.07)" }}>
            {run.map((r) => (
              <div key={r.orderId} className="flex items-start justify-between gap-3 py-1.5 border-b border-white/10 last:border-0">
                <div className="min-w-0">
                  <div className="text-[13px] font-mono">{r.orderNo}</div>
                  {r.error && <div className="text-[11.5px] text-[#ff9b9b]">{r.error}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[13px]" style={{ fontVariantNumeric: "tabular-nums" }}>{formatTaka(r.amountPaisa)}</div>
                  <div className="text-[11px]" style={{
                    color: r.state === "done" ? "#7fe0a8" : r.state === "failed" ? "#ff9b9b" : "#c9a6e4",
                  }}>
                    {r.state === "done" ? "collected" : r.state === "working" ? "sending…" : r.state}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[12px] px-3 py-2.5 mb-3" style={{ background: "rgba(127,224,168,.14)" }}>
            <div className="text-[10.5px] uppercase tracking-[0.08em] font-medium" style={{ color: "#7fe0a8" }}>Taken</div>
            <div className="text-[19px] font-semibold font-display" style={{ color: "#7fe0a8", fontVariantNumeric: "tabular-nums" }}>{formatTaka(took)}</div>
          </div>

          {failed && finished && (
            <div className="text-[11.5px] text-[#ff9b9b] bg-white/10 rounded-[8px] px-3 py-2 mb-3">
              {failed.orderNo} was refused, so nothing after it was sent. The bills marked
              collected above are paid — do not take that money again. Close this and the
              board will show what is really still owed.
            </div>
          )}

          <button type="button" disabled={!finished} onClick={onDone}
            className="w-full bg-white hover:bg-[#f4ecf9] text-purple text-[14px] py-3 rounded-[12px] font-semibold disabled:opacity-40">
            {finished ? "Close" : "Working…"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <PayDialog
      title="Collect due" who={`${row.name} · ${row.phone}`}
      owedPaisa={owed} owedLabel="Owed"
      note={bills.length === 1
        ? `${bills[0].orderNo} · ${new Date(bills[0].placedAt).toLocaleDateString()}`
        : `${bills.length} bills · oldest first · each one is collected on its own`}
      pay={pay} methods={methods} busy={busy} error={err}
      confirmLabel="Collect" leftLabel="Taking now"
      onConfirm={collect} onClose={onClose} />
  );
}

/* ================= SETTINGS ================= */

/**
 * DEC-POS-021 — WHICH METHODS THIS COUNTER TAKES (POS audit §3 #26).
 *
 * `PosSetting.enabledMethods` was stored, had a DTO field, had a column, and was
 * read by absolutely nothing: the till used the shop-wide payment list instead
 * (DEC-GBL-001) and the setting had no screen at all. It is editable below now,
 * and this hook is what makes it mean something — every money dialog on these
 * screens offers only the methods the shop says it takes at the counter.
 *
 * An EMPTY list means "all of them", which is what the column's own default
 * says, so a shop that never opens this screen behaves exactly as before.
 */
function useTillTenders(): string[] {
  const [codes, setCodes] = useState<string[] | null>(null);
  useEffect(() => {
    posSettings()
      .then((s) => setCodes((s.enabledMethods ?? []).map((c) => c.toUpperCase())))
      .catch(() => setCodes(null));
  }, []);
  /*  while it is loading, and if it cannot be read, the built-in four: refusing
      to take money because a settings row did not answer is the worse failure  */
  return useMemo(() => (codes && codes.length ? codes : TILL_TENDERS), [codes]);
}

export function PosSettings() {
  const [s, setS] = useState<ApiPosSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [methods, setMethods] = useState<ApiPaymentMethod[]>([]);
  const [registers, setRegisters] = useState<ApiPosRegister[]>([]);
  const [giftPreview, setGiftPreview] = useState(false);

  async function save(patch: Partial<ApiPosSettings>) {
    try {
      await updatePosSettings(patch);
      /*  PATCH answers with the raw PosSetting row, which has the till's own
          stale `defaultTaxRateBps` column on it rather than Finance's live rate
          (DEC-GBL-002). Writing that answer straight into state made the VAT
          line change the moment any other box was saved. Re-read instead —
          `GET /pos/settings` is the one that resolves the rate.  */
      setS(await posSettings());
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
      if (r.length) setRules(r.map((x) => ({ cat: x.categoryId ?? x.productId ?? x.itemCategoryId ?? x.itemId ?? "—", cap: `${x.maxPercent}%`, appr: x.requiresApproval ? "Yes" : "No" })));
    }).catch(() => {});
    listPaymentMethods().then(setMethods).catch(() => setMethods([]));
    posRegisters().then(setRegisters).catch(() => setRegisters([]));
  }, []);

  const enabled = (s?.enabledMethods ?? []).map((c) => c.toUpperCase());
  const takesAll = enabled.length === 0;
  const toggleMethod = (code: string) => {
    const c = code.toUpperCase();
    /*  "all of them" is an empty list, so the first tick has to start from the
         full list and remove one — otherwise ticking a box would silently turn
         every other method OFF  */
    const base = takesAll ? methods.filter((m) => m.isActive).map((m) => m.code.toUpperCase()) : enabled;
    const next = base.includes(c) ? base.filter((x) => x !== c) : [...base, c];
    void save({ enabledMethods: next });
  };

  /*  the receipt settings, on paper, as they are typed (§4 / §5 #1)  */
  const preview = sampleReceipt({
    receiptHeader: s?.receiptHeader ?? null,
    receiptFooter: s?.receiptFooter ?? null,
    giftReceiptHidePrice: s?.giftReceiptHidePrice ?? true,
    taxRateBps: s?.defaultTaxRateBps ?? 0,
  });

  return (
    <div className={wrap}>
      <Head title="POS settings" sub="What the counter is allowed to do — discounts, the cash float, the printed slip, the methods it takes and the counters themselves. No business value is hardcoded." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <div className="flex flex-col gap-5">
          <div className={card + " p-5"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-3">Discount rules</h3>
            <p className="text-[12px] text-body-soft mb-3">
              The most a cashier may take off before a manager has to approve it (DEC-POS-006).
              {rules.length === 0 && " No rule has been written, so nothing is capped at the counter."}
            </p>
            {rules.length > 0 && (
              <table className="w-full text-[13px]">
                <thead><tr className="text-left text-body-soft"><th className="py-2 font-medium">Applies to</th><th className="py-2 font-medium">Max discount</th><th className="py-2 font-medium">Approval</th></tr></thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.cat} className="border-t border-lavender-deep"><td className="py-2.5 font-mono text-[11.5px] text-purple">{r.cat}</td><td className="py-2.5">{r.cap}</td><td className="py-2.5 text-body-soft">{r.appr}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {/*  §3 #16 — the table was read-only and printed a raw cuid under a
                 heading that said "Category". It still cannot be edited from
                 here; saying so is better than a table that looks editable.  */}
            <p className="text-[11.5px] text-body-soft m-0 mt-3">
              These are read-only here. The ids are shown as stored — there is no editor for
              discount rules yet, and `PUT /pos/discount-rules` has no screen behind it.
            </p>
          </div>

          {/*  §3 #26 — DEC-POS-021 given a face  */}
          <div className={card + " p-5"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-1">Methods the counter takes</h3>
            <p className="text-[12px] text-body-soft mb-3">
              The shop-wide list lives in Administration (DEC-GBL-001); this narrows it to what a
              person at the counter may be handed. {takesAll
                ? "Nothing is ticked, which means the counter takes every active method."
                : `${enabled.length} method(s) chosen.`}
            </p>
            <div className="flex flex-col gap-1.5">
              {methods.filter((m) => m.isActive).map((m) => {
                const on = takesAll || enabled.includes(m.code.toUpperCase());
                return (
                  <label key={m.id} className="flex items-center gap-2.5 cursor-pointer text-[13px]">
                    <input type="checkbox" className="w-4 h-4 accent-[#7a2ea8]" checked={on} onChange={() => toggleMethod(m.code)} />
                    <span className={on ? "text-purple font-medium" : "text-body-soft"}>{m.name}</span>
                    <span className="text-[11px] text-body-soft font-mono">{m.code}</span>
                  </label>
                );
              })}
              {methods.length === 0 && <p className="text-[12.5px] text-body-soft m-0">Could not read the shop&apos;s payment methods.</p>}
            </div>
            {!takesAll && (
              <button type="button" onClick={() => void save({ enabledMethods: [] })}
                className="text-[12px] text-purple underline mt-3">Take every active method again</button>
            )}
            <p className="text-[11.5px] text-body-soft m-0 mt-3">
              Honoured by the due board and the advance hand-over. The Sell screen still offers the
              shop-wide till list — see the handover note.
            </p>
          </div>

          {/*  §3 #27 — the route promised "methods, registers" and there was no
               register UI at all. Here is the list; they are still created by
               the lazy COUNTER-1 singleton and cannot be added from a screen.  */}
          <div className={card + " p-5"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-1">Counters</h3>
            <p className="text-[12px] text-body-soft mb-3">Where a bill is rung up. A counter is what a sale is stamped with.</p>
            <div className="flex flex-col">
              {registers.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-lavender-deep last:border-0 text-[13px]">
                  <span><span className="font-medium text-purple">{r.name}</span> <span className="font-mono text-[11.5px] text-body-soft">{r.code}</span></span>
                  <span className={"text-[11.5px] font-medium " + (r.isActive ? "text-[#76efab]" : "text-body-soft")}>{r.isActive ? "active" : "off"}</span>
                </div>
              ))}
              {registers.length === 0 && <p className="text-[12.5px] text-body-soft m-0">No counter exists yet — the first sale creates one.</p>}
            </div>
            <p className="text-[11.5px] text-body-soft m-0 mt-3">
              Read-only: a counter can only be created by the shop&apos;s first sale
              (<span className="font-mono">COUNTER-1</span>). There is no screen that adds one yet.
            </p>
          </div>
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
              <div>
                <label className="lbl">Default credit limit (৳)</label>
                <input className="ipt" inputMode="decimal" defaultValue={String((s?.defaultCreditLimitPaisa ?? 0) / 100)}
                  onBlur={(e) => save({ defaultCreditLimitPaisa: Math.max(0, Math.round(Number(e.target.value) * 100)) })} />
              </div>

              {/*  ── THE PRINTED SLIP ────────────────────────────────────────
                   These three have been editable since the module was built and
                   until today NOTHING read any of them — there was no printable
                   receipt at all. They are live settings now, and the paper
                   beside them is the paper that comes out.  */}
              <div className="border-t border-lavender-deep pt-3">
                <b className="text-[13px] text-purple block mb-1">What is printed on the slip</b>
                <p className="text-[11.5px] text-body-soft m-0 mb-2.5">
                  These appear on every receipt the counter prints — reprints included.
                </p>
                <label className="lbl">Receipt header</label>
                <input className="ipt mb-3" defaultValue={s?.receiptHeader ?? ""} placeholder="Radian Flower &amp; Gift"
                  onBlur={(e) => save({ receiptHeader: e.target.value || null })} />
                <label className="lbl">Receipt footer</label>
                <input className="ipt mb-3" defaultValue={s?.receiptFooter ?? ""} placeholder="Thank you — come again"
                  onBlur={(e) => save({ receiptFooter: e.target.value || null })} />
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-[#7a2ea8]"
                    checked={s?.giftReceiptHidePrice ?? true}
                    onChange={(e) => save({ giftReceiptHidePrice: e.target.checked })} />
                  <span>Gift receipt hides the price</span>
                </label>
                <p className="text-[11.5px] text-body-soft m-0 mt-1.5">
                  A gift bill then prints a GIFT RECEIPT with no prices anywhere on it. The shop&apos;s
                  own copy, with prices, is always one press away on the bill.
                </p>
              </div>
            </div>
          </div>

          <div className={card + " p-5"}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <h3 className="font-display text-[16px] text-purple m-0">On paper</h3>
              <div className="flex rounded-[9px] border border-lavender-deep overflow-hidden">
                {([false, true] as const).map((g) => (
                  <button key={String(g)} type="button" onClick={() => setGiftPreview(g)}
                    className={"text-[11.5px] px-2.5 py-1.5 font-medium " + (giftPreview === g ? "bg-purple text-white" : "text-body-soft")}>
                    {g ? "Gift copy" : "Shop copy"}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[12px] text-body-soft m-0 mb-3">
              A made-up bill at the real size (72 mm). Nothing here is a real sale — it is what the
              header and the footer above will look like on the roll.
            </p>
            <ReceiptPreview r={preview} gift={giftPreview} />
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
 *
 * ── POS audit 11 Sep 2026 §3 #24 (the UI half) ──────────────────────────────
 * The screen asked for one press and said nothing about either consequence.
 * The money was a figure in a column; the STOCK was invisible — the goods were
 * promised weeks ago and deliberately never reserved (DEC-POS-022), so what is
 * about to leave the shelf is exactly the thing that may no longer be there.
 * The server re-checks the shortage now (agent A) and refuses a hand-over it
 * cannot fill; this side names the items before the press, so the refusal is
 * understood rather than mysterious, and holds the button while it works.
 */
export function PosAdvanceOrders() {
  const [rows, setRows] = useState<ApiPosAdvance[]>([]);
  const [open, setOpen] = useState<ApiPosAdvance | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** which row is mid-hand-over — nothing else on the board may be pressed */
  const [working, setWorking] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  /*  (owner, 11 Sep 2026) the customer changed their mind: cancel it and give
      the money back. Any day — the box that took the advance is long closed,
      which is exactly why a void cannot do this.  */
  const [cancelRow, setCancelRow] = useState<ApiPosAdvance | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBack, setCancelBack] = useState("");
  const [cancelMethod, setCancelMethod] = useState("");
  const [cancelAccount, setCancelAccount] = useState("");
  const [cancelRef, setCancelRef] = useState("");
  /*  every till money can go back out of — the same list Returns offers, because
      the owner's ruling is the same one: the person refunding picks  */
  const payoutTills = usePaymentMethods(["CASH", "BKASH", "NAGAD", "CARD", "BANK"]);

  const load = () => posAdvanceOrders().then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const days = (iso: string | null) => (iso ? Math.round((+new Date(iso) - Date.now()) / 86_400_000) : null);
  const owed = rows.reduce((s, r) => s + r.duePaisa, 0);
  const pieces = rows.reduce((s, r) => s + r.lines.reduce((n, l) => n + l.qty, 0), 0);

  return (
    <div className={wrap}>
      <Head title="Advance orders" sub="Ordered now, taken later. The goods stay on the shelf until the day comes — hand over here." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 max-w-[760px]">
        <Stat label="Waiting" value={String(rows.length)} tone="plum" />
        <Stat label="Still to collect" value={formatTaka(owed)} tone="amber" />
        {/*  §3 #24 — the other half of what is waiting: goods, not just money  */}
        <Stat label="Pieces still on the shelf" value={String(pieces)} tone="green" />
        <Stat label="Next one" value={rows[0]?.promisedBy ? new Date(rows[0].promisedBy).toLocaleDateString() : "—"} tone="orchid" />
      </div>

      {flash && <div className="rounded-[12px] px-4 py-3 mb-4 text-[13px]" style={{ background: "#1c3626", color: "#76efab" }}>{flash}</div>}

      <div className={card + " overflow-hidden"}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-white" style={{ background: "linear-gradient(90deg,#5a1385,#7a2ea8)" }}>
              <th className="px-4 py-2.5 font-medium">Bill</th>
              <th className="px-4 py-2.5 font-medium">Customer</th>
              <th className="px-4 py-2.5 font-medium">Taking it</th>
              <th className="px-4 py-2.5 font-medium">What leaves the shelf</th>
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
                    <Link href={`/pos/sale/${r.id}`} className="font-mono font-semibold text-purple text-[12.5px] hover:underline">{r.orderNo}</Link>
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
                  {/*  every line, not the first three with "+2 more" — this is
                       the list somebody walks to the shelf with  */}
                  <td className="px-4 py-2.5 text-body-soft">
                    {r.lines.map((l) => (
                      <div key={l.id} className="text-[12.5px]">
                        <span className="text-purple">{l.name}</span> <span className="font-medium">x{l.qty}</span>
                      </div>
                    ))}
                    {r.lines.length === 0 && <span>—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div>{formatTaka(r.paidPaisa)} of {formatTaka(r.totalPaisa)}</div>
                    {r.duePaisa > 0
                      ? <div className="text-[12px] text-[#f7a96e] font-medium">{formatTaka(r.duePaisa)} to collect</div>
                      : <div className="text-[12px] text-[#76efab]">paid in full</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex flex-col items-end gap-1.5">
                      <button type="button" disabled={!!working}
                        onClick={() => { setErr(null); setOpen(r); }}
                        className="text-[12px] text-white bg-purple font-medium rounded-[8px] px-3 py-1.5 disabled:opacity-40">
                        {working === r.id ? "Handing over…" : "Hand over"}
                      </button>
                      <button type="button" disabled={!!working}
                        onClick={() => {
                          setErr(null);
                          setCancelRow(r);
                          setCancelReason("");
                          /*  pre-filled with everything the customer paid: the
                              owner said give the amount back, so that is the
                              number on screen unless a person changes it  */
                          setCancelBack(((r.paidPaisa ?? 0) / 100).toFixed(2));
                          setCancelMethod("");
                          setCancelAccount("");
                          setCancelRef("");
                        }}
                        className="text-[11.5px] text-body-soft border border-lavender-deep rounded-[8px] px-3 py-1 disabled:opacity-40">
                        Cancel order
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-body-soft">No advance order is waiting.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && <HandOver row={open} busy={busy} err={err}
        onClose={() => { if (!busy) setOpen(null); }}
        onDone={async (payments) => {
          if (busy) return;
          setBusy(true); setErr(null); setWorking(open.id);
          try {
            await posHandOverAdvance(open.id, { payments });
            setFlash(`${open.orderNo} handed over — the stock has left the shelf${open.duePaisa > 0 ? ` and ${formatTaka(open.duePaisa)} was collected` : ""}.`);
            setOpen(null);
            await load();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not hand it over");
          } finally { setBusy(false); setWorking(null); }
        }} />}

      {/*  ═══ THE CUSTOMER CHANGED THEIR MIND (owner, 11 Sep 2026) ═══════════
          Nothing has left the shelf on an advance, so there is no stock to put
          back — only money to hand over, out of a till somebody picks. The
          amount starts at everything they paid; if the shop keeps part of it,
          a person types the smaller number and the reason sits beside it.  */}
      {cancelRow && (
        <RefundDialog
          title="Cancel this advance order"
          who={`${cancelRow.orderNo} · ${cancelRow.customerName}`}
          amountPaisa={Math.round((Number(cancelBack) || 0) * 100)}
          amountLabel="Giving back"
          note={`${formatTaka(cancelRow.paidPaisa)} was taken on this order · nothing has left the shelf`}
          methods={payoutTills}
          method={cancelMethod}
          onMethod={setCancelMethod}
          methodPlaceholder="Where does the money go back from…"
          methodNote={
            cancelMethod.toUpperCase() === "CASH"
              ? "Out of the counter cash box — day close will count these notes gone. The box has to be open."
              : cancelMethod
                ? "Sent by hand from that account — write the reference below so it can be matched later."
                : undefined
          }
          accountId={cancelAccount}
          onAccount={setCancelAccount}
          reference={cancelRef}
          onReference={setCancelRef}
          busy={busy}
          error={err}
          confirmLabel="Cancel and pay back"
          onConfirm={async () => {
            if (busy) return;
            const back = Math.round((Number(cancelBack) || 0) * 100);
            if (!cancelReason.trim()) { setErr("Say why it is being cancelled."); return; }
            if (back > cancelRow.paidPaisa) { setErr(`Only ${formatTaka(cancelRow.paidPaisa)} was taken on this order.`); return; }
            setBusy(true); setErr(null); setWorking(cancelRow.id);
            try {
              await posCancelAdvance(cancelRow.id, {
                reason: cancelReason.trim(),
                refundPaisa: back,
                refundMethod: cancelMethod.toLowerCase() as "cash" | "bkash" | "nagad" | "card" | "bank",
                refundAccountId: cancelAccount || undefined,
                refundReference: cancelRef.trim() || undefined,
              });
              setFlash(
                `${cancelRow.orderNo} cancelled` +
                (back > 0 ? ` — ${formatTaka(back)} given back${back < cancelRow.paidPaisa ? ` (${formatTaka(cancelRow.paidPaisa - back)} kept)` : ""}.` : " — nothing was given back."),
              );
              setCancelRow(null);
              await load();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Could not cancel it");
            } finally { setBusy(false); setWorking(null); }
          }}
          onClose={() => { if (!busy) setCancelRow(null); }}
        >
          <label className="text-[12.5px] font-medium text-[#c9a6e4] mb-1.5 block">Why is it being cancelled</label>
          <input className="ipt h-[40px] text-[13px]" placeholder="The customer changed their mind…"
            value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          <label className="text-[12.5px] font-medium text-[#c9a6e4] mt-3 mb-1.5 block">How much goes back ৳</label>
          <input type="text" inputMode="decimal" className="ipt h-[40px] text-[13px]"
            value={cancelBack}
            onChange={(e) => { const v = e.target.value; if (/^\d*\.?\d{0,2}$/.test(v)) setCancelBack(v); }} />
          <div className="text-[11.5px] text-[#a98ac4] mt-1">
            They paid {formatTaka(cancelRow.paidPaisa)}. Hand back less only if the shop has decided to keep part of it.
          </div>
        </RefundDialog>
      )}
    </div>
  );
}

/**
 * The confirm. Two things happen at once here and the dialog names both: money
 * comes in, and goods leave. Until now it named only the money.
 */
function HandOver({ row, busy, err, onClose, onDone }: {
  row: ApiPosAdvance; busy: boolean; err: string | null;
  onClose: () => void; onDone: (p: { method: string; amountPaisa: number }[]) => void;
}) {
  // P7-9 — the shop's list here too, or a hand-over with money still owed dies
  // the same way; narrowed by DEC-POS-021 like the due board (§3 #26)
  const methods = usePaymentMethods(useTillTenders());
  const pay = usePayRows(row.duePaisa, methods[0]?.id ?? "CASH");
  const rest = pay.pays.filter((r) => r.amountPaisa > 0)
    .map((r) => ({ method: r.method.toLowerCase(), amountPaisa: r.amountPaisa, accountId: r.accountId }));
  const taking = Math.min(pay.paidPaisa, row.duePaisa);
  const left = row.duePaisa - taking;
  const tooMuch = pay.paidPaisa > row.duePaisa;

  /*  what the hand-over will move. The goods were never reserved, so this is
      also the list the server checks against the shelf a moment from now.  */
  const stock = (
    <div className="rounded-[12px] px-3 py-3 mt-3" style={{ background: "rgba(255,255,255,.07)" }}>
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-[#c9a6e4] font-medium mb-1.5">Leaves the shelf now</div>
      {row.lines.map((l) => (
        <div key={l.id} className="flex items-center justify-between text-[12.5px] py-0.5">
          <span className="truncate pr-2">{l.name}</span>
          <span className="font-medium shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>x{l.qty}</span>
        </div>
      ))}
      {row.lines.length === 0 && <div className="text-[12px] text-[#c9a6e4]">Nothing on this order.</div>}
      <p className="text-[11px] text-[#a98ac4] m-0 mt-2">
        These were promised, not reserved. If any of it has sold in the meantime the
        hand-over is refused and nothing moves.
      </p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4 py-6 overflow-auto" style={{ background: "rgba(40,20,50,.45)" }}
      {...backdropClose(onClose)}>
      <div className="w-full max-w-[420px] rounded-[16px] text-white shadow-lift p-4"
        style={{ background: "linear-gradient(170deg,#3c0a5a,#26063a)" }} onClick={(e) => e.stopPropagation()}>
        <div className="text-[12px] text-[#c9a6e4] font-medium uppercase tracking-[0.06em]">Hand over</div>
        <div className="text-[14px] font-medium mb-3">{row.orderNo} · {row.customerName}</div>

        {row.duePaisa === 0 ? (
          <div className="rounded-[12px] px-3 py-3 text-center" style={{ background: "rgba(127,224,168,.14)" }}>
            <div className="text-[10.5px] uppercase tracking-[0.08em] font-medium" style={{ color: "#7fe0a8" }}>Already paid in full</div>
            <div className="text-[26px] font-semibold font-display" style={{ color: "#bff3d5" }}>{formatTaka(row.totalPaisa)}</div>
          </div>
        ) : (
          <>
            <div className="rounded-[12px] px-3 py-3 text-center" style={{ background: "rgba(255,255,255,.07)" }}>
              <div className="text-[10.5px] uppercase tracking-[0.08em] text-[#c9a6e4] font-medium">Still to collect</div>
              <div className="text-[32px] font-semibold font-display leading-[1.2]" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatTaka(row.duePaisa)}
              </div>
              <div className="text-[11px] text-[#a98ac4]">{formatTaka(row.paidPaisa)} was paid in advance</div>
            </div>
            <div className="rounded-[12px] px-3 py-3 mt-3" style={{ background: "rgba(255,255,255,.07)" }}>
              <PaymentLines pay={pay} methods={methods} title="Taking now" maxHeight={148} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="rounded-[12px] px-3 py-2.5" style={{ background: "rgba(255,255,255,.07)" }}>
                <div className="text-[10.5px] uppercase tracking-[0.08em] text-[#c9a6e4] font-medium">Taking now</div>
                <div className="text-[19px] font-semibold font-display" style={{ fontVariantNumeric: "tabular-nums" }}>{formatTaka(taking)}</div>
              </div>
              <div className="rounded-[12px] px-3 py-2.5" style={{ background: left > 0 ? "rgba(240,180,106,.14)" : "rgba(127,224,168,.14)" }}>
                <div className="text-[10.5px] uppercase tracking-[0.08em] font-medium truncate" style={{ color: left > 0 ? "#f0b46a" : "#7fe0a8" }}>
                  {left > 0 ? "Still owed after this" : "Settled"}
                </div>
                <div className="text-[19px] font-semibold font-display" style={{ color: left > 0 ? "#f0b46a" : "#7fe0a8", fontVariantNumeric: "tabular-nums" }}>
                  {formatTaka(left)}
                </div>
              </div>
            </div>
            {tooMuch && <p className="text-[12px] text-[#ff9b9b] mt-2 mb-0">Cannot be more than {formatTaka(row.duePaisa)}.</p>}
            {/*  a hand-over with money still owed is allowed — the rest stays a
                 due like any other (owner, 21 Aug) — but it should be a choice,
                 not a surprise  */}
            {left > 0 && !tooMuch && (
              <p className="text-[11.5px] text-[#f0b46a] mt-2 mb-0">
                {formatTaka(left)} stays on the due board after this.
              </p>
            )}
          </>
        )}

        {stock}

        {err && <div className="mt-3 text-[11.5px] text-[#ff9b9b] bg-white/10 rounded-[8px] px-3 py-2">{err}</div>}

        <div className="flex gap-2 mt-3">
          <button type="button" onClick={onClose} disabled={busy}
            className="px-4 py-3 rounded-[12px] text-[13.5px] font-medium border border-white/25 text-white bg-white/10 disabled:opacity-40">Cancel</button>
          <button type="button" disabled={busy || tooMuch}
            onClick={() => onDone(row.duePaisa === 0 ? [] : rest)}
            className="flex-1 bg-white hover:bg-[#f4ecf9] text-purple text-[14.5px] py-3 rounded-[12px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">
            <Icon name="check" size={17} /> {busy ? "Working…" : row.duePaisa === 0 ? "Hand it over" : `Take & hand over · ${formatTaka(taking)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
