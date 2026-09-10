"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ErrorBox } from "./OrderViews";
import { ordersOverview, deliveryMoney, formatTaka, type ApiOrdersOverview, type ApiOverviewWatch } from "../_data/api";

/*
  Orders → Overview — design E, "Today's slots", exactly as the owner chose
  it (11 Sep 2026): the dark canvas, the framed page, four slot cards, three
  small cards (payment, self vs gift, money) and the watch list. Nothing
  added, nothing moved. Everything is counted in the database
  (GET /orders/overview); "Cash with rider" comes from Delivery money, which
  owns that number.

  This page is the one dark screen in the admin — on purpose, it is the
  design the owner approved from five. The colours below are that design's
  dark tokens, kept here and nowhere else so the rest of the admin stays as
  it is.
*/

const T = {
  bg: "#16101c",
  card: "#1f1727",
  line: "#3a2d45",
  ink: "#f1eaf6",
  grey: "#a79bb3",
  lav: "#241a2c",
  lav2: "#33263d",
  purple: "#470066",
  orchid: "#cf43ea",
  green: "#3ddc84",
  amber: "#f5a524",
  red: "#ff6b60",
  blue: "#5aa9f0",
  tint: { g: "#12321f", a: "#3a2a10", r: "#3d1a17", b: "#14283b", p: "#2e1d3a", n: "#241a2c" },
};

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
  LATE: T.red,
  FAILED: T.red,
  COD_CALL: T.amber,
  PHOTO: T.amber,
  UNCONFIRMED: T.blue,
};

function Pill({ tone, children }: { tone: "g" | "a" | "r" | "b" | "p" | "n"; children: React.ReactNode }) {
  const colour = { g: T.green, a: T.amber, r: T.red, b: T.blue, p: T.orchid, n: T.grey }[tone];
  return (
    <span className="inline-block rounded-full px-[9px] py-[2px] text-[11px] font-medium leading-[1.5] whitespace-nowrap" style={{ background: T.tint[tone], color: colour }}>
      {children}
    </span>
  );
}

function Btn({ primary, onClick, href, children }: { primary?: boolean; onClick?: () => void; href?: string; children: React.ReactNode }) {
  const cls = "inline-flex items-center gap-1.5 h-[36px] px-3.5 rounded-[10px] text-[12.5px] font-medium whitespace-nowrap border";
  const style = primary ? { background: T.purple, borderColor: T.purple, color: "#fff" } : { background: T.card, borderColor: T.line, color: T.ink };
  if (href) return <Link href={href} className={cls} style={style}>{children}</Link>;
  return <button type="button" onClick={onClick} className={cls} style={style}>{children}</button>;
}

function Donut({ parts }: { parts: { value: number; colour: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = 14;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 36 36" width={74} height={74} className="shrink-0" aria-hidden="true">
      <circle cx="18" cy="18" r={r} fill="none" stroke={T.lav2} strokeWidth="6" />
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
    <span className="text-[12px] flex items-center gap-1.5" style={{ color: T.ink }}>
      <i className="inline-block w-[9px] h-[9px] rounded-[2px]" style={{ background: colour }} />
      {children}
    </span>
  );
}

const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "14px 16px" };
function H3({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="text-[13px] font-semibold mb-2.5" style={{ color: T.ink }}>
      {children}
      {hint && <span className="text-[11px] font-normal ml-1.5" style={{ color: T.grey }}>{hint}</span>}
    </div>
  );
}
function KV({ label, value, colour }: { label: string; value: string; colour?: string }) {
  return (
    <div className="flex justify-between items-center py-[7px] text-[13px]" style={{ borderBottom: `1px dashed ${T.line}` }}>
      <span style={{ color: T.ink }}>{label}</span>
      <b className="font-medium tabular-nums" style={{ color: colour ?? T.ink }}>{value}</b>
    </div>
  );
}

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
  const money = (n: number | undefined) => (loading || n === undefined ? "…" : formatTaka(n));
  const pct = (n: number, t: number) => (t ? `${Math.round((n / t) * 100)}%` : "0%");
  const isToday = data ? data.isToday : date === dhakaToday();

  return (
    <div className="px-4 md:px-6 xl:px-8 pt-6 pb-16 w-full min-h-full" style={{ background: T.bg, color: T.ink, fontSize: 13 }}>
      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 18, padding: 22, boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>
        {/* head */}
        <div className="flex justify-between items-end gap-3 flex-wrap">
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase" style={{ color: T.orchid }}>
              Sales · Orders · {isToday ? "Today" : "Day"}
            </div>
            <h1 className="text-[22px] leading-[1.1] font-semibold mt-1" style={{ color: T.ink }}>{dayName(date, "long")}</h1>
            <div className="text-[13px] mt-1" style={{ color: T.grey }}>
              {loading || !c ? "…" : `${c.toConfirm} waiting for a confirm · ${c.goingOutToday} going out ${isToday ? "today" : "that day"} · ${c.late} late`}
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <Btn onClick={() => setDate(shift(date, -1))}>◀ {dayName(shift(date, -1), "short")}</Btn>
            {!isToday && <Btn onClick={() => setDate(dhakaToday())}>Today</Btn>}
            <Btn onClick={() => setDate(shift(date, 1))}>{dayName(shift(date, 1), "short")} ▶</Btn>
            <Btn primary href="/orders/new">+ New order</Btn>
          </div>
        </div>
        {error && <div className="mt-3"><ErrorBox error={error} onRetry={() => void load(date)} /></div>}

        {/* slots */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
          {(data?.slots ?? []).map((s, i, all) => (
            <div key={s.label + s.time} style={{ ...card, background: i === all.length - 1 && all.length > 1 ? T.lav : T.card, padding: "12px 14px" }}>
              <div className="flex justify-between items-center gap-2">
                <b className="font-semibold" style={{ color: T.ink }}>{s.label}</b>
                <span className="text-[11px] whitespace-nowrap" style={{ color: T.grey }}>{s.time}</span>
              </div>
              <div className="text-[26px] leading-none font-semibold my-2 tabular-nums" style={{ color: T.ink }}>{s.total}</div>
              <div className="flex gap-[5px] flex-wrap">
                {s.toConfirm > 0 && <Pill tone="a">{s.toConfirm} to confirm</Pill>}
                {s.preparing > 0 && <Pill tone="p">{s.preparing} preparing</Pill>}
                {s.ready > 0 && <Pill tone="g">{s.ready} ready</Pill>}
                {s.out > 0 && <Pill tone="b">{s.out} on the road</Pill>}
                {s.late > 0 && <Pill tone="r">{s.late} late</Pill>}
                {s.delivered > 0 && <Pill tone="g">{s.delivered} delivered</Pill>}
                {s.failed > 0 && <Pill tone="r">{s.failed} failed</Pill>}
              </div>
            </div>
          ))}
          {!loading && data && data.slots.length === 0 && (
            <div className="col-span-full text-[13px] py-3 text-center" style={{ ...card, color: T.grey }}>
              {isToday ? "Nothing scheduled for today yet." : "Nothing scheduled for this day."}
            </div>
          )}
          {loading && !data && [0, 1, 2, 3].map((i) => <div key={i} className="h-[104px] animate-pulse" style={card} />)}
        </div>

        {/* mix + money */}
        <div className="grid md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr] gap-3 mt-3">
          <div style={card}>
            <H3 hint="this month">Payment</H3>
            <div className="flex items-center gap-3.5">
              <Donut parts={[{ value: data?.mix.online ?? 0, colour: T.purple }, { value: data?.mix.cod ?? 0, colour: T.amber }]} />
              <div className="grid gap-1">
                <Legend colour={T.purple}>Online {data ? pct(data.mix.online, data.mix.total) : "…"}</Legend>
                <Legend colour={T.amber}>COD {data ? pct(data.mix.cod, data.mix.total) : "…"}</Legend>
                <span className="text-[11px]" style={{ color: T.grey }}>{data ? `${data.mix.total} orders placed` : ""}</span>
              </div>
            </div>
          </div>
          <div style={card}>
            <H3>Self vs gift</H3>
            <div className="flex items-center gap-3.5">
              <Donut parts={[{ value: data?.mix.gift ?? 0, colour: T.orchid }, { value: data?.mix.self ?? 0, colour: T.lav2 }]} />
              <div className="grid gap-1">
                <Legend colour={T.orchid}>Gift {data ? pct(data.mix.gift, data.mix.total) : "…"}</Legend>
                <Legend colour={T.lav2}>Self {data ? pct(data.mix.self, data.mix.total) : "…"}</Legend>
                <span className="text-[11px]" style={{ color: T.grey }}>Gift orders carry a card message</span>
              </div>
            </div>
          </div>
          <div style={card}>
            <H3 hint="delivered only">Money</H3>
            <KV label="Revenue this month" value={money(data?.money.revenueMonth)} />
            <KV label="Due from customer" value={money(data?.money.dueFromCustomer)} colour={T.amber} />
            <KV label="Cash with rider" value={withRider === null ? "—" : formatTaka(withRider)} />
            <KV label="Refunded" value={money(data?.money.refundedMonth)} colour={T.red} />
          </div>
        </div>

        {/* watch list */}
        <div className="mt-3" style={card}>
          <H3>Watch list</H3>
          {data && data.watch.length === 0 && !loading && <div className="text-[13px] py-2" style={{ color: T.grey }}>Nothing needs a hand right now.</div>}
          <ul className="m-0 p-0 list-none">
            {(data?.watch ?? []).map((w, i, all) => (
              <li key={w.id} className="flex gap-2.5 items-start py-2" style={{ borderBottom: i < all.length - 1 ? `1px solid ${T.line}` : "none" }}>
                <span className="w-2 h-2 rounded-full mt-[7px] shrink-0" style={{ background: WATCH_DOT[w.kind] }} />
                <div className="min-w-0 flex-1">
                  <Link href={`/orders/${w.id}`} className="font-semibold hover:underline" style={{ color: T.ink }}>
                    {w.orderNo}{w.slot ? ` · ${w.slot}` : ""} · {w.title}
                  </Link>
                  <span className="text-[12px] ml-2" style={{ color: T.grey }}>{w.detail}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
