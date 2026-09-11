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


/*  The bar chart (owner, 11 Sep 2026: "the graph is not understandable").
    Gridlines with the count on the left, the number on top of every bar,
    the weekday letter under the day, today in orchid, a hover tooltip.  */
function DayChart({ days, max }: { days: { day: string; label: string; n: number }[]; max: number }) {
  const W = 1000, H = 190, padL = 30, padR = 8, padT = 22, padB = 36;
  const n = Math.max(1, days.length);
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const gap = n > 40 ? 2 : n > 20 ? 4 : 8;
  const bw = (innerW - gap * (n - 1)) / n;
  const top = Math.max(1, max);
  const ticks = top <= 4 ? [0, 1, 2, 3, 4].filter((t) => t <= top) : [0, Math.round(top / 2), top];
  const y = (v: number) => padT + innerH - (v / top) * innerH;
  const wd = (day: string) => {
    const [yy, mm, dd] = day.split("-").map(Number);
    return ["S", "M", "T", "W", "T", "F", "S"][new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay()];
  };
  const showEvery = n > 40 ? 7 : n > 20 ? 2 : 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-2" style={{ maxHeight: 220 }} role="img" aria-label="Orders per day">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={T.line} strokeWidth={1} strokeDasharray={t === 0 ? undefined : "3 4"} />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={T.grey}>{t}</text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = padL + i * (bw + gap);
        const h = d.n ? Math.max(3, (d.n / top) * innerH) : 0;
        const today = i === days.length - 1;
        return (
          <g key={d.day}>
            <title>{`${d.day} · ${d.n} order${d.n === 1 ? "" : "s"}`}</title>
            <rect x={x} y={y(0) - h} width={bw} height={h} rx={Math.min(6, bw / 2)} fill={today ? T.orchid : d.n ? T.purple : T.lav2} opacity={d.n || today ? 1 : 0.6} />
            {!d.n && <rect x={x} y={y(0) - 3} width={bw} height={3} rx={1.5} fill={T.lav2} />}
            {d.n > 0 && (n <= 31 || d.n === max) && <text x={x + bw / 2} y={y(d.n) - 6} textAnchor="middle" fontSize={12} fontWeight={600} fill={today ? T.orchid : T.ink}>{d.n}</text>}
            {i % showEvery === 0 && (
              <>
                <text x={x + bw / 2} y={H - padB + 16} textAnchor="middle" fontSize={11} fontWeight={today ? 700 : 500} fill={today ? T.orchid : T.ink}>{d.label}</text>
                <text x={x + bw / 2} y={H - padB + 30} textAnchor="middle" fontSize={10} fill={T.grey}>{today ? "today" : wd(d.day)}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function OrdersOverviewView() {
  const [date, setDate] = useState<string>(dhakaToday());
  const [range, setRange] = useState<"today" | "7" | "30" | "90">("today");
  const [data, setData] = useState<ApiOrdersOverview | null>(null);
  const [withRider, setWithRider] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: string, r: string) => {
    setLoading(true);
    setError(null);
    try {
      const [o, m] = await Promise.all([ordersOverview(d, r === "today" ? "" : r), deliveryMoney(30).catch(() => null)]);
      setData(o);
      setWithRider(m ? m.totals.withCarrier : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the overview.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load(date, range);
  }, [date, range, load]);

  const c = data?.counts;
  const money = (n: number | undefined) => (loading || n === undefined ? "…" : formatTaka(n));
  const pct = (n: number, t: number) => (t ? `${Math.round((n / t) * 100)}%` : "0%");
  const isToday = data ? data.isToday : date === dhakaToday();
  const rangeLabel = range === "today" ? "today" : `last ${range} days`;
  const RANGES: ["today" | "7" | "30" | "90", string][] = [["today", "Today"], ["7", "7 days"], ["30", "30 days"], ["90", "90 days"]];
  const maxBar = Math.max(1, ...(data?.daily ?? []).map((x) => x.n));

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
          <div className="flex gap-2.5 items-center flex-wrap">
            {/* day: previous · today · next */}
            <div className="inline-flex items-center rounded-[10px] overflow-hidden" style={{ border: `1px solid ${T.line}`, background: T.card }}>
              <button type="button" onClick={() => setDate(shift(date, -1))} title={dayName(shift(date, -1), "long")} className="h-[36px] w-[36px] grid place-items-center text-[13px]" style={{ color: T.ink, borderRight: `1px solid ${T.line}` }}>‹</button>
              <button type="button" onClick={() => setDate(dhakaToday())} className="h-[36px] px-3.5 text-[12.5px] font-medium" style={{ color: isToday ? "#fff" : T.ink, background: isToday ? T.purple : "transparent" }}>
                {isToday ? "Today" : dayName(date, "short") + " · back to today"}
              </button>
              <button type="button" onClick={() => setDate(shift(date, 1))} title={dayName(shift(date, 1), "long")} className="h-[36px] w-[36px] grid place-items-center text-[13px]" style={{ color: T.ink, borderLeft: `1px solid ${T.line}` }}>›</button>
            </div>
            {/* range for the numbers below */}
            <div className="inline-flex items-center rounded-[10px] overflow-hidden" style={{ border: `1px solid ${T.line}`, background: T.card }}>
              {RANGES.map(([k, label], i) => (
                <button key={k} type="button" onClick={() => setRange(k)} className="h-[36px] px-3 text-[12.5px] font-medium" style={{ color: range === k ? "#fff" : T.grey, background: range === k ? T.purple : "transparent", borderLeft: i ? `1px solid ${T.line}` : "none" }}>
                  {label}
                </button>
              ))}
            </div>
            <Btn primary href="/orders/new">+ New order</Btn>
          </div>
        </div>
        {error && <div className="mt-3"><ErrorBox error={error} onRetry={() => void load(date, range)} /></div>}

        {/* pipeline — where every open order is, left to right */}
        <div className="grid grid-cols-1 md:grid-cols-5 mt-4 rounded-[14px] overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
          {([
            ["Placed · to confirm", c?.toConfirm, c ? `${c.toConfirmPaid} paid · ${c.toConfirmCod} COD need a call` : "", "att", 70],
            ["Preparing", c?.preparing, c ? `${c.photoPending} waiting for a photo` : "", "", 22],
            ["Ready to go", c?.ready, "carrier + photo done", "", 8],
            ["On the road", c?.onRoad, c ? `${c.late} late` : "", "late", 35],
            ["Delivered " + (isToday ? "today" : "that day"), c?.deliveredToday, c ? `${c.failed} failed · ${c.cancelled} cancelled ${rangeLabel}` : "", "ok", 100],
          ] as [string, number | undefined, string, string, number][]).map(([label, n, sub, kind, w], i) => (
            <div key={label} className="relative px-4 py-3.5" style={{ background: kind === "att" ? T.tint.a : T.card, borderRight: i < 4 ? `1px solid ${T.line}` : "none" }}>
              <div className="text-[11px] font-medium tracking-[0.06em] uppercase" style={{ color: T.grey }}>{label}</div>
              <div className="text-[28px] leading-none font-semibold my-2 tabular-nums" style={{ color: kind === "att" ? T.amber : kind === "ok" ? T.green : T.ink }}>{loading || n === undefined ? "…" : n}</div>
              <div className="text-[12px]" style={{ color: T.grey }}>{kind === "late" && (c?.late ?? 0) > 0 ? <Pill tone="r">{sub}</Pill> : sub}</div>
              <div className="h-[4px] rounded-[4px] mt-2.5 overflow-hidden" style={{ background: T.lav2 }}>
                <i className="block h-full" style={{ width: `${n ? Math.min(100, Math.max(w, Math.round((n / Math.max(1, c?.toConfirm ?? 1)) * 100))) : 0}%`, background: kind === "ok" ? T.green : T.orchid }} />
              </div>
              {i < 4 && <span className="hidden md:block absolute -right-[8px] top-1/2 -translate-y-1/2 rotate-45 w-[14px] h-[14px]" style={{ background: kind === "att" ? T.tint.a : T.card, borderRight: `1px solid ${T.line}`, borderTop: `1px solid ${T.line}`, zIndex: 1 }} />}
            </div>
          ))}
        </div>

        {/* slots */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
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
            <H3 hint={rangeLabel}>Payment</H3>
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
            <H3 hint={rangeLabel}>Self vs gift</H3>
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
            <H3 hint={`delivered only · ${rangeLabel}`}>Money</H3>
            <KV label="Revenue" value={money(data?.money.revenueMonth)} />
            <KV label="Due from customer" value={money(data?.money.dueFromCustomer)} colour={T.amber} />
            <KV label="Cash with rider" value={withRider === null ? "—" : formatTaka(withRider)} />
            <KV label="Refunded" value={money(data?.money.refundedMonth)} colour={T.red} />
          </div>
        </div>

        {/* orders per day — a real chart: gridlines, values on the bars, weekday under each */}
        <div className="mt-3" style={card}>
          <div className="flex justify-between items-baseline gap-3 flex-wrap">
            <H3 hint={`last ${data?.daily.length ?? 14} days · ${(data?.daily ?? []).reduce((s2, x) => s2 + x.n, 0)} orders`}>Orders per day</H3>
            <span className="text-[11px]" style={{ color: T.grey }}>
              best day {data && data.daily.length ? `${data.daily.reduce((m2, x) => (x.n > m2.n ? x : m2), data.daily[0]).label} · ${maxBar}` : "…"} · average {data && data.daily.length ? (data.daily.reduce((s2, x) => s2 + x.n, 0) / data.daily.length).toFixed(1) : "…"} a day
            </span>
          </div>
          <DayChart days={data?.daily ?? []} max={maxBar} />
        </div>

        {/* top products + zones */}
        <div className="grid md:grid-cols-[1.4fr_1fr] gap-3 mt-3">
          <div style={card}>
            <H3 hint={rangeLabel}>Top 10 products</H3>
            {data && data.topProducts.length === 0 && !loading && <div className="text-[13px] py-2" style={{ color: T.grey }}>Nothing sold in this range.</div>}
            <ol className="m-0 p-0 list-none grid gap-1.5">
              {(data?.topProducts ?? []).map((p, i) => (
                <li key={p.productId ?? i} className="flex items-center gap-3 py-1.5" style={{ borderBottom: i < (data?.topProducts.length ?? 0) - 1 ? `1px dashed ${T.line}` : "none" }}>
                  <span className="w-[18px] text-[11px] tabular-nums text-right" style={{ color: T.grey }}>{i + 1}</span>
                  <span className="w-[40px] h-[40px] rounded-[10px] overflow-hidden shrink-0 grid place-items-center" style={{ background: T.lav2 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <span className="text-[10px]" style={{ color: T.grey }}>no photo</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    {p.productId ? <Link href={`/products/${p.productId}`} className="font-medium hover:underline block truncate" style={{ color: T.ink }}>{p.name}</Link> : <span className="font-medium block truncate" style={{ color: T.ink }}>{p.name}</span>}
                    <span className="text-[11.5px]" style={{ color: T.grey }}>{p.orders} order{p.orders === 1 ? "" : "s"}</span>
                  </span>
                  <span className="text-right shrink-0">
                    <b className="block font-medium tabular-nums" style={{ color: T.ink }}>{p.qty} pcs</b>
                    <span className="text-[11.5px] tabular-nums" style={{ color: T.grey }}>{formatTaka(p.paisa)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="grid gap-3 content-start">
            <div style={card}>
              <H3 hint={rangeLabel}>Zone split</H3>
              {(["DHAKA", "BANGLADESH"] as const).map((z) => {
                const row = data?.zones.find((x) => x.zone === z);
                const total = (data?.zones ?? []).reduce((s2, x) => s2 + x.orders, 0);
                const n = row?.orders ?? 0;
                return (
                  <div key={z} className="py-1.5">
                    <div className="flex justify-between text-[12.5px]"><span style={{ color: T.ink }}>{z === "DHAKA" ? "Inside Dhaka" : "Nationwide"}</span><b className="font-medium tabular-nums" style={{ color: T.ink }}>{n} · {pct(n, total)} · {formatTaka(row?.paisa ?? 0)}</b></div>
                    <div className="h-[6px] rounded-[6px] mt-1.5 overflow-hidden" style={{ background: T.lav2 }}><i className="block h-full" style={{ width: pct(n, total), background: z === "DHAKA" ? T.orchid : T.blue }} /></div>
                  </div>
                );
              })}
            </div>
            <div style={card}>
              <H3 hint={rangeLabel}>Repeat vs new customers</H3>
              <div className="flex items-center gap-3.5">
                <Donut parts={[{ value: data?.customers.repeatCount ?? 0, colour: T.green }, { value: data?.customers.newCount ?? 0, colour: T.orchid }]} />
                <div className="grid gap-1">
                  <Legend colour={T.green}>Repeat · {data?.customers.repeatCount ?? "…"} customers · {money(data?.customers.repeatPaisa)}</Legend>
                  <Legend colour={T.orchid}>New · {data?.customers.newCount ?? "…"} customers · {money(data?.customers.newPaisa)}</Legend>
                  <span className="text-[11px]" style={{ color: T.grey }}>{data ? `${pct(data.customers.repeatPaisa, data.customers.repeatPaisa + data.customers.newPaisa)} of revenue from people who came back` : ""}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* occasions + lost + returns */}
        <div className="grid md:grid-cols-3 gap-3 mt-3">
          <div style={card}>
            <H3 hint="next 7 days">Upcoming occasions</H3>
            {data && data.occasions.length === 0 && !loading && <div className="text-[13px] py-2" style={{ color: T.grey }}>No saved birthdays or anniversaries this week.</div>}
            <ul className="m-0 p-0 list-none">
              {(data?.occasions ?? []).slice(0, 8).map((o, i, all) => (
                <li key={`${o.date}-${o.recipient}-${i}`} className="py-1.5 text-[12.5px]" style={{ borderBottom: i < all.length - 1 ? `1px dashed ${T.line}` : "none" }}>
                  <div className="flex justify-between gap-2">
                    <span style={{ color: T.ink }}><b className="font-medium">{o.recipient}</b> · {o.type === "CUSTOM" ? (o.label ?? "occasion") : o.type === "BIRTHDAY" ? "Birthday" : "Anniversary"}</span>
                    <Pill tone={o.inDays === 0 ? "r" : o.inDays <= 2 ? "a" : "n"}>{o.inDays === 0 ? "today" : o.inDays === 1 ? "tomorrow" : `in ${o.inDays} days`}</Pill>
                  </div>
                  <div className="text-[11.5px]" style={{ color: T.grey }}>
                    {o.customer ? <>{o.relationship.toLowerCase()} of <Link href={`/customers/${o.customer.id}`} className="hover:underline" style={{ color: T.ink }}>{o.customer.name}</Link>{o.customer.phone ? ` · ${o.customer.phone}` : ""}</> : o.relationship.toLowerCase()}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div style={card}>
            <H3 hint={rangeLabel}>Lost orders</H3>
            <div className="text-[26px] leading-none font-semibold tabular-nums" style={{ color: (data?.lost.count ?? 0) > 0 ? T.amber : T.ink }}>{loading ? "…" : data?.lost.count ?? 0}</div>
            <div className="text-[12px] mt-1.5" style={{ color: T.grey }}>checkouts left unfinished · {money(data?.lost.paisa)} in baskets</div>
            <div className="text-[12px] mt-1" style={{ color: T.grey }}>{data ? `${data.lost.open} still open (inside the 15-minute window)` : ""}</div>
            <div className="mt-3"><Btn href="/orders/lost">Open Lost orders</Btn></div>
          </div>
          <div style={card}>
            <H3 hint="waiting for a decision">Returns &amp; refunds</H3>
            {data && data.returns.length === 0 && !loading && <div className="text-[13px] py-2" style={{ color: T.grey }}>No return is waiting.</div>}
            <ul className="m-0 p-0 list-none">
              {(data?.returns ?? []).map((r, i, all) => (
                <li key={r.id} className="flex justify-between gap-2 py-1.5 text-[12.5px]" style={{ borderBottom: i < all.length - 1 ? `1px dashed ${T.line}` : "none" }}>
                  <span className="min-w-0">
                    <Link href={`/returns/${r.id}`} className="font-medium hover:underline" style={{ color: T.ink }}>{r.returnNo}</Link>
                    <span style={{ color: T.grey }}> · {r.orderNo} · {r.customer}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Pill tone={r.status === "pending_approval" ? "a" : r.status === "approved" ? "b" : "n"}>{r.status.replace("_", " ")}</Pill>
                    <span className="block text-[11px] tabular-nums mt-0.5" style={{ color: T.grey }}>{formatTaka(r.valuePaisa)}</span>
                  </span>
                </li>
              ))}
            </ul>
            {data && data.returns.length > 0 && <div className="mt-2"><Btn href="/returns">All returns</Btn></div>}
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
