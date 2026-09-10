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
    soft: "#401c46",
    tiles: [
      { bg: "#34163b", label: "#bd9cbf", value: "#de87db" },
      { bg: "#381a24", label: "#bf9ba7", value: "#db8aa3" },
      { bg: "#322023", label: "#bf9ca3", value: "#ca9ba3" },
      { bg: "#282032", label: "#ada2b9", value: "#dfd2e4" },
    ],
  },
  orchid: {
    fill: "linear-gradient(102deg,#8c2d84,#b444ad)",
    soft: "#3e1f3b",
    tiles: [
      { bg: "#34163b", label: "#bd9cbf", value: "#de87db" },
      { bg: "#282032", label: "#ada2b9", value: "#dfd2e4" },
      { bg: "#381a24", label: "#bf9ba7", value: "#db8aa3" },
      { bg: "#322023", label: "#bf9ca3", value: "#ca9ba3" },
    ],
  },
  rose: {
    fill: "linear-gradient(102deg,#993556,#c25476)",
    soft: "#401c28",
    tiles: [
      { bg: "#381a24", label: "#bf9ba7", value: "#db8aa3" },
      { bg: "#322023", label: "#bf9ca3", value: "#ca9ba3" },
      { bg: "#34163b", label: "#bd9cbf", value: "#de87db" },
      { bg: "#282032", label: "#ada2b9", value: "#dfd2e4" },
    ],
  },
  rosegold: {
    fill: "linear-gradient(102deg,#98545f,#c07f8a)",
    soft: "#392326",
    tiles: [
      { bg: "#322023", label: "#bf9ca3", value: "#ca9ba3" },
      { bg: "#381a24", label: "#bf9ba7", value: "#db8aa3" },
      { bg: "#282032", label: "#ada2b9", value: "#dfd2e4" },
      { bg: "#34163b", label: "#bd9cbf", value: "#de87db" },
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
    <div className="flex items-center gap-3.5 px-5 py-4 flex-wrap rounded-t-[17px]" style={{ background: t.fill }}>
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

/** the white card everything sits in — header goes first inside it.
 *  ⚠️ NO overflow-hidden here: it silently kills position:sticky on every
 *  descendant, which is why the section rails would not stay put while the
 *  content scrolled (owner, 12 Aug). The header rounds its own top corners
 *  instead. */
export function ModuleCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft">
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
              ? { background: "#470066", color: "#fff", borderColor: "#ce6ef7" }
              : o.tint
                ? { background: o.tint.bg, color: o.tint.color, borderColor: "transparent" }
                : { background: "#fff", color: "#dfd2e4", borderColor: "#efe4f7" }}>
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
