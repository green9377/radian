"use client";

import Icon from "./Icon";

/*
  ─── ONE SHELL FOR THE STOREFRONT SUB-MODULES — 11 Aug 2026 ────────────────
  Owner: *"4 ta sub module a thakuk ak jaygay ana dorkar, but protita module
  sundorvabe same design style a design kro"*. Four pages had four different
  heads (two font sizes, three max-widths, one odd CSS variable). This file is
  the one head they all wear now:

      gradient header  — icon tile · title · one-line blurb · status chips
      stat tiles       — the numbers that answer "how is this doing"
      body             — whatever the module is

  Each module keeps its own colour, all drawn from the brand ramp — purple,
  orchid, rose, rose gold. The colour is data here so a fifth module cannot
  invent a sixth colour by accident.
*/

export const MODULE_TONES = {
  purple: {
    fill: "linear-gradient(102deg,#470066,#7a1e86 68%,#b76e79)",
    soft: "#e9a8f5",
    tiles: [
      { bg: "#f9e9fd", label: "#96639a", value: "#5e1a5c" },
      { bg: "#FBEAF0", label: "#a06a7c", value: "#6b2138" },
      { bg: "#f8eef0", label: "#a5757e", value: "#6d3a43" },
      { bg: "#f3eff8", label: "#8b7c9c", value: "#453556" },
    ],
  },
  orchid: {
    fill: "linear-gradient(102deg,#8c2d84,#b444ad)",
    soft: "#f0c4ec",
    tiles: [
      { bg: "#f9e9fd", label: "#96639a", value: "#5e1a5c" },
      { bg: "#f3eff8", label: "#8b7c9c", value: "#453556" },
      { bg: "#FBEAF0", label: "#a06a7c", value: "#6b2138" },
      { bg: "#f8eef0", label: "#a5757e", value: "#6d3a43" },
    ],
  },
  rose: {
    fill: "linear-gradient(102deg,#993556,#c25476)",
    soft: "#f4c0d1",
    tiles: [
      { bg: "#FBEAF0", label: "#a06a7c", value: "#6b2138" },
      { bg: "#f8eef0", label: "#a5757e", value: "#6d3a43" },
      { bg: "#f9e9fd", label: "#96639a", value: "#5e1a5c" },
      { bg: "#f3eff8", label: "#8b7c9c", value: "#453556" },
    ],
  },
  rosegold: {
    fill: "linear-gradient(102deg,#98545f,#c07f8a)",
    soft: "#eccdd2",
    tiles: [
      { bg: "#f8eef0", label: "#a5757e", value: "#6d3a43" },
      { bg: "#FBEAF0", label: "#a06a7c", value: "#6b2138" },
      { bg: "#f3eff8", label: "#8b7c9c", value: "#453556" },
      { bg: "#f9e9fd", label: "#96639a", value: "#5e1a5c" },
    ],
  },
} as const;

export type ModuleTone = keyof typeof MODULE_TONES;

export function ModuleHeader({
  tone,
  icon,
  title,
  blurb,
  chips,
  action,
}: {
  tone: ModuleTone;
  icon: string;
  title: string;
  blurb: string;
  /** small status pills on the right — "1 waiting", "2 drafts" */
  chips?: { label: string; bg: string; color: string }[];
  /** the one primary action, orchid — "Add your own", "Write an article" */
  action?: { label: string; onClick: () => void };
}) {
  const t = MODULE_TONES[tone];
  return (
    <div className="flex items-center gap-3.5 px-5 py-4 flex-wrap" style={{ background: t.fill }}>
      <span className="w-[42px] h-[42px] rounded-[13px] grid place-items-center shrink-0"
        style={{ background: "rgba(255,255,255,.2)", color: "#fff" }}>
        <Icon name={icon} size={21} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16.5px] font-semibold text-white leading-tight">{title}</span>
        <span className="block text-[12px]" style={{ color: t.soft }}>{blurb}</span>
      </span>
      {chips?.map((c) => (
        <span key={c.label}
          className="text-[11.5px] font-medium px-3 py-1.5 rounded-full whitespace-nowrap shrink-0"
          style={{ background: c.bg, color: c.color }}>
          {c.label}
        </span>
      ))}
      {action && (
        <button type="button" onClick={action.onClick}
          className="text-[12.5px] font-semibold px-4 py-2 rounded-full text-white shrink-0 hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
          style={{ background: "#cf43ea" }}>
          <Icon name="plus" size={13} /> {action.label}
        </button>
      )}
    </div>
  );
}

export function StatTiles({ tone, stats }: {
  tone: ModuleTone;
  stats: { label: string; value: React.ReactNode }[];
}) {
  const t = MODULE_TONES[tone];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 px-5 pt-4">
      {stats.slice(0, 4).map((s, i) => {
        const c = t.tiles[i % t.tiles.length];
        return (
          <div key={s.label} className="rounded-[12px] px-3.5 py-2.5" style={{ background: c.bg }}>
            <div className="text-[11px]" style={{ color: c.label }}>{s.label}</div>
            <div className="text-[21px] font-semibold leading-tight" style={{ color: c.value }}>{s.value}</div>
          </div>
        );
      })}
    </div>
  );
}

/** the white card everything sits in — header goes first inside it */
export function ModuleCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-lavender-deep rounded-[18px] overflow-hidden shadow-soft">
      {children}
    </div>
  );
}

/** filter pills — the active one filled in brand purple */
export function FilterChips<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string; count?: number; tint?: { bg: string; color: string } }[];
}) {
  return (
    <div className="flex gap-2 px-5 py-3 flex-wrap">
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button key={o.v} type="button" onClick={() => onChange(o.v)}
            className="text-[12.5px] font-medium px-3.5 py-1.5 rounded-full border transition-colors inline-flex items-center gap-1.5"
            style={on
              ? { background: "#470066", color: "#fff", borderColor: "#470066" }
              : o.tint
                ? { background: o.tint.bg, color: o.tint.color, borderColor: "transparent" }
                : { background: "#fff", color: "#5c4a6b", borderColor: "#efe4f7" }}>
            {o.label}
            {o.count !== undefined && o.count > 0 && (
              <span className="text-[11px] rounded-full px-1.5"
                style={on ? { background: "rgba(255,255,255,.25)" } : { background: "rgba(0,0,0,.06)" }}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
