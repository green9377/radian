"use client";

/*
  Tiny SVG charts — dependency-free, brand-coloured.

  Born 18 Aug 2026, when the owner put three CRM dashboards on the table and
  said our screens feel boring beside them: "dekhlei sob clear hoye jay" —
  a glance should be enough. Numbers in text rows are honest but silent;
  these make the same numbers speak.

  Nothing here fetches anything. Pure props in, pixels out — so any screen
  can use them and the self-tests never need a browser.
*/

const TAU = Math.PI * 2;

/* ── Donut — share of a whole, e.g. live/sandbox/off ─────────────────── */
export function Donut({
  segments, size = 120, thickness = 14, centerTop, centerBottom,
}: {
  segments: { value: number; color: string }[];
  size?: number; thickness?: number;
  centerTop?: string; centerBottom?: string;
}) {
  const total = Math.max(1, segments.reduce((n, s) => n + s.value, 0));
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = TAU * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#f1ecf7" strokeWidth={thickness} />
      {segments.filter((s) => s.value > 0).map((s, i) => {
        const frac = s.value / total;
        const dash = frac * circ;
        const offset = circ * 0.25 - acc * circ; // start at 12 o'clock
        acc += frac;
        return (
          <circle key={i} cx={c} cy={c} r={r} fill="none"
            stroke={s.color} strokeWidth={thickness} strokeLinecap="round"
            strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={offset}
            style={{ transition: "stroke-dasharray .5s ease" }} />
        );
      })}
      {centerTop && (
        <text x={c} y={centerBottom ? c - 2 : c + 1} textAnchor="middle" dominantBaseline="middle"
          fontSize={size / 4.6} fontWeight={700} fill="#470066">{centerTop}</text>
      )}
      {centerBottom && (
        <text x={c} y={c + size / 7.5} textAnchor="middle" dominantBaseline="middle"
          fontSize={size / 11} fontWeight={600} fill="#9b8fae">{centerBottom}</text>
      )}
    </svg>
  );
}

/* ── Gauge — a half-circle "how far along" dial ──────────────────────── */
export function Gauge({
  pct, size = 150, thickness = 15, color, track = "#f1ecf7", label, sub,
}: {
  pct: number; size?: number; thickness?: number;
  color: string; track?: string; label?: string; sub?: string;
}) {
  const p = Math.max(0, Math.min(100, pct));
  const r = (size - thickness) / 2;
  const c = size / 2;
  const half = Math.PI * r;
  const h = size / 2 + thickness / 2 + 4;
  return (
    <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} aria-hidden="true">
      <path d={`M ${thickness / 2} ${c} A ${r} ${r} 0 0 1 ${size - thickness / 2} ${c}`}
        fill="none" stroke={track} strokeWidth={thickness} strokeLinecap="round" />
      <path d={`M ${thickness / 2} ${c} A ${r} ${r} 0 0 1 ${size - thickness / 2} ${c}`}
        fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round"
        strokeDasharray={`${(p / 100) * half} ${half}`}
        style={{ transition: "stroke-dasharray .5s ease" }} />
      <text x={c} y={c - 6} textAnchor="middle" fontSize={size / 5.4} fontWeight={700} fill="#470066">
        {label ?? `${Math.round(p)}%`}
      </text>
      {sub && (
        <text x={c} y={c + size / 11} textAnchor="middle" fontSize={size / 12.5} fontWeight={600} fill="#9b8fae">
          {sub}
        </text>
      )}
    </svg>
  );
}

/* ── Ring — a single completion circle with a % in the middle ────────── */
export function Ring({
  pct, size = 92, thickness = 10, color, label,
}: { pct: number; size?: number; thickness?: number; color: string; label?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = TAU * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#f1ecf7" strokeWidth={thickness} />
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={thickness}
        strokeLinecap="round" strokeDasharray={`${(p / 100) * circ} ${circ}`}
        strokeDashoffset={circ * 0.25}
        style={{ transition: "stroke-dasharray .5s ease" }} />
      <text x={c} y={c + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize={size / 4.4} fontWeight={700} fill="#470066">
        {label ?? `${Math.round(p)}%`}
      </text>
    </svg>
  );
}

/* ── MiniBars — a small history strip, e.g. backup sizes ─────────────── */
export function MiniBars({
  values, color, width = 120, height = 42, radius = 2.5,
}: { values: number[]; color: string; width?: number; height?: number; radius?: number }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const gap = 4;
  const bw = Math.max(4, (width - gap * (values.length - 1)) / values.length);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {values.map((v, i) => {
        const h = Math.max(3, (v / max) * height);
        return (
          <rect key={i} x={i * (bw + gap)} y={height - h} width={bw} height={h}
            rx={radius} fill={color} opacity={0.35 + 0.65 * (v / max)} />
        );
      })}
    </svg>
  );
}

/* ── HBar — one labelled horizontal bar in a comparison list ─────────── */
export function HBar({
  label, value, max, color, right,
}: { label: string; value: number; max: number; color: string; right?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-center justify-between text-[11.5px] mb-1">
        <span className="font-semibold text-body truncate">{label}</span>
        <span className="font-bold shrink-0 ml-2" style={{ color }}>{right ?? value}</span>
      </div>
      <div className="h-[7px] rounded-full bg-[#f1ecf7] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: "width .5s ease" }} />
      </div>
    </div>
  );
}

/* ── Legend dot ──────────────────────────────────────────────────────── */
export function LegendDot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-body mr-3">
      <span className="w-[9px] h-[9px] rounded-full inline-block" style={{ background: color }} />
      {children}
    </span>
  );
}
