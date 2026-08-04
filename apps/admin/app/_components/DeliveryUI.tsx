"use client";

import Icon from "./Icon";

/* Delivery — shared editor UI helpers, matching the CategoryEditor / CategoriesView
   house style (Section · Field · ToggleField · Switch). Keeps every Delivery screen
   consistent with the rest of the admin. */

export const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

export function Header({
  eyebrow, title, desc, actions,
}: { eyebrow: string; title: string; desc?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
      <div>
        <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
          <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
          {eyebrow}
        </div>
        <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">{title}</h1>
        {desc && <p className="text-body-soft text-[13.5px] m-0 max-w-[720px]">{desc}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function DemoBadge({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 bg-[#f5eafb] border border-[#e3c8f2] text-purple rounded-[12px] px-4 py-2.5 mb-4 text-[12.5px] flex-wrap">
      <span className="text-[10px] font-bold tracking-[0.06em] uppercase bg-purple text-white px-2 py-1 rounded-full shrink-0">Demo data</span>
      <span className="flex-1 min-w-[220px]">{text}</span>
    </div>
  );
}

export function StatCards({ items }: { items: { l: string; v: string; c: string; bg: string; icon: string }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3 mb-6">
      {items.map((k, i) => (
        <div key={i} className="rounded-[14px] px-3.5 py-3 shadow-soft border border-white/60" style={{ background: k.bg }}>
          <span className="w-[24px] h-[24px] rounded-[7px] flex items-center justify-center text-white" style={{ background: k.c }}><Icon name={k.icon} size={13} /></span>
          <div className="font-display text-[23px] leading-none mt-2.5" style={{ color: k.c }}>{k.v}</div>
          <div className="text-[11px] font-medium text-body mt-1.5">{k.l}</div>
        </div>
      ))}
    </div>
  );
}

export function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-[24px] h-[24px] rounded-[7px] grid place-items-center text-white bg-orchid"><Icon name={icon} size={13} /></span>
        <span className="font-display text-[15px] text-purple">{title}</span>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-body flex items-center gap-1.5 mb-1.5">
        {label}{required && <span className="text-[#c0392b]">*</span>}
      </span>
      {children}
      {hint && <div className="text-[13px] text-body-soft mt-1.5">{hint}</div>}
    </label>
  );
}

export function ToggleField({ label, hint, on, onToggle }: { label: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="border border-lavender-deep rounded-[12px] px-3.5 py-3 flex items-start justify-between gap-3">
      <div>
        <div className="text-[13px] font-medium text-purple">{label}</div>
        <div className="text-[13px] text-body-soft mt-0.5">{hint}</div>
      </div>
      <Switch on={on} onClick={onToggle} />
    </div>
  );
}

export function Switch({ on, onClick, small }: { on: boolean; onClick: () => void; small?: boolean }) {
  const w = small ? 32 : 38, h = small ? 19 : 22, k = small ? 13 : 16;
  return (
    <button type="button" onClick={onClick} className={"relative rounded-full transition-colors shrink-0 " + (on ? "bg-orchid" : "bg-lavender-deep")} style={{ width: w, height: h }}>
      <span className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all" style={{ width: k, height: k, left: on ? w - k - 3 : 3 }} />
    </button>
  );
}

/** empty right-pane placeholder ("select or add") */
export function EditorEmpty({ icon, title, desc, onAdd, addLabel }: { icon: string; title: string; desc: string; onAdd: () => void; addLabel: string }) {
  return (
    <div className="bg-white border border-dashed border-lavender-deep rounded-[18px] shadow-soft p-10 text-center">
      <span className="w-[46px] h-[46px] rounded-[13px] grid place-items-center text-white bg-orchid mx-auto mb-3"><Icon name={icon} size={22} /></span>
      <div className="font-display text-[18px] text-purple mb-1">{title}</div>
      <p className="text-body-soft text-[13px] max-w-[420px] mx-auto mb-4">{desc}</p>
      <button onClick={onAdd} className="bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2"><Icon name="plus" size={16} /> {addLabel}</button>
    </div>
  );
}

export function EditorShell({ title, sub, onCancel, onSave, saveLabel = "Save", canSave = true, footer, children }: {
  title: string; sub?: string; onCancel: () => void; onSave: () => void; saveLabel?: string; canSave?: boolean; footer?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft xl:sticky xl:top-4">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-lavender-deep bg-gradient-to-r from-lavender to-white rounded-t-[18px]">
        <div className="min-w-0">
          <div className="font-display text-[17px] text-purple leading-tight truncate">{title}</div>
          {sub && <div className="text-[13px] text-body-soft">{sub}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onCancel} className="text-[13px] text-body-soft hover:text-purple px-2">Cancel</button>
          <button onClick={onSave} disabled={!canSave} className="bg-purple hover:bg-purple-deep disabled:opacity-60 text-white text-[13.5px] font-medium px-5 py-2 rounded-[10px] shadow-soft inline-flex items-center gap-1.5">
            <Icon name="check" size={15} /> {saveLabel}
          </button>
        </div>
      </div>
      <div className="p-5 space-y-6">{children}{footer}</div>
    </div>
  );
}
