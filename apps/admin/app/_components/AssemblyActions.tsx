"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import {
  WRAP, ACCENT, ItemPageHead, DemoBar, DataTable, ItemThumb, ItemPhotoBox, Modal, Field,
  QuickSelect, ErrBar, OkBar, msg,
} from "./ItemUI";
import { ItemPicker } from "./PurchaseNewView";
import {
  loadItemsSafe, formatTaka, fmtQty, toMilli,
  loadInvWarehousesSafe, loadAsmTemplatesSafe, loadAsmProductionsSafe,
  createAsmTemplate, updateAsmTemplate, deleteAsmTemplate,
  startAsmProduction, finishAsmProduction, transferAsmProduction, cancelAsmProduction,
  ASM_STATUS_META,
  type ApiItem, type ApiWarehouse, type AsmProduction, type AsmTemplate,
} from "../_data/api";

/*
  Assembly v2 — Templates · Production pipeline · Finished goods.
  Architecture: RADIAN_ASSEMBLY_MODULE_ARCHITECTURE.md (redesign 23 Jul 2026).

  DEC-ASM-011 template = standalone name+photo+components, NEVER touches stock.
  DEC-ASM-012 start moves components Shop → Assembly floor (warn on shortage).
  DEC-ASM-015 wasted qty entered on the finish form → auto WASTAGE.
  DEC-ASM-016 quick build = start+finish in one save.
  UI text ENGLISH ONLY (locked rule).
*/

const chip = (s: AsmProduction["status"]) => {
  const m = ASM_STATUS_META[s];
  return (
    <span className="text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap"
      style={{ background: m.bg, color: m.colour }}>{m.label}</span>
  );
};

function useAsmBase() {
  const [allItems, setAllItems] = useState<ApiItem[]>([]);
  const [whs, setWhs] = useState<ApiWarehouse[]>([]);
  const [isDemo, setIsDemo] = useState(false);

  async function load() {
    const w = await loadInvWarehousesSafe();
    setWhs(w.rows);
    // §১০.৪ — API down/empty is never a dead screen: demo items with the badge
    const it = await loadItemsSafe();
    setAllItems(it.items);
    setIsDemo(w.isDemo || it.isDemo);
  }
  useEffect(() => { load(); }, []);

  /** what a template may contain: any active, stock-tracked, physical item */
  const componentItems = useMemo(
    () => allItems.filter((i) => i.isActive && i.isStockTracked && i.itemType !== "SERVICE"),
    [allItems],
  );
  /** where finished goods may land: "Made in advance" items (DEC-ASM-011 transfer) */
  const targetItems = useMemo(
    () => allItems.filter((i) => i.isActive && i.isStockTracked && i.assemblyMode === "MAKE_TO_STOCK"),
    [allItems],
  );
  return { whs, isDemo, componentItems, targetItems, reload: load };
}

function WhPills({ whs, value, onChange, hideCodes }: {
  whs: ApiWarehouse[]; value: string; onChange: (id: string) => void; hideCodes?: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {whs.filter((w) => !hideCodes?.includes(w.code)).map((w) => (
        <button key={w.id} type="button" onClick={() => onChange(w.id)}
          className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border transition-colors"
          style={value === w.id
            ? { background: ACCENT, color: "#fff", borderColor: ACCENT }
            : { background: "#fff", color: "#dfd2e4", borderColor: "#3d314a" }}>
          {w.name}
        </button>
      ))}
    </div>
  );
}

/* ================================================================ TEMPLATES */

type TplLine = {
  key: number;
  item: { id: string; sku: string; name: string; imageUrl?: string | null; unit?: { shortCode: string } | null };
  qty: string;
};
let k = 1;

function TemplateEditor({ tpl, componentItems, onClose, onDone }: {
  tpl: AsmTemplate | null;
  componentItems: ApiItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(tpl?.name ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(tpl?.imageUrl ?? null);
  const [note, setNote] = useState(tpl?.note ?? "");
  const [lines, setLines] = useState<TplLine[]>(
    tpl?.lines.map((l) => ({
      key: k++,
      item: { id: l.componentItem.id, sku: l.componentItem.sku, name: l.componentItem.name, imageUrl: l.componentItem.imageUrl, unit: l.componentItem.unit ? { shortCode: l.componentItem.unit.shortCode } : null },
      qty: fmtQty(l.qtyMilli),
    })) ?? [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const valid = lines.filter((l) => toMilli(l.qty) > 0);

  function addPicked(picked: { item: ApiItem; qty: number }[]) {
    setPickerOpen(false);
    setLines((prev) => {
      const next = [...prev];
      for (const p of picked) {
        const hit = next.find((l) => l.item.id === p.item.id);
        if (hit) continue; // already on the template — qty is edited on the line
        next.push({
          key: k++,
          item: { id: p.item.id, sku: p.item.sku, name: p.item.name, imageUrl: p.item.imageUrl, unit: p.item.unit ? { shortCode: p.item.unit.shortCode } : null },
          qty: String(p.qty),
        });
      }
      return next;
    });
  }

  async function save() {
    if (!name.trim() || !valid.length) return;
    setBusy(true); setErr("");
    try {
      const body = {
        name: name.trim(), imageUrl, note: note || null,
        lines: valid.map((l) => ({ componentItemId: l.item.id, qtyMilli: toMilli(l.qty) })),
      };
      if (tpl) await updateAsmTemplate(tpl.id, body);
      else await createAsmTemplate(body);
      onDone(); onClose();
    } catch (e) { setErr(msg(e, "Could not save the template")); setBusy(false); }
  }

  return (
    <Modal title={tpl ? `Edit template — ${tpl.name}` : "New template"} onClose={onClose}
      onSave={save} saveLabel={tpl ? "Save changes" : "Save template"} busy={busy}
      canSave={!!name.trim() && valid.length > 0} wide>
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      <div className="flex gap-4 mb-3">
        <ItemPhotoBox item={{ sku: name || "TPL", name: name || "Template", imageUrl }} onImage={setImageUrl} size={96} hint={false} />
        <div className="flex-1">
          <Field label="Template name" required>
            <input className="ipt w-full" placeholder="e.g. Romantic Bouquet" autoFocus
              value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Note">
            <input className="ipt w-full" placeholder="optional" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </div>
      <Field label="Inside ONE piece" required>
        {lines.length > 0 && (
          <div className="grid grid-cols-[36px_minmax(170px,1fr)_100px_32px] gap-2 mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-body-soft">
            <span /><span>Component</span><span>Qty</span><span />
          </div>
        )}
        {lines.map((l) => (
          <div key={l.key} className="grid grid-cols-[36px_minmax(170px,1fr)_100px_32px] gap-2 items-center mb-2">
            <ItemThumb item={l.item} size={32} />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-body truncate">{l.item.name}</span>
              <span className="block text-[11.5px] text-body-soft">{l.item.sku}{l.item.unit ? ` · ${l.item.unit.shortCode}` : ""}</span>
            </span>
            <input className="ipt" inputMode="decimal" placeholder="12" value={l.qty}
              onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x)))} />
            <button type="button" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
              className="text-body-soft hover:text-purple text-[16px]">×</button>
          </div>
        ))}
        <button type="button" onClick={() => setPickerOpen(true)}
          className="text-[13px] font-medium px-3.5 py-2 rounded-[10px] border border-lavender-deep text-purple hover:border-orchid inline-flex items-center gap-1.5">
          <Icon name="plus" size={12} /> Add components
        </button>
      </Field>
      {pickerOpen && (
        <ItemPicker items={componentItems} onDone={addPicked} onClose={() => setPickerOpen(false)} />
      )}
    </Modal>
  );
}

export function AsmTemplatesView() {
  const { isDemo, componentItems, reload } = useAsmBase();
  const [rows, setRows] = useState<AsmTemplate[]>([]);
  const [tplDemo, setTplDemo] = useState(false);
  const [editing, setEditing] = useState<AsmTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    const r = await loadAsmTemplatesSafe();
    setRows(r.rows); setTplDemo(r.isDemo);
  }
  useEffect(() => { load(); }, []);

  async function remove(t: AsmTemplate) {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    try { await deleteAsmTemplate(t.id); load(); }
    catch (e) { setErr(msg(e, "Could not delete")); }
  }

  const ROW = "grid grid-cols-[44px_minmax(180px,1.4fr)_1fr_110px_110px_150px] gap-3 items-center px-4 py-3";
  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Assembly"
        title="Templates"
        blurb="The designs — name, photo, and what goes inside one piece. Nothing here touches stock (DEC-ASM-011); stock is checked the moment a template goes into production."
        right={
          <button onClick={() => setCreating(true)}
            className="text-white text-[13px] font-medium px-4 py-2.5 rounded-[10px] inline-flex items-center gap-2"
            style={{ background: ACCENT }}>
            <Icon name="plus" size={13} /> New template
          </button>
        }
      />
      {(tplDemo || isDemo) && <DemoBar what="sample templates" onRetry={() => { load(); reload(); }} />}
      {err && <ErrBar text={err} onClose={() => setErr("")} />}

      <DataTable head={
        <div className={ROW + " text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95"}>
          <span /><span>Template</span><span>Inside one piece</span>
          <span className="text-right">Est. cost</span><span className="text-right">Runs</span><span />
        </div>
      }>
        {rows.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-body-soft">
            No templates yet — design your first one with “New template”.
          </div>
        )}
        {rows.map((t) => (
          <div key={t.id}>
            <div className={ROW}>
              <ItemThumb item={{ sku: t.name, name: t.name, imageUrl: t.imageUrl }} size={38} />
              <span className="min-w-0">
                <button onClick={() => setOpen(open === t.id ? null : t.id)}
                  className="block text-left text-[13.5px] font-semibold text-purple hover:underline truncate">{t.name}</button>
                <span className="block text-[12px] text-body-soft">{t.note ?? `${t.lines.length} components`}</span>
              </span>
              <span className="text-[12.5px] text-body-soft min-w-0 truncate">
                {t.lines.map((l) => `${l.componentItem.name} ×${fmtQty(l.qtyMilli)}`).join(", ")}
              </span>
              <span className="text-right text-[13px] font-medium text-body">{formatTaka(t.estCostPaisa ?? 0)}</span>
              <span className="text-right text-[13px] text-body">{t._count?.productions ?? 0}</span>
              <span className="flex gap-2 justify-end">
                <Link href={`/assembly/pipeline?template=${t.id}`}
                  className="text-white text-[12px] font-medium px-3 py-1.5 rounded-[8px]" style={{ background: ACCENT }}>
                  Produce
                </Link>
                <button onClick={() => setEditing(t)}
                  className="text-[12px] font-medium px-2.5 py-1.5 rounded-[8px] border border-lavender-deep text-purple hover:border-orchid">
                  Edit
                </button>
                <button onClick={() => remove(t)} className="text-body-soft hover:text-[#e1837a] px-1" title="Delete">
                  <Icon name="trash" size={14} />
                </button>
              </span>
            </div>
            {open === t.id && (
              <div className="px-4 pb-3">
                {t.lines.map((l) => (
                  <div key={l.id} className="grid grid-cols-[36px_minmax(160px,1fr)_120px_120px] gap-3 items-center bg-lavender/20 rounded-[8px] px-3 py-2 mb-1 text-[12.5px]">
                    <ItemThumb item={l.componentItem} size={28} />
                    <span className="text-body truncate">{l.componentItem.name} <span className="text-body-soft">({l.componentItem.sku})</span></span>
                    <span className="text-right text-body">{fmtQty(l.qtyMilli)} {l.componentItem.unit?.shortCode ?? ""}</span>
                    <span className="text-right text-body-soft">{formatTaka(Math.round((l.qtyMilli * (l.unitCostPaisa ?? 0)) / 1000))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </DataTable>

      {(creating || editing) && (
        <TemplateEditor tpl={editing} componentItems={componentItems}
          onClose={() => { setCreating(false); setEditing(null); }} onDone={load} />
      )}
    </div>
  );
}

/* ================================================================= PIPELINE
   Owner (23 Jul): stage-আকারে — step 1 template+pieces, step 2 assign, then
   start/finish times and wastage each live as stages on the production itself. */

/** value for <input type="datetime-local"> — local, minute precision */
const localDT = (d = new Date()) => {
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

const dt = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + ", " +
      new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "\u2014";

type StageState = "done" | "active" | "pending" | "cancelled";

const STAGE_TONE: Record<StageState, { bg: string; border: string; head: string; circle: string }> = {
  done:      { bg: "#1e3226", border: "#2f4c3b", head: "#0e7a3d", circle: "#0e7a3d" },
  active:    { bg: "#192638", border: "#283b53", head: "#2563a8", circle: "#2563a8" },
  pending:   { bg: "#27232c", border: "#3e3446", head: "#8d7a97", circle: "#3d3743" },
  cancelled: { bg: "#3a1b17", border: "#532d28", head: "#c0392b", circle: "#c0392b" },
};

function StageCard({ n, state, title, children }: {
  n: number; state: StageState; title: string; children: React.ReactNode;
}) {
  const t = STAGE_TONE[state];
  return (
    <div className="relative rounded-[14px] border px-3.5 py-3 min-w-0" style={{ background: t.bg, borderColor: t.border }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-[24px] h-[24px] rounded-full grid place-items-center text-white text-[12px] font-bold shrink-0"
          style={{ background: t.circle }}>
          {state === "done" ? "\u2713" : n}
        </span>
        <b className="text-[13px] truncate" style={{ color: t.head }}>{title}</b>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

const SRow = ({ l, v, strong, colour }: { l: string; v: React.ReactNode; strong?: boolean; colour?: string }) => (
  <div className="flex items-baseline justify-between gap-2 text-[12px]">
    <span className="text-body-soft shrink-0">{l}</span>
    <span className={"text-right min-w-0 " + (strong ? "font-semibold" : "")} style={{ color: colour ?? "#dfd2e4" }}>{v}</span>
  </div>
);

/** the production\u2019s life, stage by stage \u2014 owner\u2019s spec (23 Jul):
 *  template \u2192 assigned \u2192 start/end + wastage (which items, how many) \u2192 transfer */
function StageTimeline({ p }: { p: AsmProduction }) {
  const finished = p.status === "FINISHED" || p.status === "TRANSFERRED";
  const transferred = p.status === "TRANSFERRED";
  const cancelled = p.status === "CANCELLED";
  const wastedLines = p.lines.filter((l) => l.wastedQtyMilli > 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 mb-2">
      <StageCard n={1} state="done" title="Template">
        <SRow l="Design" v={p.templateName} strong />
        <SRow l="Planned" v={`${fmtQty(p.qtyMilli)} pc`} />
        {p.note && <SRow l="Note" v={p.note} />}
      </StageCard>

      <StageCard n={2} state={cancelled ? "cancelled" : "done"} title="Assigned & started">
        <SRow l="Who" v={p.assignedTo ?? p.actor ?? "\u2014"} strong />
        <SRow l="Started" v={dt(p.startedAt)} />
        {cancelled && <SRow l="Status" v="Cancelled \u2014 stock returned" colour="#c0392b" strong />}
      </StageCard>

      <StageCard n={3} state={cancelled ? "pending" : finished ? "done" : "active"} title="Finished & wastage">
        {finished ? (
          <>
            <SRow l="Ended" v={dt(p.finishedAt)} />
            <SRow l="Took" v={p.durationMin ? `${p.durationMin} min` : "\u2014"} />
            <SRow l="Made" v={`${fmtQty(p.finishedQtyMilli)} pc \u00b7 ${formatTaka(p.totalUsedValuePaisa)}`} strong />
            {wastedLines.length === 0 ? (
              <SRow l="Wasted" v="nothing" colour="#0e7a3d" />
            ) : (
              <>
                {wastedLines.map((l) => (
                  <SRow key={l.id} l={l.componentItem.name}
                    v={`\u00d7${fmtQty(l.wastedQtyMilli)} \u00b7 ${formatTaka(l.wastedValuePaisa)}`}
                    colour="#c0392b" />
                ))}
                <SRow l="Wasted total" v={formatTaka(p.totalWastedValuePaisa)} colour="#c0392b" strong />
              </>
            )}
          </>
        ) : (
          <SRow l="Now" v={cancelled ? "\u2014" : "on the Assembly floor\u2026"} colour="#2563a8" />
        )}
      </StageCard>

      <StageCard n={4} state={transferred ? "done" : finished ? "active" : "pending"} title="Transferred to stock">
        {transferred ? (
          <>
            <SRow l="Item" v={p.targetItem?.name ?? "\u2014"} strong />
            <SRow l="When" v={dt(p.transferredAt)} />
            <SRow l="Cost" v={`${formatTaka(p.unitCostPaisa)}/pc`} />
          </>
        ) : finished ? (
          <SRow l="Waiting" v={<Link href="/assembly/finished" className="underline font-semibold" style={{ color: "#f7a96e" }}>pick the item \u2192</Link>} />
        ) : (
          <SRow l="\u2014" v="after finishing" />
        )}
      </StageCard>
    </div>
  );
}

export function AsmPipelineView() {
  const { whs, isDemo, reload } = useAsmBase();
  const [templates, setTemplates] = useState<AsmTemplate[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [templateId, setTemplateId] = useState(
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("template") ?? ""
      : "",
  );
  const [qty, setQty] = useState("1");
  const [sourceWhId, setSourceWhId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [note, setNote] = useState("");
  /** "Already made" = quick build (DEC-ASM-016): everything entered now */
  const [already, setAlready] = useState(false);
  const [startAt, setStartAt] = useState(localDT());
  const [endAt, setEndAt] = useState(localDT());
  const [finishedQty, setFinishedQty] = useState("");
  const [used, setUsed] = useState<Record<string, string>>({});
  const [wasted, setWasted] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [rows, setRows] = useState<AsmProduction[]>([]);
  const [listDemo, setListDemo] = useState(false);
  const [finishing, setFinishing] = useState<AsmProduction | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function loadAll() {
    const [t, p] = await Promise.all([loadAsmTemplatesSafe(), loadAsmProductionsSafe()]);
    setTemplates(t.rows);
    setRows(p.rows);
    setListDemo(t.isDemo || p.isDemo);
  }
  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (!sourceWhId && whs.length) {
      const shop = whs.find((w) => w.code === "SHOP") ?? whs[0];
      setSourceWhId(shop.id);
    }
  }, [whs, sourceWhId]);

  const tpl = templates.find((t) => t.id === templateId) ?? null;
  const qtyN = Math.max(parseInt(qty, 10) || 0, 0);
  const tplOptions = templates
    .filter((t) => t.isActive)
    .map((t) => ({ id: t.id, label: t.name, hint: `${t.lines.length} components`, imageUrl: t.imageUrl ?? null, tintSeed: t.name }));
  const estCost = tpl ? (tpl.estCostPaisa ?? 0) * qtyN : 0;

  const minutes = (() => {
    const a = new Date(startAt).getTime();
    const b = new Date(endAt).getTime();
    return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round((b - a) / 60000) : 0;
  })();

  /** step-3 material rows (already-made only) */
  const matRows = (tpl?.lines ?? []).map((l) => {
    const neededMilli = l.qtyMilli * qtyN;
    const u = used[l.componentItemId];
    const w = wasted[l.componentItemId];
    const usedMilli = u !== undefined && u !== "" ? toMilli(u) : neededMilli;
    const wastedMilli = w !== undefined && w !== "" ? toMilli(w) : 0;
    return {
      l, neededMilli, usedMilli, wastedMilli,
      wasteValue: Math.round((wastedMilli * (l.unitCostPaisa ?? 0)) / 1000),
    };
  });
  const wasteTotal = matRows.reduce((s, r) => s + r.wasteValue, 0);

  function resetForm() {
    setStep(1); setTemplateId(""); setQty("1"); setAssignedTo(""); setNote("");
    setAlready(false); setStartAt(localDT()); setEndAt(localDT());
    setFinishedQty(""); setUsed({}); setWasted({});
  }

  async function submit() {
    if (!tpl || qtyN <= 0) return;
    setBusy(true); setErr(""); setOk("");
    try {
      const doc = await startAsmProduction({
        templateId: tpl.id,
        qtyMilli: qtyN * 1000,
        assignedTo: assignedTo.trim() || undefined,
        sourceWarehouseId: sourceWhId || undefined,
        startedAt: startAt ? new Date(startAt).toISOString() : undefined,
        note: note || undefined,
        ...(already
          ? {
              quick: {
                finishedQtyMilli: toMilli(finishedQty || qty),
                finishedAt: endAt ? new Date(endAt).toISOString() : undefined,
                lines: matRows.map((r) => ({
                  componentItemId: r.l.componentItemId,
                  usedQtyMilli: r.usedMilli,
                  wastedQtyMilli: r.wastedMilli,
                })),
              },
            }
          : {}),
      });
      const short = doc.shortages ?? [];
      setOk(
        `${doc.productionNo} ${already ? "recorded" : "started"} — ${doc.templateName} ×${qtyN}.` +
        (short.length ? ` ⚠ Short on: ${short.map((s) => `${s.name} (need ${fmtQty(s.needMilli)}, have ${fmtQty(s.haveMilli)})`).join(", ")}.` : ""),
      );
      resetForm();
      loadAll();
    } catch (e) { setErr(msg(e, "Could not save the production")); }
    finally { setBusy(false); }
  }

  async function cancel(p: AsmProduction) {
    if (!window.confirm(`Cancel ${p.productionNo}? Picked components go back to the shelf.`)) return;
    try { await cancelAsmProduction(p.id); loadAll(); }
    catch (e) { setErr(msg(e, "Could not cancel")); }
  }

  const steps: { n: 1 | 2 | 3; label: string; show: boolean }[] = [
    { n: 1, label: "Template & pieces", show: true },
    { n: 2, label: "Assign & time", show: true },
    { n: 3, label: "Materials & wastage", show: already },
  ];

  const NextBtn = ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled || busy}
      className="text-white text-[13px] font-medium px-5 py-2.5 rounded-[10px] disabled:opacity-40"
      style={{ background: ACCENT }}>
      {busy ? "Saving…" : label}
    </button>
  );

  const LROW = "grid grid-cols-[110px_44px_minmax(150px,1.2fr)_90px_150px_120px_140px_130px] gap-3 items-center px-4 py-3";
  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Assembly"
        title="Production pipeline"
        blurb="Stage by stage: what & how many → who & when → (if already made) materials and wastage. Components move to the Assembly floor; shortages warn, never block."
        right={
          <Link href="/assembly/templates"
            className="text-[13px] font-medium px-3.5 py-2.5 rounded-[10px] border border-lavender-deep text-purple hover:border-orchid bg-white">
            Templates
          </Link>
        }
      />
      {(isDemo || listDemo) && <DemoBar what="sample productions" onRetry={() => { loadAll(); reload(); }} />}
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-5 mb-6">
        {/* stepper head */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          {steps.filter((s) => s.show).map((s, i, arr) => (
            <span key={s.n} className="flex items-center gap-3">
              <button type="button" onClick={() => s.n < step && setStep(s.n)}
                className="flex items-center gap-2" style={{ cursor: s.n < step ? "pointer" : "default" }}>
                <span className="w-[26px] h-[26px] rounded-full grid place-items-center text-[12.5px] font-bold"
                  style={s.n === step
                    ? { background: ACCENT, color: "#fff" }
                    : s.n < step
                      ? { background: "#0e7a3d", color: "#fff" }
                      : { background: "#2b2232", color: "#b0a3b7" }}>
                  {s.n < step ? "✓" : s.n}
                </span>
                <b className="text-[13px]" style={{ color: s.n === step ? ACCENT : s.n < step ? "#76efab" : "#8d7a97" }}>{s.label}</b>
              </button>
              {i < arr.length - 1 && <span className="w-10 h-px" style={{ background: "#2c2236" }} />}
            </span>
          ))}
        </div>

        {/* ------------------------------------------------ step 1 — what */}
        {step === 1 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(260px,1.6fr)_110px_auto] gap-4">
              <Field label="Template" required>
                <QuickSelect value={templateId} options={tplOptions} placeholder="Pick a template…"
                  onChange={setTemplateId} allowClear={false} />
              </Field>
              <Field label="Pieces" required>
                <input className="ipt" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
              </Field>
              <Field label="Components from">
                <WhPills whs={whs} value={sourceWhId} onChange={setSourceWhId} hideCodes={["ASSEMBLY"]} />
              </Field>
            </div>
            {tpl && qtyN > 0 && (
              <div className="rounded-[12px] border border-lavender-deep p-3.5 mb-4" style={{ background: "#271a34" }}>
                <div className="flex items-center gap-3 mb-2">
                  <ItemThumb item={{ sku: tpl.name, name: tpl.name, imageUrl: tpl.imageUrl }} size={34} />
                  <b className="text-[13.5px] text-body">Will pull for {qtyN} × {tpl.name}</b>
                  <span className="ml-auto text-[12.5px] text-body-soft">est. {formatTaka(estCost)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tpl.lines.map((l) => (
                    <span key={l.id} className="text-[12px] px-2.5 py-1 rounded-full bg-white border border-lavender-deep text-body">
                      {l.componentItem.name} × {fmtQty(l.qtyMilli * qtyN)} {l.componentItem.unit?.shortCode ?? ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <NextBtn label="Next: assign →" onClick={() => setStep(2)} disabled={!tpl || qtyN <= 0} />
            </div>
          </>
        )}

        {/* ------------------------------------------- step 2 — who & when */}
        {step === 2 && tpl && (
          <>
            <div className="flex items-center gap-3 mb-4 rounded-[10px] px-3.5 py-2.5" style={{ background: "#2e1a38" }}>
              <ItemThumb item={{ sku: tpl.name, name: tpl.name, imageUrl: tpl.imageUrl }} size={30} />
              <b className="text-[13px] text-body">{tpl.name} × {qtyN}</b>
              <span className="text-[12.5px] text-body-soft">est. {formatTaka(estCost)}</span>
              <button onClick={() => setStep(1)} className="ml-auto text-[12.5px] font-medium underline text-purple">change</button>
            </div>

            <Field label="Is it built yet?" required>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {[
                  { v: false, t: "Starting now", d: "Components move to the floor; end time & wastage are recorded at Finish." },
                  { v: true, t: "Already made", d: "Enter start, end, and wastage together — one save records it all." },
                ].map((o) => (
                  <button key={String(o.v)} type="button" onClick={() => setAlready(o.v)}
                    className="text-left rounded-[12px] border px-4 py-3 transition-all"
                    style={already === o.v
                      ? { borderColor: ACCENT, background: "#2e1a38", boxShadow: `0 0 0 2px ${ACCENT}22` }
                      : { borderColor: "#3d314a", background: "#fff" }}>
                    <b className="block text-[13px]" style={{ color: already === o.v ? ACCENT : "#dfd2e4" }}>{o.t}</b>
                    <span className="block text-[12px] text-body-soft">{o.d}</span>
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Assigned to" hint="who is building it">
                <input className="ipt w-full" placeholder="e.g. Rifat" autoFocus
                  value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
              </Field>
              <Field label="Start time" required>
                <input type="datetime-local" className="ipt w-full" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              </Field>
              {already ? (
                <Field label="End time" required hint={minutes > 0 ? `took ${minutes} min` : undefined}>
                  <input type="datetime-local" className="ipt w-full" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                </Field>
              ) : (
                <Field label="Note">
                  <input className="ipt w-full" placeholder="optional" value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
              )}
            </div>
            {already && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Pieces completed" required>
                  <input className="ipt w-full" inputMode="decimal" placeholder={qty}
                    value={finishedQty} onChange={(e) => setFinishedQty(e.target.value)} />
                </Field>
                <Field label="Note">
                  <input className="ipt w-full" placeholder="optional" value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
              </div>
            )}

            <div className="flex justify-between items-center mt-1">
              <button onClick={() => setStep(1)}
                className="border border-lavender-deep bg-white text-purple text-[13px] font-medium px-4 py-2.5 rounded-[10px]">← Back</button>
              {already
                ? <NextBtn label="Next: materials & wastage →" onClick={() => setStep(3)} />
                : <NextBtn label={listDemo ? "Demo — refresh for real data" : "Start production"}
                    onClick={submit} disabled={listDemo} />}
            </div>
          </>
        )}

        {/* ------------------------------- step 3 — materials & wastage (already-made) */}
        {step === 3 && tpl && (
          <>
            <div className="flex items-center gap-3 mb-4 rounded-[10px] px-3.5 py-2.5" style={{ background: "#2e1a38" }}>
              <ItemThumb item={{ sku: tpl.name, name: tpl.name, imageUrl: tpl.imageUrl }} size={30} />
              <b className="text-[13px] text-body">{tpl.name} × {qtyN}</b>
              <span className="text-[12.5px] text-body-soft">
                {assignedTo || "—"} · {minutes > 0 ? `${minutes} min` : "time set"}
              </span>
              <button onClick={() => setStep(2)} className="ml-auto text-[12.5px] font-medium underline text-purple">change</button>
            </div>

            <div className="grid grid-cols-[40px_minmax(160px,1.3fr)_110px_110px_110px_110px] gap-2.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-body-soft">
              <span /><span>Component</span><span className="text-right">Template says</span>
              <span>Actually used</span><span>Wasted</span><span className="text-right">Waste ৳</span>
            </div>
            <div className="divide-y divide-lavender-deep mb-3">
              {matRows.map((r) => (
                <div key={r.l.id} className="grid grid-cols-[40px_minmax(160px,1.3fr)_110px_110px_110px_110px] gap-2.5 items-center py-2">
                  <ItemThumb item={r.l.componentItem} size={34} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-body truncate">{r.l.componentItem.name}</span>
                    <span className="block text-[11.5px] text-body-soft">{r.l.componentItem.sku}</span>
                  </span>
                  <span className="text-right text-[13px] text-body">{fmtQty(r.neededMilli)} {r.l.componentItem.unit?.shortCode ?? ""}</span>
                  <input className="ipt" inputMode="decimal" placeholder={fmtQty(r.neededMilli)}
                    value={used[r.l.componentItemId] ?? ""}
                    onChange={(e) => setUsed({ ...used, [r.l.componentItemId]: e.target.value })} />
                  <input className="ipt" inputMode="decimal" placeholder="0"
                    value={wasted[r.l.componentItemId] ?? ""}
                    onChange={(e) => setWasted({ ...wasted, [r.l.componentItemId]: e.target.value })} />
                  <span className="text-right text-[12.5px] font-medium" style={{ color: r.wasteValue > 0 ? "#e1837a" : "#b0a3b7" }}>
                    {r.wasteValue > 0 ? formatTaka(r.wasteValue) : "—"}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center">
              <button onClick={() => setStep(2)}
                className="border border-lavender-deep bg-white text-purple text-[13px] font-medium px-4 py-2.5 rounded-[10px]">← Back</button>
              <span className="flex items-center gap-4">
                <span className="text-[13px] text-body">
                  Wasted: <b style={{ color: wasteTotal > 0 ? "#e1837a" : "#dfd2e4" }}>{formatTaka(wasteTotal)}</b>
                </span>
                <NextBtn label={listDemo ? "Demo — refresh for real data" : "Record build"}
                  onClick={submit} disabled={listDemo} />
              </span>
            </div>
          </>
        )}
      </div>

      <h3 className="font-display text-[17px] text-purple mb-2.5">All productions</h3>
      <DataTable head={
        <div className={LROW + " text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95"}>
          <span>No.</span><span /><span>Template</span><span className="text-right">Qty</span>
          <span>Status</span><span className="text-right">Cost</span>
          <span className="text-right">Who · time</span><span />
        </div>
      }>
        {rows.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-body-soft">No productions yet — start one above.</div>
        )}
        {rows.map((p) => (
          <div key={p.id}>
            <div className={LROW + (p.status === "FINISHED" ? " bg-[#3b2b17]/40" : "")}>
              <button onClick={() => setOpen(open === p.id ? null : p.id)}
                className="text-left text-[13px] font-semibold text-purple hover:underline">{p.productionNo}</button>
              <ItemThumb item={{ sku: p.templateName, name: p.templateName, imageUrl: p.template?.imageUrl }} size={34} />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-body truncate">{p.templateName}</span>
                <span className="block text-[11.5px] text-body-soft">
                  {new Date(p.startedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
              </span>
              <span className="text-right text-[13px] font-semibold text-body">{fmtQty(p.finishedQtyMilli || p.qtyMilli)}</span>
              <span>{chip(p.status)}</span>
              <span className="text-right text-[13px] text-body">{p.totalUsedValuePaisa ? formatTaka(p.totalUsedValuePaisa) : "—"}</span>
              <span className="text-right text-[12px] text-body-soft">
                {p.assignedTo ?? p.actor ?? "—"}{p.durationMin ? ` · ${p.durationMin} min` : ""}
              </span>
              <span className="flex gap-2 justify-end">
                {p.status === "IN_PROGRESS" && (
                  <>
                    <button onClick={() => setFinishing(p)}
                      className="text-white text-[12px] font-medium px-3 py-1.5 rounded-[8px]" style={{ background: "#0e7a3d" }}>
                      Finish
                    </button>
                    <button onClick={() => cancel(p)}
                      className="text-[12px] font-medium px-2.5 py-1.5 rounded-[8px] border border-lavender-deep text-body-soft hover:text-[#e1837a]">
                      Cancel
                    </button>
                  </>
                )}
                {p.status === "FINISHED" && (
                  <Link href="/assembly/finished"
                    className="text-white text-[12px] font-medium px-3 py-1.5 rounded-[8px]" style={{ background: "#b45309" }}>
                    Transfer
                  </Link>
                )}
              </span>
            </div>
            {open === p.id && (
              <div className="px-4 pb-3">
                <StageTimeline p={p} />
              </div>
            )}
          </div>
        ))}
      </DataTable>

      {finishing && (
        <FinishModal p={finishing} onClose={() => setFinishing(null)} onDone={loadAll} />
      )}
    </div>
  );
}

/** DEC-ASM-015 — the finish form: per line used + wasted; leftovers auto-return. */
function FinishModal({ p, onClose, onDone }: { p: AsmProduction; onClose: () => void; onDone: () => void }) {
  const [finishedQty, setFinishedQty] = useState(fmtQty(p.qtyMilli));
  const [endAt, setEndAt] = useState(localDT());
  const [used, setUsed] = useState<Record<string, string>>({});
  const [wasted, setWasted] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const rows = p.lines.map((l) => {
    const u = used[l.componentItemId];
    const w = wasted[l.componentItemId];
    const usedMilli = u !== undefined && u !== "" ? Math.min(toMilli(u), l.pickedQtyMilli) : l.pickedQtyMilli;
    const wastedMilli = w !== undefined && w !== "" ? Math.min(toMilli(w), l.pickedQtyMilli - usedMilli) : 0;
    return {
      ...l, usedMilli, wastedMilli,
      leftoverMilli: l.pickedQtyMilli - usedMilli - wastedMilli,
      wastedValue: Math.round((wastedMilli * l.unitCostPaisa) / 1000),
    };
  });
  const wastedTotal = rows.reduce((s, r) => s + r.wastedValue, 0);

  async function save() {
    const fin = toMilli(finishedQty);
    if (fin <= 0) return;
    setBusy(true); setErr("");
    try {
      await finishAsmProduction(p.id, {
        finishedQtyMilli: fin,
        finishedAt: endAt ? new Date(endAt).toISOString() : undefined,
        lines: rows.map((r) => ({ componentItemId: r.componentItemId, usedQtyMilli: r.usedMilli, wastedQtyMilli: r.wastedMilli })),
      });
      onDone(); onClose();
    } catch (e) { setErr(msg(e, "Could not finish the production")); setBusy(false); }
  }

  return (
    <Modal title={`Finish — ${p.productionNo} · ${p.templateName}`} onClose={onClose}
      onSave={save} saveLabel="Finish production" busy={busy} canSave={toMilli(finishedQty) > 0}>
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Pieces completed" required>
          <input className="ipt w-full" inputMode="decimal" value={finishedQty} onChange={(e) => setFinishedQty(e.target.value)} />
        </Field>
        <Field label="Ended at" hint={`started ${dt(p.startedAt)}`}>
          <input type="datetime-local" className="ipt w-full" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-[minmax(150px,1.2fr)_90px_100px_100px_90px] gap-2 mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-body-soft">
        <span>Component</span><span className="text-right">Picked</span><span>Used</span><span>Wasted</span><span className="text-right">Back</span>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[minmax(150px,1.2fr)_90px_100px_100px_90px] gap-2 items-center mb-1.5">
          <span className="text-[12.5px] text-body truncate">{r.componentItem.name}</span>
          <span className="text-right text-[12.5px] text-body-soft">{fmtQty(r.pickedQtyMilli)}</span>
          <input className="ipt" inputMode="decimal" placeholder={fmtQty(r.pickedQtyMilli)}
            value={used[r.componentItemId] ?? ""}
            onChange={(e) => setUsed({ ...used, [r.componentItemId]: e.target.value })} />
          <input className="ipt" inputMode="decimal" placeholder="0"
            value={wasted[r.componentItemId] ?? ""}
            onChange={(e) => setWasted({ ...wasted, [r.componentItemId]: e.target.value })} />
          <span className="text-right text-[12.5px]" style={{ color: r.leftoverMilli > 0 ? "#76efab" : "#b0a3b7" }}>
            {r.leftoverMilli > 0 ? fmtQty(r.leftoverMilli) : "—"}
          </span>
        </div>
      ))}
      <p className="text-[12.5px] mt-2 mb-0" style={{ color: wastedTotal > 0 ? "#e1837a" : "#dfd2e4" }}>
        Wasted {formatTaka(wastedTotal)} — auto-recorded as WASTAGE (DEC-ASM-015). Leftovers go back to the shelf on their own.
      </p>
    </Modal>
  );
}

/* ============================================================ FINISHED GOODS */

export function AsmFinishedView() {
  const { whs, isDemo, targetItems, reload } = useAsmBase();
  const [rows, setRows] = useState<AsmProduction[]>([]);
  const [done, setDone] = useState<AsmProduction[]>([]);
  const [listDemo, setListDemo] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [targets, setTargets] = useState<Record<string, ApiItem>>({});
  const [dests, setDests] = useState<Record<string, string>>({});
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  async function load() {
    const [f, t] = await Promise.all([
      loadAsmProductionsSafe("FINISHED"),
      loadAsmProductionsSafe("TRANSFERRED"),
    ]);
    setRows(f.rows); setDone(t.rows); setListDemo(f.isDemo);
  }
  useEffect(() => { load(); }, []);

  async function transfer(p: AsmProduction) {
    const target = targets[p.id];
    if (!target) return;
    setBusy(true); setErr(""); setOk("");
    try {
      const doc = await transferAsmProduction(p.id, {
        targetItemId: target.id,
        warehouseId: dests[p.id] || undefined,
      });
      setOk(`${doc.productionNo} transferred — ${fmtQty(doc.finishedQtyMilli)} pc now in stock as "${doc.targetItem?.name}".`);
      load();
    } catch (e) { setErr(msg(e, "Could not transfer")); }
    finally { setBusy(false); }
  }

  const shopFirst = whs.filter((w) => w.code !== "ASSEMBLY");
  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Assembly"
        title="Finished goods"
        blurb="Completed productions waiting to become sellable stock. Pick WHICH finished item they are (DEC-ASM-011) and transfer — the pieces enter that item's stock at their real production cost."
      />
      {(isDemo || listDemo) && <DemoBar what="sample finished goods" onRetry={() => { load(); reload(); }} />}
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      {rows.length === 0 && (
        <div className="rounded-[16px] border border-lavender-deep bg-white shadow-soft px-5 py-6 text-center text-[13px] text-body-soft mb-6">
          Nothing waiting. Finish a production on the <Link href="/assembly/pipeline" className="font-semibold underline text-purple">pipeline</Link> and it lands here.
        </div>
      )}
      {rows.map((p) => (
        <div key={p.id} className="bg-white border rounded-[16px] shadow-soft p-4 mb-3" style={{ borderColor: "#534128" }}>
          <div className="flex flex-wrap items-center gap-3">
            <ItemThumb item={{ sku: p.templateName, name: p.templateName, imageUrl: p.template?.imageUrl }} size={44} />
            <span className="min-w-0">
              <b className="block text-[14px] text-body">{p.templateName} × {fmtQty(p.finishedQtyMilli)}</b>
              <span className="block text-[12px] text-body-soft">
                {p.productionNo} · worth {formatTaka(p.totalUsedValuePaisa)} ({formatTaka(p.unitCostPaisa)}/pc)
                · by {p.assignedTo ?? p.actor ?? "—"}{p.durationMin ? ` in ${p.durationMin} min` : ""}
              </span>
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <button onClick={() => setPickingFor(p.id)}
                className="text-[13px] font-medium px-3.5 py-2 rounded-[10px] border border-lavender-deep bg-white text-purple hover:border-orchid inline-flex items-center gap-2">
                {targets[p.id]
                  ? <><ItemThumb item={targets[p.id]} size={24} /> {targets[p.id].name}</>
                  : "Which item is this? →"}
              </button>
              <WhPills whs={shopFirst} value={dests[p.id] ?? (shopFirst.find((w) => w.code === "SHOP")?.id ?? "")}
                onChange={(id) => setDests({ ...dests, [p.id]: id })} />
              <button onClick={() => transfer(p)} disabled={busy || !targets[p.id]}
                className="text-white text-[13px] font-medium px-4 py-2 rounded-[10px] disabled:opacity-40"
                style={{ background: "#b45309" }}>
                Transfer to stock
              </button>
            </span>
          </div>
        </div>
      ))}

      {pickingFor && (
        <ItemPicker items={targetItems} single title="Which finished item is this?"
          onDone={(picked) => {
            if (picked[0]) setTargets({ ...targets, [pickingFor]: picked[0].item });
            setPickingFor(null);
          }}
          onClose={() => setPickingFor(null)} />
      )}

      <h3 className="font-display text-[17px] text-purple mt-6 mb-2.5">Transferred</h3>
      <DataTable head={
        <div className="grid grid-cols-[110px_minmax(160px,1.3fr)_1fr_90px_120px_140px] gap-3 items-center px-4 py-3 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95">
          <span>No.</span><span>Template</span><span>Went into item</span>
          <span className="text-right">Qty</span><span className="text-right">Value</span><span className="text-right">When</span>
        </div>
      }>
        {done.length === 0 && <div className="px-4 py-6 text-[13px] text-body-soft">Nothing transferred yet.</div>}
        {done.map((p) => (
          <div key={p.id} className="grid grid-cols-[110px_minmax(160px,1.3fr)_1fr_90px_120px_140px] gap-3 items-center px-4 py-3">
            <span className="text-[13px] font-semibold text-purple">{p.productionNo}</span>
            <span className="text-[13px] text-body min-w-0 truncate">{p.templateName}</span>
            <span className="text-[12.5px] text-body min-w-0 truncate">{p.targetItem?.name ?? "—"}</span>
            <span className="text-right text-[13px] font-semibold text-body">{fmtQty(p.finishedQtyMilli)}</span>
            <span className="text-right text-[13px] text-body">{formatTaka(p.totalUsedValuePaisa)}</span>
            <span className="text-right text-[12px] text-body-soft">
              {p.transferredAt ? new Date(p.transferredAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
            </span>
          </div>
        ))}
      </DataTable>
    </div>
  );
}
