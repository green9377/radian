"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, ErrorBox } from "./OrderViews";
import { ordersOverview, deliveryMoney, formatTaka, type ApiOrdersOverview, type ApiOverviewWatch } from "../_data/api";
import { SOLID, SOFT, Pill, ActButton, Empty } from "./OrdersUi";

/*
  Orders → Overview — design E, "Today's slots" (owner, 11 Sep 2026, chosen
  from five). Delivery-first: the day laid out by delivery slot with what is
  waiting, preparing and out in each; payment and gift mix as small donuts;
  the month's money; and a watch list of the few orders a person should
  open first. Everything is counted in the database (GET /orders/overview);
  "Cash with rider" comes from Delivery money, which owns that number.
*/

const DHAKA = 6 * 3600_000;
function dhakaToday(): string {
  const d = new Date(Date.now() + DHAKA);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function shift(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}
function dayName(date: string, style: "long" | "short"): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  return style === "long"
    ? t.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    : t.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
}

const WATCH_DOT: Record<ApiOverviewWatch["kind"], string> = {
  LATE: SOLID.red,
  FAILED: SOLID.red,
  COD_CALL: SOLID.amber,
  PHOTO: SOLID.amber,
  UNCONFIRMED: SOLID.blue,
};

function Donut({ parts, size = 74 }: { parts: { value: number; colour: string }[]; size?: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = 14;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} className="shrink-0" aria-hidden="true">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#e6d9f0" strokeWidth="6" />
      {total > 0 &&
        parts.map((p, i) => {
          const len = (p.value / total) * c;
          const el = <circle key={i} cx="18" cy="18" r={r} fill="none" stroke={p.colour} strokeWidth="6" strokeDasharray={`${len} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 18 18)" />;
          offset += len;
          return el;
        })}
    </svg>
  );
}

function Legend({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <span className="text-[12.5px] text-body flex items-center gap-2">
      <i className="inline-block w-[9px] h-[9px] rounded-[2px]" style={{ background: colour }} />
      {children}
    </span>
  );
}

const CARD = "bg-white border border-[#e4dbec] rounded-[14px] px-4 py-3.5";
const H3 = "text-[13px] font-medium text-body mb-2.5";
const HINT = "text-[11.5px] font-normal text-[#7b6b87] ml-1.5";
const KV = "flex justify-between items-center py-[7px] border-b border-dashed border-[#e4dbec] last:border-0 text-[13px]";

export default function OrdersOverviewView() {
  const [date, setDate] = useState<string>(dhakaToday());
  const [data, setData] = useState<ApiOrdersOverview | null>(null);
  const [withRider, setWithRider] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const [o, m] = await Promise.all([ordersOverview(d), deliveryMoney(30).catch(() => null)]);
      setData(o);
      setWithRider(m ? m.totals.withCarrier : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the overview.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load(date);
  }, [date, load]);

  const c = data?.counts;
  const v = (n: number | undefined) => (loading || n === undefined ? "…" : String(n));
  const money = (n: number | undefined) => (loading || n === undefined ? "…" : formatTaka(n));
  const pct = (n: number, t: number) => (t ? `${Math.round((n / t) * 100)}%` : "0%");
  const isToday = data ? data.isToday : date === dhakaToday();

  return (
    <div className={WRAP}>
      {/* head */}
      <div className="flex justify-between items-end gap-3 flex-wrap mb-4">
        <div>
          <div className="text-[10.5px] font-medium tracking-[0.14em] uppercase" style={{ color: SOLID.orchid }}>
            Sales · Orders · {isToday ? "Today" : "Day"}
          </div>
          <h1 className="font-display text-[26px] leading-[1.1] text-body mt-1">{dayName(date, "long")}</h1>
          <div className={`${SOFT} text-[13px] mt-1`}>
            {loading || !c ? "…" : `${c.toConfirm} waiting for a confirm · ${c.goingOutToday} going out ${isToday ? "today" : "that day"} · ${c.late} late`}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <ActButton onClick={() => setDate(shift(date, -1))}>◀ {dayName(shift(date, -1), "short")}</ActButton>
          {!isToday && <ActButton onClick={() => setDate(dhakaToday())}>Today</ActButton>}
          <ActButton onClick={() => setDate(shift(date, 1))}>{dayName(shift(date, 1), "short")} ▶</ActButton>
          <Link href="/orders/new" className="h-[36px] px-4 rounded-[10px] bg-purple text-white text-[12.5px] font-medium inline-flex items-center gap-1.5 hover:bg-purple-deep">
            <Icon name="plus" size={15} /> New order
          </Link>
        </div>
      </div>
      {error && <ErrorBox error={error} onRetry={() => void load(date)} />}

      {/* slots */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {(data?.slots ?? []).map((s, i, all) => (
          <div key={s.label + s.time} className={`${CARD} ${i === all.length - 1 && all.length > 1 ? "bg-lavender" : ""}`}>
            <div className="flex justify-between items-center gap-2">
              <b className="font-medium text-body">{s.label}</b>
              <span className="text-[11px] text-[#7b6b87] whitespace-nowrap">{s.time}</span>
            </div>
            <div className="text-[26px] leading-none font-medium text-body my-2">{s.total}</div>
            <div className="flex gap-1.5 flex-wrap">
              {s.toConfirm > 0 && <Pill colour={SOLID.amber}>{s.toConfirm} to confirm</Pill>}
              {s.preparing > 0 && <Pill colour={SOLID.purple}>{s.preparing} preparing</Pill>}
              {s.ready > 0 && <Pill colour={SOLID.green}>{s.ready} ready</Pill>}
              {s.out > 0 && <Pill colour={SOLID.blue}>{s.out} on the road</Pill>}
              {s.late > 0 && <Pill colour={SOLID.red}>{s.late} late</Pill>}
              {s.delivered > 0 && <Pill colour={SOLID.green}>{s.delivered} delivered</Pill>}
              {s.failed > 0 && <Pill colour={SOLID.red}>{s.failed} failed</Pill>}
            </div>
          </div>
        ))}
        {!loading && data && data.slots.length === 0 && (
          <div className={`${CARD} col-span-full`}>
            <Empty text={isToday ? "Nothing scheduled for today yet." : "Nothing scheduled for this day."} />
          </div>
        )}
        {loading && !data && [0, 1, 2, 3].map((i) => <div key={i} className={`${CARD} h-[104px] animate-pulse`} />)}
      </div>

      {/* counters that do not belong to a day */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-3">
        {([
          ["To confirm", v(c?.toConfirm), c ? `${c.toConfirmPaid} paid · ${c.toConfirmCod} COD` : "", "/orders/list", (c?.toConfirm ?? 0) > 0],
          ["Not assigned", v(c?.notAssigned), "preparing, nobody carrying it", "/delivery", false],
          ["Photo pending", v(c?.photoPending), "customer asked for one", "/delivery", false],
          ["On the road", v(c?.onRoad), c ? `${c.late} late` : "", "/delivery", (c?.late ?? 0) > 0],
          ["Failed", v(c?.failed), "waiting for a decision", "/delivery", (c?.failed ?? 0) > 0],
          ["Delivered", v(c?.deliveredToday), isToday ? "today" : "that day", "/delivery", false],
        ] as [string, string, string, string, boolean][]).map(([label, value, sub, href, hot]) => (
          <Link key={label} href={href} className={`${CARD} hover:border-purple transition-colors`} style={hot ? { boxShadow: `inset 0 0 0 1.5px ${SOLID.orchid}` } : undefined}>
            <div className="text-[11px] font-medium text-[#7b6b87]">{label}</div>
            <div className="text-[22px] leading-none font-medium my-1.5" style={{ color: hot ? SOLID.orchid : undefined }}>{value}</div>
            <div className="text-[11px] text-[#7b6b87]">{sub}</div>
          </Link>
        ))}
      </div>

      {/* mix + money */}
      <div className="grid md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr] gap-3 mt-3">
        <div className={CARD}>
          <div className={H3}>Payment<span className={HINT}>this month</span></div>
          <div className="flex items-center gap-4">
            <Donut parts={[{ value: data?.mix.online ?? 0, colour: SOLID.purple }, { value: data?.mix.cod ?? 0, colour: SOLID.amber }]} />
            <div className="grid gap-1">
              <Legend colour={SOLID.purple}>Online · {data ? pct(data.mix.online, data.mix.total) : "…"}</Legend>
              <Legend colour={SOLID.amber}>Cash on delivery · {data ? pct(data.mix.cod, data.mix.total) : "…"}</Legend>
              <span className="text-[11px] text-[#7b6b87]">{data ? `${data.mix.total} orders placed` : ""}</span>
            </div>
          </div>
        </div>
        <div className={CARD}>
          <div className={H3}>Self vs gift<span className={HINT}>this month</span></div>
          <div className="flex items-center gap-4">
            <Donut parts={[{ value: data?.mix.gift ?? 0, colour: SOLID.orchid }, { value: data?.mix.self ?? 0, colour: "#e6d9f0" }]} />
            <div className="grid gap-1">
              <Legend colour={SOLID.orchid}>Gift · {data ? pct(data.mix.gift, data.mix.total) : "…"}</Legend>
              <Legend colour="#e6d9f0">Self · {data ? pct(data.mix.self, data.mix.total) : "…"}</Legend>
              <span className="text-[11px] text-[#7b6b87]">Gift orders carry a card message</span>
            </div>
          </div>
        </div>
        <div className={CARD}>
          <div className={H3}>Money<span className={HINT}>delivered only</span></div>
          <div className={KV}><span>Revenue this month</span><b className="font-medium tabular-nums">{money(data?.money.revenueMonth)}</b></div>
          <div className={KV}><span>Average order</span><b className="font-medium tabular-nums">{money(data?.money.aov)}</b></div>
          <div className={KV}><span>Due from customer</span><b className="font-medium tabular-nums" style={{ color: SOLID.amber }}>{money(data?.money.dueFromCustomer)}</b></div>
          <div className={KV}><span>Cash with rider</span><b className="font-medium tabular-nums">{withRider === null ? "—" : formatTaka(withRider)}</b></div>
          <div className={KV}><span>Refunded</span><b className="font-medium tabular-nums" style={{ color: SOLID.red }}>{money(data?.money.refundedMonth)}</b></div>
        </div>
      </div>

      {/* watch list */}
      <div className={`${CARD} mt-3`}>
        <div className={H3}>Watch list<span className={HINT}>open these first</span></div>
        {data && data.watch.length === 0 && !loading && <div className={`${SOFT} text-[13px] py-2`}>Nothing needs a hand right now.</div>}
        <ul className="m-0 p-0 list-none">
          {(data?.watch ?? []).map((w) => (
            <li key={w.id} className="flex gap-2.5 items-start py-2 border-b border-[#e4dbec] last:border-0">
              <span className="w-2 h-2 rounded-full mt-[7px] shrink-0" style={{ background: WATCH_DOT[w.kind] }} />
              <div className="min-w-0 flex-1">
                <Link href={`/orders/${w.id}`} className="font-medium text-purple hover:underline">{w.orderNo}</Link>
                {w.slot && <span className="text-body"> · {w.slot}</span>}
                <span className="text-body"> · {w.title}</span>
                <span className="text-[12px] text-[#7b6b87] ml-2">{w.detail}</span>
              </div>
              <ActButton href={`/orders/${w.id}`}>Open</ActButton>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
