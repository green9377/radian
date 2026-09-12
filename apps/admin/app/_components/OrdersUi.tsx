"use client";

import Link from "next/link";
import Icon from "./Icon";

/*
  Shared pieces for the Orders module — All orders, Lost orders, Payments,
  Reports. One typeface (the ui face), one body size (13px), one accent
  weight (500). Approved from design/orders-module-v4.html and v5, 9 Sep 2026.

  RULES THE OWNER SET
  - Nothing in a table body is larger than 13px or heavier than 500.
  - Labels are 11px grey. The band's numbers are the only large type.
  - No vertical lines between cells; one hairline between rows.
  - Status is a soft-tinted pill, never a solid block.
  - No loose prose on the page; the explanation lives behind the i.
*/

export const SOLID = {
  orchid: "#cf43ea",
  indigo: "#4f46e5",
  green: "#0e8a44",
  amber: "#d97706",
  red: "#d92d20",
  blue: "#1d7fd6",
  purple: "#470066",
  grey: "#6b7280",
};

/** soft tint behind each solid colour */
const TINT: Record<string, string> = {
  [SOLID.orchid]: "var(--t-orchid)",
  [SOLID.indigo]: "var(--t-info)",
  [SOLID.green]: "var(--t-ok)",
  [SOLID.amber]: "var(--t-warn)",
  [SOLID.red]: "var(--t-bad)",
  [SOLID.blue]: "var(--t-info)",
  [SOLID.purple]: "var(--t-accent)",
  [SOLID.grey]: "var(--t-accent)",
};

export const CELL = "px-3.5 py-3.5 align-top border-b border-[var(--l-accent)] text-[13px] leading-[1.45]";
export const TH = "text-left bg-lavender text-purple font-medium text-[11.5px] tracking-[0.05em] uppercase px-3.5 py-3 border-b border-[var(--l-accent)] whitespace-nowrap";
export const LABEL = "block text-[11px] font-medium text-[var(--t-accent)] leading-[1.2] mt-px";
export const VALUE = "block font-medium text-body";
export const SOFT = "text-[var(--t-accent)]";
export const NO = "font-medium text-purple whitespace-nowrap hover:underline";
export const NAME = "font-medium text-purple hover:underline";
export const ICON_BTN = "w-[24px] h-[24px] rounded-[7px] border border-[var(--l-accent)] grid place-items-center text-body-soft hover:text-purple hover:border-purple bg-white";
export const ACT = "h-[30px] w-full rounded-[9px] px-3 inline-flex items-center justify-center gap-1.5 text-[12.5px] font-medium whitespace-nowrap border";
export const ACT_PRIMARY = `${ACT} bg-purple border-purple text-white hover:bg-purple-deep`;
export const ACT_QUIET = `${ACT} bg-white border-[var(--l-accent)] text-purple hover:border-purple`;
export const ACT_CALL = `${ACT} bg-white border-[var(--l-ok)] text-[var(--t-ok)] hover:border-[var(--l-ok)]`;
export const TABLE_WRAP = "bg-white border border-[var(--l-accent)] rounded-[14px] overflow-x-auto";
/*  Zebra rows everywhere (owner, 10 Sep 2026): one row white, the next on a
    whisper of lavender, so the eye keeps its line. Applied here once; every
    table built on this file gets it.  */
export const TABLE = "w-full border-collapse min-w-[1080px] [&_tbody_tr:nth-child(even)]:bg-[var(--s-accent)]";

export function Pill({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center text-[11.5px] font-medium px-2.5 py-[3px] rounded-full whitespace-nowrap leading-[1.2]"
      style={{ background: TINT[colour] ?? "#eee", color: colour }}
    >
      {children}
    </span>
  );
}

export function Tag({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-medium tracking-[0.04em] px-1.5 py-[2px] rounded-[5px] text-white leading-none ml-1.5 align-[1px]" style={{ background: colour }}>
      {children}
    </span>
  );
}

export function ActButton({
  kind = "quiet",
  colour,
  onClick,
  disabled,
  href,
  external,
  icon,
  children,
}: {
  kind?: "primary" | "quiet" | "call" | "solid";
  colour?: string;
  onClick?: () => void;
  disabled?: boolean;
  href?: string;
  external?: boolean;
  icon?: string;
  children: React.ReactNode;
}) {
  const cls = kind === "primary" ? ACT_PRIMARY : kind === "call" ? ACT_CALL : kind === "solid" ? `${ACT} text-white` : ACT_QUIET;
  const style = kind === "solid" && colour ? { background: colour, borderColor: colour } : undefined;
  const inner = (
    <>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </>
  );
  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls} style={style}>
        {inner}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${cls} disabled:opacity-60`} style={style}>
      {inner}
    </button>
  );
}

/* ---------- the purple band ---------- */
export interface Tile {
  key: string;
  label: string;
  value: string;
  sub?: string;
  hot?: boolean;
  /** a link out — only to a page that exists in this module */
  href?: string;
}
export function Band({
  title,
  help,
  right,
  tiles,
  active,
  onTile,
  columns = 5,
}: {
  title: string;
  /** optional one-line note shown behind the i bubble */
  help?: string;
  right?: React.ReactNode;
  tiles: Tile[];
  /** key of the tile that is currently filtering the page */
  active?: string;
  onTile?: (key: string) => void;
  columns?: 4 | 5 | 6 | 7;
}) {
  const base = "block rounded-[14px] px-4 py-3.5 border text-left w-full";
  const cols = columns === 4 ? "grid-cols-2 xl:grid-cols-4" : columns === 7 ? "grid-cols-2 md:grid-cols-4 xl:grid-cols-7" : columns === 6 ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-5";
  return (
    <div className="rounded-[20px] px-6 pt-5 pb-6 mb-4 text-white" style={{ background: "linear-gradient(135deg,var(--a-solid) 0%,var(--a-solid) 100%)" }}>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="font-display font-semibold text-[24px] leading-none m-0 inline-flex items-center gap-2.5 text-white">
          {title}
          {help && (
            <span className="w-5 h-5 rounded-full border border-white/40 text-[11px] font-medium grid place-items-center font-ui cursor-help" title={help}>
              i
            </span>
          )}
        </h1>
        {right}
      </div>
      <div className={`grid ${cols} gap-3`}>
        {tiles.map((t) => {
          const on = active === t.key;
          const inner = (
            <>
              <span className={`block text-[11.5px] font-medium ${on ? "text-white" : "text-[var(--t-accent)]"}`}>{t.label}</span>
              <span className="block font-medium text-[22px] leading-none mt-2" style={{ color: t.hot ? "var(--t-bad)" : "#fff" }}>
                {t.value}
              </span>
              {t.sub && <span className={`block text-[11.5px] mt-1.5 ${on ? "text-white/85" : "text-white/70"}`}>{t.sub}</span>}
            </>
          );
          const cls = on ? `${base} bg-white/[0.22] border-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.6)]` : `${base} border-white/15 bg-white/[0.08] hover:bg-white/[0.14]`;
          if (t.href) {
            return (
              <Link key={t.key} href={t.href} className={cls}>
                {inner}
              </Link>
            );
          }
          if (onTile) {
            return (
              <button key={t.key} type="button" onClick={() => onTile(t.key)} className={cls}>
                {inner}
              </button>
            );
          }
          return (
            <div key={t.key} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** the white button in the band */
export function BandButton({ href, onClick, icon, children }: { href?: string; onClick?: () => void; icon?: string; children: React.ReactNode }) {
  const cls = "bg-white text-purple text-[14px] font-medium px-5 py-2.5 rounded-[12px] inline-flex items-center gap-2 hover:bg-lavender";
  const inner = (
    <>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>{inner}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{inner}</button>
  );
}

/* ---------- segments + search ---------- */
export function Segs<K extends string>({
  items,
  value,
  counts,
  onChange,
}: {
  items: [K, string][];
  value: K;
  counts?: Partial<Record<K, number>>;
  onChange: (k: K) => void;
}) {
  return (
    <div className="inline-flex bg-white border border-[var(--l-accent)] rounded-[12px] p-1 gap-0.5">
      {items.map(([k, label]) => {
        const on = value === k;
        const n = counts?.[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={`px-3.5 py-2 rounded-[9px] text-[13px] font-medium inline-flex items-center gap-1.5 ${on ? "bg-purple text-white" : "text-body-soft hover:text-purple"}`}
          >
            {label}
            {n !== undefined && <span className={on ? "text-white/70" : "text-[var(--t-accent)]"}>{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1 min-w-[240px]">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft">
        <Icon name="search" size={16} />
      </span>
      <input className="ipt ipt-icon h-[40px]" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Count({ n, noun, loading }: { n: number; noun: string; loading: boolean }) {
  return <span className="text-[13px] font-medium text-body-soft">{loading ? "…" : `${n} ${noun}${n === 1 ? "" : "s"}`}</span>;
}

export function Head({ heads }: { heads: string[] }) {
  return (
    <thead>
      <tr>
        {heads.map((h, i) => (
          <th key={h || "select"} className={TH}>
            {i === 0 && h === "" ? <input type="checkbox" className="w-[15px] h-[15px] accent-purple" aria-label="Select all" /> : h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="px-4 py-12 text-center">
      <span className="w-11 h-11 rounded-full grid place-items-center mx-auto mb-2 bg-lavender text-purple">
        <Icon name="search" size={20} />
      </span>
      <p className="text-[13px] font-medium text-body-soft m-0">{text}</p>
    </div>
  );
}

/* ---------- dates + clipboard ---------- */
const DAY = 86_400_000;
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
/** "09 Sep · 5:51 PM" */
export function fmtStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}
/** "18 min ago" · "3 hours ago" · "3 days ago" */
export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
/** the delivery day the way staff say it: Today · Tomorrow · 12 Sep */
export function fmtDay(v?: string | null): { label: string; today: boolean } | null {
  if (!v) return null;
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return { label: v, today: false };
  const diff = Math.round((startOfDay(ms) - startOfDay(Date.now())) / DAY);
  if (diff === 0) return { label: "Today", today: true };
  if (diff === 1) return { label: "Tomorrow", today: false };
  if (diff === -1) return { label: "Yesterday", today: false };
  return { label: new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), today: false };
}

export function copy(text: string) {
  try {
    void navigator.clipboard.writeText(text);
  } catch {
    /* clipboard blocked — nothing to do */
  }
}

export function CopyIcon({ text, title = "Copy" }: { text: string; title?: string }) {
  return (
    <button type="button" title={title} className="text-body-soft hover:text-purple inline-flex align-middle" onClick={() => copy(text)}>
      <Icon name="copy" size={11} />
    </button>
  );
}
