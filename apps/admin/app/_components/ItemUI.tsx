"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import {
  itemTint, itemInitials, uploadItemImage, ITEM_TYPE_META,
  type ApiItem, type ItemType,
} from "../_data/api";

/*
  Shared Item-module chrome — used by Overview, List, Editor and Groups so the four
  screens cannot drift apart.
  Architecture: RADIAN_ITEM_MODULE_ARCHITECTURE.md (locked 21 Jul 2026).
*/

export const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

/* RADIAN BRAND ONLY (corrected 21 Jul, sobuj: "oder brand color kn niso").
   The layout of these screens was copied from the ERP he already uses, because the
   shape is familiar — the COLOURS were never meant to come with it. These are the
   house tokens from globals.css: purple #470066, orchid #cf43ea, lavender, rose gold. */
export const ACCENT = "#470066";      // brand purple — headers, primary buttons
export const ACCENT_SOFT = "#cf43ea"; // orchid — highlights
export const ACCENT_BG = "#f7f1fb";   // lavender — tinted panels

/** turns an API error string into something a shop owner can act on */
export function msg(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback;
  const m = e.message.match(/"message":"([^"]+)"/);
  // `LINKED:<n>:` is a machine prefix the delete dialog reads (ITM-R07); it must never
  // reach a human. Strip it here so any screen that prints the raw message stays clean.
  if (m) return m[1].replace(/LINKED:\d+:\s*/, "");
  if (/Failed to fetch|NetworkError/i.test(e.message)) {
    return "Cannot reach the API (:4000). Start it and try again.";
  }
  const clean = e.message.replace(/^LINKED:\d+:\s*/, "");
  return clean.length > 160 ? fallback : clean;
}

/* ---------------------------------------------------------------- page header */

export function ItemPageHead({
  eyebrow, title, blurb, right,
}: { eyebrow: string; title: string; blurb?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
      <div>
        <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: ACCENT }}>
          <span className="w-[9px] h-[9px] -rotate-45" style={{ borderRadius: "50% 50% 50% 0", background: `linear-gradient(150deg,${ACCENT},#cf43ea)` }} />
          {eyebrow}
        </div>
        <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">{title}</h1>
        {blurb && <p className="text-body-soft text-[13.5px] m-0 max-w-[800px]">{blurb}</p>}
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- banners */

export function ErrBar({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px] flex items-start justify-between gap-3">
      <span>{text}</span><button className="underline shrink-0" onClick={onClose}>Dismiss</button>
    </div>
  );
}
export function OkBar({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="bg-[#e8f7ef] border border-[#a9dcc0] text-[#0e7a3d] rounded-[12px] px-4 py-3 mb-4 text-[13px] flex items-start justify-between gap-3">
      <span>{text}</span><button className="underline shrink-0" onClick={onClose}>Dismiss</button>
    </div>
  );
}
export function DemoBar({ onRetry, what }: { onRetry: () => void; what: string }) {
  return (
    <div className="flex items-center gap-3 bg-[#fff4e6] border border-[#fce4c4] text-[#b45309] rounded-[12px] px-4 py-2.5 mb-4 text-[12.5px] flex-wrap">
      <span className="text-[10px] font-bold tracking-[0.06em] uppercase bg-[#b45309] text-white px-2 py-1 rounded-full shrink-0">Offline</span>
      <span className="flex-1 min-w-[240px]">
        The API is not reachable, so nothing can be shown. Start it and
        <button className="underline font-medium mx-1" onClick={onRetry}>retry</button>
        to see what is really there.
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- KPI */

export function Kpi({ items }: { items: { l: string; v: string | number; c: string; bg: string; icon: string; href?: string }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
      {items.map((k, i) => (
        <div key={i} className="rounded-[14px] px-3.5 py-3 shadow-soft border border-white/60" style={{ background: k.bg }}>
          <span className="w-[24px] h-[24px] rounded-[7px] flex items-center justify-center text-white" style={{ background: k.c }}>
            <Icon name={k.icon} size={13} />
          </span>
          <div className="font-display text-[23px] leading-none mt-2.5" style={{ color: k.c }}>{k.v}</div>
          <div className="text-[11px] font-medium text-body mt-1.5">{k.l}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- photos (DEC-ITM-012) */

/** row tile — a real photo, or a stable colour derived from the SKU so lists stay scannable */
export function ItemThumb({
  item, size = 38, onClick,
}: { item: Pick<ApiItem, "sku" | "name" | "imageUrl">; size?: number; onClick?: () => void }) {
  const inner = item.imageUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
    : itemInitials(item.name);
  const cls = "rounded-[10px] overflow-hidden shrink-0 grid place-items-center text-white font-semibold shadow-soft";
  const style = {
    width: size, height: size, fontSize: Math.round(size / 3),
    ...(item.imageUrl ? {} : { background: itemTint(item.sku) }),
  };
  return onClick
    ? <button onClick={onClick} className={cls} style={style} title={item.imageUrl ? "" : "No photo yet"}>{inner}</button>
    : <span className={cls} style={style}>{inner}</span>;
}

/** upload/replace box used in the editor */
export function ItemPhotoBox({
  item, onImage, size = 120, hint = true,
}: { item: Pick<ApiItem, "sku" | "name" | "imageUrl">; onImage: (u: string | null) => void; size?: number; hint?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);

  async function pick(file?: File | null) {
    if (!file) return;
    setBusy(true); setWarn(null);
    // the URL is handed up only after the upload succeeds — a preview drawn
    // before that would show a photograph that never reached the server
    try { onImage(await uploadItemImage(file, "items")); }
    catch (e) { setWarn(e instanceof Error ? e.message : "Could not use that image."); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <label
        className="block rounded-[14px] overflow-hidden cursor-pointer grid place-items-center text-white font-semibold shadow-soft relative"
        style={{ width: size, height: size, fontSize: Math.round(size / 3.5), ...(item.imageUrl ? {} : { background: itemTint(item.sku || item.name || "new") }) }}
      >
        {item.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
          : itemInitials(item.name || "?")}
        <span className="absolute inset-x-0 bottom-0 bg-black/45 text-white text-[11px] text-center py-1">
          {busy ? "…" : item.imageUrl ? "Change photo" : "Add photo"}
        </span>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {item.imageUrl && (
        <button type="button" onClick={() => onImage(null)} className="text-[13px] text-body-soft underline mt-1.5">remove photo</button>
      )}
      {warn && <div className="text-[11px] text-[#c0392b] mt-1" style={{ maxWidth: size }}>{warn}</div>}
      {hint && !warn && !item.imageUrl && (
        <p className="text-[13px] text-body-soft m-0 mt-1.5 leading-snug" style={{ maxWidth: size + 30 }}>
          Until you add one, the tile colour is fixed per SKU — so the list is still scannable.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------- select-or-create combobox */

/**
 * "Select or Create" — the single biggest usability lesson from the Biznify audit
 * (21 Jul). There, every reference field on the Add-Item form lets you type a new value
 * and make it on the spot: "Select or Create brand", "Select or Create Color".
 *
 * The earlier Radian design made you visit /items/categories, then /items/attributes,
 * then /items/new — three pages before one item existed. Nobody does that twice.
 *
 * Type to filter; if nothing matches, the last row becomes “Create «what you typed»”.
 */
type QuickOption = {
  id: string;
  label: string;
  hint?: string;
  swatch?: string | null;
  /** show the thing's photo (or, with tintSeed, its stable colour tile) — the same
   *  visual it has everywhere else in the Item module (DEC-ITM-012). Owner's rule,
   *  22 Jul: "item click krle jen akdom image show kre". */
  imageUrl?: string | null;
  tintSeed?: string;
};

/** 26px version of ItemThumb for picker rows */
function OptionThumb({ o, size = 26 }: { o: QuickOption; size?: number }) {
  if (!o.imageUrl && !o.tintSeed) return null;
  return (
    <span className="rounded-[7px] overflow-hidden shrink-0 grid place-items-center text-white font-semibold"
      style={{
        width: size, height: size, fontSize: Math.round(size / 2.6),
        ...(o.imageUrl ? {} : { background: itemTint(o.tintSeed ?? o.label) }),
      }}>
      {o.imageUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={o.imageUrl} alt="" className="w-full h-full object-cover" />
        : itemInitials(o.label)}
    </span>
  );
}

export function QuickSelect({
  value, options, placeholder, onChange, onCreate, allowClear = true, createLabel = "Create",
}: {
  value: string;
  options: QuickOption[];
  placeholder: string;
  onChange: (id: string) => void;
  onCreate?: (label: string) => Promise<string | null>;
  allowClear?: boolean;
  createLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  /*  ⚠️ THE PANEL LIVES IN A PORTAL — 26 Aug 2026. It used to be position:
      absolute inside the field's own cell. Any ancestor with overflow-hidden
      (every rounded table card has it, for its coloured header) sliced the
      panel off at the card's edge — on the purchase bill the unit dropdown
      showed as a bare search box with every option cut away below. The owner
      caught it. Rendering into <body> puts the panel above any clipping,
      wherever a QuickSelect sits, now and in future screens.  */
  const anchorRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]);

  const chosen = options.find((o) => o.id === value) ?? null;
  const needle = q.trim().toLowerCase();
  const matches = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const exact = options.some((o) => o.label.toLowerCase() === needle);
  const canCreate = !!onCreate && needle.length > 0 && !exact;

  async function create() {
    if (!onCreate) return;
    setBusy(true);
    try {
      const id = await onCreate(q.trim());
      if (id) { onChange(id); setOpen(false); setQ(""); }
    } finally { setBusy(false); }
  }

  return (
    <div className="relative" ref={anchorRef}>
      <button type="button" onClick={() => { setOpen((v) => !v); setQ(""); }}
        className="ipt w-full text-left flex items-center gap-2"
        style={{ minHeight: 40 }}>
        {chosen?.swatch && <span className="w-[13px] h-[13px] rounded-full border border-lavender-deep shrink-0" style={{ background: chosen.swatch }} />}
        {chosen && <OptionThumb o={chosen} size={24} />}
        <span className={chosen ? "text-body flex-1 truncate" : "text-body-soft flex-1 truncate"}>
          {chosen?.label ?? placeholder}
        </span>
        <Icon name="chevronDown" size={14} />
      </button>

      {open && pos && createPortal(
        <>
          {/* click-away */}
          <button type="button" className="fixed inset-0 z-[70] cursor-default" onClick={() => setOpen(false)} aria-hidden />
          <div className="fixed z-[80] bg-white border border-lavender-deep rounded-[12px] shadow-lift overflow-hidden"
            style={{ top: pos.top, left: pos.left, width: pos.width }}>
            <div className="p-2 border-b border-lavender-deep">
              <input
                autoFocus className="ipt w-full" style={{ minHeight: 34, fontSize: 12.5 }}
                placeholder={onCreate ? "Search, or type a new one…" : "Search…"}
                value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canCreate) { e.preventDefault(); create(); } }}
              />
            </div>

            <div className="max-h-[220px] overflow-y-auto">
              {allowClear && !needle && (
                <button type="button" onClick={() => { onChange(""); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-[13px] text-body-soft hover:bg-lavender/40">
                  — none —
                </button>
              )}
              {matches.map((o) => (
                <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-lavender/40 flex items-center gap-2">
                  {o.swatch && <span className="w-[13px] h-[13px] rounded-full border border-lavender-deep shrink-0" style={{ background: o.swatch }} />}
                  <OptionThumb o={o} />
                  <span className={o.id === value ? "text-purple font-medium" : "text-body"}>{o.label}</span>
                  {o.hint && <span className="ml-auto text-[13px] text-body-soft shrink-0">{o.hint}</span>}
                </button>
              ))}
              {matches.length === 0 && !canCreate && (
                <div className="px-3 py-3 text-[13px] text-body-soft">Nothing matches.</div>
              )}
            </div>

            {canCreate && (
              <button type="button" onClick={create} disabled={busy}
                className="w-full text-left px-3 py-2.5 text-[12.5px] font-medium border-t border-lavender-deep flex items-center gap-2 disabled:opacity-60"
                style={{ background: ACCENT_BG, color: ACCENT }}>
                <Icon name="plus" size={13} />
                {busy ? "Creating…" : `${createLabel} “${q.trim()}”`}
              </button>
            )}
            {/* the create path was invisible until you typed — the owner looked for a
                "create" option and found none (19 Aug). Now the door shows itself. */}
            {!!onCreate && !canCreate && (
              <div className="w-full px-3 py-2.5 text-[12.5px] font-medium border-t border-lavender-deep flex items-center gap-2"
                style={{ background: ACCENT_BG, color: ACCENT, opacity: 0.75 }}>
                <Icon name="plus" size={13} />
                New? Type the name above — it is created on the spot.
              </div>
            )}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- modal + table

   Shape copied from the ERP the owner already uses (Biznify), 21 Jul: a plain table
   with an "Add New" button top-right that opens a small centred dialog. It is the
   pattern his staff already know, so there is nothing to learn.
   ------------------------------------------------------------------------------ */

export function Modal({
  title, onClose, onSave, saveLabel = "Save", canSave = true, busy, children, wide,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
  canSave?: boolean;
  busy?: boolean;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(40,20,50,.42)" }}>
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close" />
      <div className="relative bg-white rounded-[16px] shadow-2xl w-full overflow-hidden" style={{ maxWidth: wide ? 640 : 460 }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-lavender-deep">
          <h2 className="font-display text-[18px] text-purple m-0">{title}</h2>
          <button onClick={onClose} className="text-body-soft hover:text-purple text-[20px] leading-none px-1">×</button>
        </div>
        <div className="px-5 py-4 max-h-[62vh] overflow-y-auto">{children}</div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-lavender-deep bg-lavender/20">
          <button onClick={onClose} className="border border-lavender-deep bg-white text-purple text-[13px] font-medium px-4 py-2 rounded-[10px] hover:border-orchid">
            Cancel
          </button>
          <button onClick={onSave} disabled={!canSave || busy}
            className="text-white text-[13px] font-medium px-5 py-2 rounded-[10px] disabled:opacity-40"
            style={{ background: ACCENT }}>
            {busy ? "Saving…" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** the field label used inside a modal — `.lbl` / `.hint` are panel-wide (globals.css) */
export function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <label className="lbl">
        {label}{required && <span className="req">*</span>}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

/** the green Active / grey Hidden pill from the table */
export function StatusPill({ active, onClick }: { active: boolean; onClick?: () => void }) {
  const style = active
    ? { background: "#12a172", color: "#fff" }
    : { background: "#e5dced", color: "#6b5878" };
  const cls = "text-[11px] font-semibold px-2.5 py-1 rounded-full";
  return onClick
    ? <button onClick={onClick} className={cls} style={style}>{active ? "Active" : "Hidden"}</button>
    : <span className={cls} style={style}>{active ? "Active" : "Hidden"}</span>;
}

/** the red "the API is not answering" box — every Item screen shows the same one */
export function OfflineBox({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-[#fdecea] border-2 border-[#e0a1a1] rounded-[14px] px-5 py-4 mb-5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-[26px] h-[26px] rounded-[8px] grid place-items-center text-white" style={{ background: "#c0392b" }}>
          <Icon name="bolt" size={14} />
        </span>
        <b className="text-[14px] text-[#c0392b]">Nothing can be saved yet</b>
      </div>
      <p className="text-[13px] text-body m-0 leading-relaxed">
        This page is fine — but the part of Radian that stores your data is not answering, so anything typed here
        would vanish. Nothing you did caused this.
      </p>
      <p className="text-[13px] text-body m-0 mt-2">
        <b>One fix:</b> double-click <code className="bg-white px-1.5 py-0.5 rounded border border-[#e0a1a1]">D:\radian\FIX_ME.bat</code>,
        let it finish, then <button className="underline font-medium" onClick={onRetry}>press here to retry</button>.
      </p>
    </div>
  );
}

/** table wrapper + the blue header row */
export function DataTable({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-lavender-deep rounded-[14px] shadow-soft overflow-hidden">
      <div style={{ background: ACCENT }} className="th-on-dark">
        {head}
      </div>
      <div className="divide-y divide-lavender-deep">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- small bits */

export function Flag({
  on, label, colour, onClick, hint,
}: { on: boolean; label: string; colour: string; onClick: () => void; hint?: string }) {
  return (
    <button type="button" onClick={onClick} title={hint}
      className="text-[12px] px-2.5 py-1.5 rounded-[9px] border inline-flex items-center gap-1.5"
      style={on ? { background: colour, borderColor: colour, color: "#fff" } : { background: "#fff", borderColor: "#e3d7ec", color: "#8d7a97" }}>
      <Icon name={on ? "check" : "plus"} size={11} /> {label}
    </button>
  );
}

export function TypeChip({ type }: { type: ItemType }) {
  const m = ITEM_TYPE_META[type];
  return (
    <span className="text-[11px] font-semibold px-2 py-1 rounded-full text-center justify-self-start"
      style={{ background: m.bg, color: m.colour }}>{m.short}</span>
  );
}

/** the two-card strip that teaches the model — shown on Overview and on the create page */
export function ModelExplainer({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-[16px] border px-5 py-4 mb-5 bg-white shadow-soft" style={{ borderColor: "#efe4f7" }}>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-center">
        <MiniCard
          tone="#0e8f74" bg="#e7f5f1" title="Bought as it is"
          body="A teddy bear, a box of chocolates, a rose stem. One thing, one Item."
          foot="Teddy Bear → 1 Item"
        />
        <div className="hidden lg:block text-[22px] text-body-soft text-center">+</div>
        <MiniCard
          tone="#7a2ea8" bg="#f5eafb" title="Built from several"
          body="A bouquet is not a thing we buy — it is 24 roses + ribbon + paper. That combination is ALSO one Item, with a recipe inside it."
          foot="Bouquet → 1 Item, made of 4 Items"
        />
      </div>
      {!compact && (
        <div className="mt-3.5 pt-3.5 border-t border-lavender-deep text-[13px] text-body flex items-start gap-2.5">
          <span className="w-[22px] h-[22px] rounded-[7px] grid place-items-center text-white shrink-0 mt-0.5" style={{ background: ACCENT }}>
            <Icon name="bolt" size={12} />
          </span>
          <span>
            <b className="text-purple">So a Product never has to be special.</b> Whether it is a teddy or a bouquet, the rule
            is always the same — one Product points at one Item, by SKU. All the complicated part lives here, in the recipe.
          </span>
        </div>
      )}
    </div>
  );
}

function MiniCard({ tone, bg, title, body, foot }: { tone: string; bg: string; title: string; body: string; foot: string }) {
  return (
    <div className="rounded-[13px] px-4 py-3" style={{ background: bg }}>
      <div className="font-display text-[15px]" style={{ color: tone }}>{title}</div>
      <p className="text-[13px] text-body m-0 mt-1 leading-relaxed">{body}</p>
      <div className="text-[11.5px] font-medium mt-2 px-2 py-1 rounded-[7px] bg-white/70 inline-block" style={{ color: tone }}>{foot}</div>
    </div>
  );
}

/** DEC-ITM-005 — the panel that explains why there is no stock number yet */
export function StockNote() {
  return (
    <div className="rounded-[16px] border px-4 py-3.5" style={{ background: "#fbf1e2", borderColor: "#f0dcb8" }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-[22px] h-[22px] rounded-[7px] grid place-items-center text-white" style={{ background: "#b45309" }}><Icon name="box" size={12} /></span>
        <span className="text-[12.5px] font-semibold" style={{ color: "#8a5209" }}>Where is stock?</span>
      </div>
      <p className="text-[12px] text-body m-0 leading-relaxed">
        The Stock column is here, but it is <b>read-only</b> — the number will be pulled from Inventory, which does not
        exist yet. Stock has to be counted per shop and per warehouse, so it cannot live on the item itself.
      </p>
      <p className="text-[13px] text-body-soft m-0 mt-2">
        Nothing about your live orders changes. When Inventory is built, this column fills in by itself —
        and a made-to-order bouquet will read <i>“can build 5”</i> instead of a made-up number.
      </p>
    </div>
  );
}
