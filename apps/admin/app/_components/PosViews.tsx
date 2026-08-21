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
  posCloseShift,
  posDue,
  posCollectDue,
  posSettings,
  posDiscountRules,
  updatePosSettings,
  type ApiPosSale,
  type ApiPosDue,
  type ApiPosShift,
  type ApiPosSettings,
  type ApiPosAnalytics,
} from "../_data/api";
import { COUNTER_METHODS, PayDialog, usePayRows } from "./MoneyBlock";

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
export function PosShiftBoard() {
  const [shift, setShift] = useState<ApiPosShift | null>(null);
  const [sales, setSales] = useState<ApiPosSale[]>([]);
  const [a, setA] = useState<ApiPosAnalytics | null>(null);
  useEffect(() => {
    posCurrentShift().then(setShift).catch(() => {});
    posListSales({ days: 1 }).then((r) => { if (r.length) setSales(r); }).catch(() => {});
    posAnalyticsToday().then(setA).catch(() => {});
  }, []);
  const expected = shift ? (shift.openingFloatPaisa + (shift.cashMovements?.reduce((s, m) => s + m.amountPaisa, 0) ?? 0)) : 0;
  return (
    <div className={wrap}>
      <Head title="Today / Shift" sub="The running picture — who is on the counter and what's in the drawer right now." />
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
        {shift ? (
          <div className="rounded-[18px] p-5 text-white shadow-soft relative overflow-hidden" style={{ background: "linear-gradient(160deg,#159b63,#0d5f3f)" }}>
            <div className="absolute -right-6 -top-6 w-[90px] h-[90px] rounded-full bg-white/10" />
            <div className="flex items-center gap-2 mb-3"><span className="w-[9px] h-[9px] rounded-full bg-white" /><h3 className="font-display text-[16px] text-white m-0">Shift open</h3></div>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between"><span className="text-white/75">Cashier</span><span className="font-medium">{shift.cashierName}</span></div>
              <div className="flex justify-between"><span className="text-white/75">Opened</span><span>{fmtTime(shift.openedAt)}</span></div>
              <div className="flex justify-between"><span className="text-white/75">Opening float</span><span>{formatTaka(shift.openingFloatPaisa)}</span></div>
              <div className="flex justify-between border-t border-white/20 pt-2"><span className="text-white/90 font-medium">Expected cash</span><span className="font-semibold text-white text-[15px]">{formatTaka(expected)}</span></div>
            </div>
            <Link href="/pos/day-close" className="block text-center mt-4 bg-white hover:bg-white/90 text-[#0d5f3f] text-[13.5px] py-2.5 rounded-[11px] font-semibold">Start day-close</Link>
          </div>
        ) : (
          <div className={card + " p-5"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-2">No open shift</h3>
            <p className="text-[13px] text-body-soft mb-0">Open a shift from the Sell screen to start taking counter sales.</p>
            <Link href="/pos/sell" className="inline-block mt-3 bg-purple text-white text-[13px] px-4 py-2 rounded-[10px] font-medium">Go to Sell</Link>
          </div>
        )}

        <div className={card + " p-5"}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Sales this shift" value={formatTaka(a?.salesPaisa ?? 0)} tone="plum" />
            <Stat label="Transactions" value={String(a?.count ?? 0)} tone="orchid" />
            <Stat label="Avg. bill" value={formatTaka(a?.avgPaisa ?? 0)} tone="green" />
          </div>
          <h3 className="font-display text-[15px] text-purple m-0 mb-2">Sales this shift</h3>
          <div className="flex flex-col">
            {sales.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-lavender-deep last:border-0 text-[13px]">
                <span className="text-body-soft">{fmtTime(s.placedAt)} · {s.customer?.name ?? s.senderName}</span>
                <span className="font-medium">{formatTaka(s.totalPaisa)} <span className="text-body-soft font-normal">· {methodLabel(s)}</span></span>
              </div>
            ))}
            {sales.length === 0 && <div className="text-[13px] text-body-soft py-4">No sales this shift yet.</div>}
          </div>
        </div>
      </div>
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
                <td className="px-4 py-2.5 text-body-soft">{fmtTime(s.placedAt)}</td>
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
  useEffect(() => { posCurrentShift().then(setShift).catch(() => {}); }, []);
  const expected = shift ? (shift.openingFloatPaisa + (shift.cashMovements?.reduce((s, m) => s + m.amountPaisa, 0) ?? 0)) : 1226000;
  const [actual, setActual] = useState<number>(0);
  const over = actual - expected;
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function doClose() {
    if (!shift) { setErr("No open shift to close."); return; }
    setBusy(true); setErr(null);
    try { await posCloseShift(shift.id, { countedCashPaisa: actual }); setClosed(true); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not close the shift"); }
    finally { setBusy(false); }
  }
  return (
    <div className={wrap}>
      <Head title="Day-close" sub="Count the drawer and match it against the system — shortfall or excess is flagged, never blocked." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start max-w-[820px]">
        <div className={card + " p-5"}>
          <h3 className="font-display text-[16px] text-purple m-0 mb-3">System expects</h3>
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between"><span className="text-body-soft">Opening float</span><span>{formatTaka(shift?.openingFloatPaisa ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-body-soft">Cash movements</span><span className="text-[#0e7a3d]">+ {formatTaka(expected - (shift?.openingFloatPaisa ?? 0))}</span></div>
            <div className="flex justify-between border-t border-lavender-deep pt-2"><span className="text-purple font-medium">Expected cash</span><span className="font-semibold text-purple">{formatTaka(expected)}</span></div>
          </div>
        </div>
        <div className={card + " p-5"}>
          <h3 className="font-display text-[16px] text-purple m-0 mb-3">Counted in drawer</h3>
          <label className="text-[12.5px] text-body-soft font-medium mb-1 block">Actual cash counted ৳</label>
          <input type="number" min={0} className="ipt h-[46px] text-[16px]" placeholder="0" value={actual ? Math.round(actual / 100) : ""} onChange={(e) => setActual(Math.max(0, Number(e.target.value)) * 100)} />
          {actual > 0 && (
            <div className={"mt-3 rounded-[12px] px-4 py-3 text-[13px] font-medium " + (over === 0 ? "bg-[#e9f9ef] text-[#0e7a3d]" : over > 0 ? "bg-[#eef4ff] text-[#1d4ed8]" : "bg-[#fdecea] text-[#c0392b]")}>
              {over === 0 ? "Matches exactly ✓" : over > 0 ? `Excess: ${formatTaka(over)} (more in drawer)` : `Shortfall: ${formatTaka(-over)} (missing)`}
            </div>
          )}
          <button type="button" onClick={doClose} disabled={!shift || busy || closed} className="w-full mt-4 bg-purple hover:bg-purple-deep text-white text-[13.5px] py-3 rounded-[12px] font-medium disabled:opacity-50">{closed ? "Shift closed ✓" : busy ? "Closing…" : "Close shift"}</button>
          {err && <p className="text-[11.5px] text-[#c0392b] mt-2 mb-0">{err}</p>}
          <p className="text-[11.5px] text-body-soft mt-2 mb-0">Closing hands the completed shift event to Finance later (POS never writes the ledger).</p>
        </div>
      </div>
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
      const purses = pay.pays.filter((r) => r.amountPaisa > 0).map((r) => ({ method: r.method.toLowerCase(), left: r.amountPaisa }));
      for (const o of [...bills].sort((a, b) => +new Date(a.placedAt) - +new Date(b.placedAt))) {
        let need = o.duePaisa;
        const parts: { method: string; amountPaisa: number }[] = [];
        for (const purse of purses) {
          if (need <= 0) break;
          const take = Math.min(purse.left, need);
          if (take > 0) { parts.push({ method: purse.method, amountPaisa: take }); purse.left -= take; need -= take; }
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
  const [savingMethods, setSavingMethods] = useState(false);
  /*  no invented discount rules here either — an empty rule table means the
      shop has not written one yet, and the screen should say exactly that  */
  const [rules, setRules] = useState<{ cat: string; cap: string; appr: string }[]>([]);

  const enabled = s?.enabledMethods ?? [];
  async function saveMethods(next: string[]) {
    setSavingMethods(true);
    try { setS(await updatePosSettings({ enabledMethods: next })); }
    catch { /* the screen keeps what it had; the next load tells the truth */ }
    finally { setSavingMethods(false); }
  }
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
          <div className={card + " p-5"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-3">Cash & receipt</h3>
            <div className="space-y-3 text-[13px]">
              <div className="flex items-center justify-between"><span className="text-body-soft">Default opening float</span><span className="font-medium">{formatTaka(s?.openingFloatDefaultPaisa ?? 0)}</span></div>
              <div className="flex items-center justify-between"><span className="text-body-soft">Default VAT rate</span><span className="font-medium">{s ? (s.defaultTaxRateBps / 100).toFixed(s.defaultTaxRateBps % 100 ? 1 : 0) + "%" : "0%"}</span></div>
              <div className="flex items-center justify-between"><span className="text-body-soft">Gift receipt hides price</span><span className={(s?.giftReceiptHidePrice ?? true) ? "text-[#0e7a3d] font-medium" : "text-body-soft"}>{(s?.giftReceiptHidePrice ?? true) ? "On" : "Off"}</span></div>
              <div className="flex items-center justify-between"><span className="text-body-soft">Default credit limit</span><span className="font-medium">{formatTaka(s?.defaultCreditLimitPaisa ?? 0)}</span></div>
            </div>
          </div>
          {/*  DEC-POS-021 — the four names used to be written into this screen and
               always shown as "On", so a shop that does not take cards had no way
               to say so. They are the shop's now (PosSetting.enabledMethods).  */}
          <div className={card + " p-5"}>
            <h3 className="font-display text-[16px] text-purple m-0 mb-1">Payment methods</h3>
            <p className="text-[12.5px] text-body-soft m-0 mb-3">What the counter may take. Switch one off and it disappears from the till.</p>
            <div className="flex gap-2 flex-wrap">
              {COUNTER_METHODS.map((m) => {
                const on = !enabled.length || enabled.includes(m.id);
                return (
                  <button key={m.id} type="button" disabled={savingMethods}
                    onClick={() => {
                      const all = COUNTER_METHODS.map((x) => x.id);
                      const cur = enabled.length ? enabled : all;
                      const next = cur.includes(m.id) ? cur.filter((x) => x !== m.id) : [...cur, m.id];
                      if (next.length === 0) return; // a till that takes nothing is not a till
                      saveMethods(next);
                    }}
                    className={"text-[12.5px] font-medium rounded-full px-3.5 py-1.5 inline-flex items-center gap-1.5 border " + (on
                      ? "bg-[#e9f9ef] text-[#0e7a3d] border-[#c2ecd3]"
                      : "bg-white text-body-soft border-lavender-deep")}>
                    <Icon name={on ? "check" : "alert"} size={13} /> {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
