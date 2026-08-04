"use client";

/*
  Finance design kit — one look for every Finance screen.

  The money screens are the ones the owner opens when he is worried, so the job
  of the colour is to answer "is this fine or not?" before any number is read:
    emerald = ours / healthy      amber = needs attention soon
    rose    = wrong or overdue    sky   = neutral information
    orchid  = the brand accent, used for headings and actions only
*/

import { formatTaka } from "../_data/api";

export const WRAP = "px-6 md:px-8 pt-6 pb-16 max-w-[1400px]";

export type Tone = "brand" | "emerald" | "amber" | "rose" | "sky" | "slate";

export const TONE: Record<Tone, { bg: string; soft: string; text: string; ring: string; grad: string }> = {
  brand:   { bg: "#a021b8", soft: "#f7ecfa", text: "#7c1a92", ring: "#eeddf4", grad: "linear-gradient(135deg,#a021b8,#d98cb3)" },
  emerald: { bg: "#0f7d55", soft: "#e8f6ef", text: "#0b6244", ring: "#cdeade", grad: "linear-gradient(135deg,#0f7d55,#4fbf8b)" },
  amber:   { bg: "#b45309", soft: "#fff4e2", text: "#92400e", ring: "#f7e0bd", grad: "linear-gradient(135deg,#d97706,#f0b76a)" },
  rose:    { bg: "#b91c1c", soft: "#fdecec", text: "#991b1b", ring: "#f6cfcf", grad: "linear-gradient(135deg,#b91c1c,#ef7c7c)" },
  sky:     { bg: "#0369a1", soft: "#e0f2fe", text: "#075985", ring: "#c3e5f7", grad: "linear-gradient(135deg,#0369a1,#5eb7e8)" },
  slate:   { bg: "#5b5468", soft: "#f4f2f7", text: "#4a4456", ring: "#e7e3ee", grad: "linear-gradient(135deg,#5b5468,#a49bb5)" },
};

export const taka = (p: number) => formatTaka(p);
export const toPaisa = (v: string) => Math.round(Number(v || "0") * 100);
export const todayStr = () => new Date().toISOString().slice(0, 10);

/* ---------------- form + button styles ---------------- */

export const input =
  "w-full border border-[#e7dff0] rounded-xl px-3 py-2.5 text-[13.5px] outline-none bg-white transition-shadow focus:border-orchid focus:shadow-[0_0_0_3px_rgba(160,33,184,0.10)]";
export const label = "text-[11.5px] font-semibold text-body-soft mb-1 block";
/** field label — the one every Finance form uses */
export function Lbl({ children }: { children: React.ReactNode }) {
  return <label className={label}>{children}</label>;
}
const btnBase =
  "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold border transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]";
export const btnPrimary = `${btnBase} text-white border-transparent shadow-[0_2px_8px_rgba(160,33,184,0.25)] hover:shadow-[0_4px_14px_rgba(160,33,184,0.32)]`;
export const btnPrimaryStyle = { background: TONE.brand.grad };
export const btnGhost = `${btnBase} bg-white text-purple border-[#e7dff0] hover:border-orchid hover:bg-[#fdfaff]`;
export const btnSoft = `${btnBase} border-transparent`;

/* ---------------- page header ---------------- */

export function FinHeader({
  eyebrow = "Finance",
  title,
  sub,
  emoji,
  tone = "brand",
  right,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  emoji?: string;
  tone?: Tone;
  right?: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className="relative overflow-hidden rounded-3xl mb-6 shadow-[0_6px_24px_rgba(80,40,100,0.16)]" style={{ background: t.grad }}>
      <div className="absolute -right-10 -top-24 w-72 h-72 rounded-full bg-white opacity-[0.13]" />
      <div className="absolute -left-16 -bottom-28 w-64 h-64 rounded-full bg-white opacity-[0.09]" />
      <div className="relative px-6 md:px-7 py-6 flex items-start justify-between gap-5 flex-wrap">
        <div className="flex items-start gap-4">
          {emoji && (
            <div className="w-14 h-14 rounded-2xl grid place-items-center text-[26px] shrink-0 bg-white/25 backdrop-blur-sm ring-1 ring-white/40">
              {emoji}
            </div>
          )}
          <div>
            <div className="text-[11px] font-bold tracking-[0.14em] uppercase text-white/80">{eyebrow}</div>
            <h1 className="font-display text-[28px] text-white mt-0.5 mb-1 leading-tight drop-shadow-sm">{title}</h1>
            {sub && <p className="text-white/85 text-[13.5px] m-0 max-w-[720px] leading-relaxed">{sub}</p>}
          </div>
        </div>
        {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
      </div>
    </div>
  );
}

/* ---------------- cards ---------------- */

export function Card({ children, className = "", tone, style }: { children: React.ReactNode; className?: string; tone?: Tone; style?: React.CSSProperties }) {
  return (
    <div
      className={`bg-white border rounded-2xl shadow-[0_1px_3px_rgba(80,40,100,0.05)] ${className}`}
      style={{ borderColor: tone ? TONE[tone].ring : "#efe9f3", ...style }}
    >
      {children}
    </div>
  );
}

export function Panel({
  title,
  sub,
  right,
  tone = "slate",
  emoji,
  children,
  className = "",
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  tone?: Tone;
  emoji?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="px-5 py-3.5 flex items-center justify-between gap-3" style={{ background: t.grad }}>
        <div className="flex items-center gap-2.5">
          {emoji && <span className="text-[17px] drop-shadow-sm">{emoji}</span>}
          <div>
            <div className="font-display text-[16px] leading-tight text-white">{title}</div>
            {sub && <div className="text-[11.5px] text-white/80 mt-0.5">{sub}</div>}
          </div>
        </div>
        {right}
      </div>
      <div>{children}</div>
    </Card>
  );
}

/* ---------------- KPI ---------------- */

export function Kpi({
  label,
  value,
  hint,
  tone = "slate",
  emoji,
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  emoji?: string;
  trend?: { up: boolean; text: string };
}) {
  const t = TONE[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border px-4 py-4 transition-transform hover:-translate-y-[2px]"
      style={{ background: t.soft, borderColor: t.ring }}>
      <div className="absolute right-0 top-0 w-20 h-20 rounded-full opacity-[0.18] -mr-6 -mt-6" style={{ background: t.grad }} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="text-[10.5px] font-bold tracking-[0.06em] uppercase" style={{ color: t.text, opacity: 0.75 }}>{label}</div>
        {emoji && (
          <div className="w-9 h-9 rounded-xl grid place-items-center text-[15px] text-white shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
            style={{ background: t.grad }}>
            {emoji}
          </div>
        )}
      </div>
      <div className="relative text-[24px] font-bold mt-2 leading-none" style={{ color: t.text }}>{value}</div>
      {(hint || trend) && (
        <div className="relative flex items-center gap-2 mt-2 flex-wrap">
          {trend && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md text-white"
              style={{ background: trend.up ? TONE.emerald.bg : TONE.rose.bg }}>
              {trend.up ? "▲" : "▼"} {trend.text}
            </span>
          )}
          {hint && <span className="text-[11.5px]" style={{ color: t.text, opacity: 0.7 }}>{hint}</span>}
        </div>
      )}
    </div>
  );
}

/* ---------------- small pieces ---------------- */

export function Chip({ tone = "slate", children }: { tone?: Tone; children: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: t.soft, color: t.text }}>
      {children}
    </span>
  );
}

export function Bar({ pct, tone = "brand", height = 8 }: { pct: number; tone?: Tone; height?: number }) {
  const t = TONE[tone];
  return (
    <div className="w-full rounded-full bg-[#f2eef7] overflow-hidden" style={{ height }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: t.grad }}
      />
    </div>
  );
}

export function Money({ paisa, bold = false, colour = false }: { paisa: number; bold?: boolean; colour?: boolean }) {
  const tone = !colour ? undefined : paisa < 0 ? TONE.rose.text : paisa > 0 ? TONE.emerald.text : undefined;
  return <span className={bold ? "font-bold" : ""} style={{ color: tone }}>{taka(paisa)}</span>;
}

export function Empty({ emoji = "✦", title, sub }: { emoji?: string; title: string; sub?: string }) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="w-12 h-12 rounded-2xl grid place-items-center text-[20px] mx-auto mb-3" style={{ background: TONE.brand.soft }}>
        {emoji}
      </div>
      <div className="font-semibold text-purple text-[14px]">{title}</div>
      {sub && <div className="text-[12.5px] text-body-soft mt-1 max-w-[420px] mx-auto">{sub}</div>}
    </div>
  );
}

export function Banner({ tone = "amber", emoji, title, children, right }: { tone?: Tone; emoji?: string; title: string; children?: React.ReactNode; right?: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <div className="rounded-2xl border px-5 py-4 mb-5 flex items-start justify-between gap-4 flex-wrap"
      style={{ background: t.soft, borderColor: t.ring }}>
      <div className="flex items-start gap-3">
        {emoji && <span className="text-[18px] leading-none mt-0.5">{emoji}</span>}
        <div>
          <div className="font-semibold text-[14px]" style={{ color: t.text }}>{title}</div>
          {children && <div className="text-[13px] text-body-soft mt-0.5 max-w-[640px]">{children}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Flash({ ok, err }: { ok: string; err: string }) {
  if (!ok && !err) return null;
  const t = err ? TONE.rose : TONE.emerald;
  return (
    <div className="mb-4 px-4 py-3 rounded-xl text-[13px] font-semibold flex items-center gap-2"
      style={{ background: t.soft, color: t.text }}>
      <span>{err ? "!" : "✓"}</span>
      {err || ok}
    </div>
  );
}

/* ---------------- tabs ---------------- */

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { key: T; label: string; count?: number; emoji?: string; tone?: Tone }[];
}) {
  return (
    <div className="flex gap-2 flex-wrap mb-5">
      {items.map((it) => {
        const on = value === it.key;
        const t = TONE[it.tone ?? "brand"];
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold border transition-all ${on ? "text-white border-transparent shadow-[0_2px_10px_rgba(80,40,100,0.18)]" : "bg-white border-[#e7dff0] text-purple hover:border-orchid"}`}
            style={on ? { background: t.grad } : undefined}
          >
            {it.emoji && <span>{it.emoji}</span>}
            {it.label}
            {it.count !== undefined && (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                style={on ? { background: "rgba(255,255,255,0.25)" } : { background: t.soft, color: t.text }}>
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- table ---------------- */

export function Th({ children, right = false, w }: { children?: React.ReactNode; right?: boolean; w?: string }) {
  return (
    <th className={`px-4 py-2.5 font-semibold text-[10.5px] uppercase tracking-[0.06em] text-body-soft ${right ? "text-right" : "text-left"}`} style={w ? { width: w } : undefined}>
      {children}
    </th>
  );
}
export function Td({ children, right = false, className = "" }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-4 py-3 ${right ? "text-right" : ""} ${className}`}>{children}</td>;
}
export function Table({ head, children, tone }: { head: React.ReactNode; children: React.ReactNode; tone?: Tone }) {
  return (
    <table className="w-full text-[13px]">
      <thead style={{ background: tone ? TONE[tone].soft : "#f7f3fa" }}>
        <tr>{head}</tr>
      </thead>
      <tbody className="[&>tr]:border-t [&>tr]:border-[#f3eef7] [&>tr:hover]:bg-[#fdfbfe]">{children}</tbody>
    </table>
  );
}
