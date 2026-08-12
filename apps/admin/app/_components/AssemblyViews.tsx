"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, DemoBar, Kpi, DataTable, ItemThumb, Field, ErrBar, OkBar, msg } from "./ItemUI";
import {
  loadAsmOverviewSafe, loadAsmWastageSafe, loadInvWarehousesSafe,
  getInvSettings, patchInvSettings,
  formatTaka, fmtQty, ASM_STATUS_META,
  type ApiWarehouse, type AsmOverview, type AsmWastageReport, type InvSettings,
} from "../_data/api";

/*
  Assembly v2 — Overview · Wastage · Settings.
  Architecture: RADIAN_ASSEMBLY_MODULE_ARCHITECTURE.md (redesign 23 Jul 2026).
  Decision-first (§12): finished-awaiting-transfer and running work lead.
*/

/* ================================================================= OVERVIEW */

export function AssemblyOverview() {
  const [ov, setOv] = useState<AsmOverview | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  async function load() {
    const r = await loadAsmOverviewSafe();
    setOv(r.overview);
    setIsDemo(r.isDemo);
  }
  useEffect(() => { load(); }, []);

  const k = ov?.kpis;
  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Assembly"
        title="Assembly"
        blurb="Design once (Templates), produce daily (Pipeline), transfer to stock (Finished goods). Components sit visibly on the Assembly floor while work runs — double inventory is impossible (DEC-ASM-012)."
        right={
          <Link href="/assembly/pipeline"
            className="text-white text-[13px] font-medium px-4 py-2.5 rounded-[10px] inline-flex items-center gap-2"
            style={{ background: ACCENT }}>
            <Icon name="plus" size={13} /> Start production
          </Link>
        }
      />
      {isDemo && <DemoBar what="sample productions" onRetry={load} />}

      {/* decision-first: what needs the owner's hand NOW */}
      {ov && ov.finishedAwaiting.length > 0 && (
        <div className="rounded-[16px] border px-5 py-4 mb-5 shadow-soft" style={{ background: "#fff4e6", borderColor: "#f5ddba" }}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-[24px] h-[24px] rounded-[7px] grid place-items-center text-white" style={{ background: "#b45309" }}><Icon name="bolt" size={13} /></span>
            <b className="text-[14px]" style={{ color: "#8a5a10" }}>
              Finished — waiting to become stock ({ov.finishedAwaiting.length} · {formatTaka(ov.kpis.awaitingTransferValuePaisa)})
            </b>
          </div>
          {ov.finishedAwaiting.slice(0, 5).map((p) => (
            <Link key={p.id} href="/assembly/finished"
              className="flex items-center gap-3 bg-white/70 rounded-[10px] px-3.5 py-2.5 mb-1.5 hover:bg-white">
              <ItemThumb item={{ sku: p.templateName, name: p.templateName, imageUrl: p.template?.imageUrl }} size={30} />
              <span className="text-[13px] font-medium text-body flex-1 min-w-0 truncate">
                {p.templateName} × {fmtQty(p.finishedQtyMilli)}
              </span>
              <span className="text-[12.5px] text-body-soft">{formatTaka(p.totalUsedValuePaisa)}</span>
              <span className="text-[12px] font-semibold" style={{ color: "#b45309" }}>Transfer →</span>
            </Link>
          ))}
        </div>
      )}

      {ov?.noEntryToday && (
        <div className="rounded-[12px] border px-4 py-2.5 mb-4 flex items-center gap-3" style={{ background: "#e8f0fa", borderColor: "#c7dcf5" }}>
          <span className="text-[13px]" style={{ color: "#2563a8" }}>
            <b>No production entry today.</b> Built something? Log it while it's fresh.
          </span>
          <Link href="/assembly/pipeline" className="ml-auto text-[12.5px] font-semibold underline" style={{ color: "#2563a8" }}>
            Enter now
          </Link>
        </div>
      )}

      {k && (
        <Kpi items={[
          { l: "Running now", v: k.runningCount, c: "#2563a8", bg: "#e8f0fa", icon: "clock", href: "/assembly/pipeline" },
          { l: "Awaiting transfer", v: `${k.awaitingTransferCount} · ${formatTaka(k.awaitingTransferValuePaisa)}`, c: "#b45309", bg: "#fff4e6", icon: "box", href: "/assembly/finished" },
          { l: "Produced (month)", v: `${k.runsMonth} runs · ${formatTaka(k.producedMonthPaisa)}`, c: "#0e7a3d", bg: "#e8f7ef", icon: "cash" },
          { l: "Wasted (month)", v: formatTaka(k.wastedMonthPaisa), c: k.wastedMonthPaisa > 0 ? "#c0392b" : "#8d7a97", bg: "#fdecea", icon: "bolt", href: "/assembly/wastage" },
          { l: "Templates", v: k.templateCount, c: "#470066", bg: "#f5eafb", icon: "book", href: "/assembly/templates" },
        ]} />
      )}

      {/* running work */}
      {ov && ov.running.length > 0 && (
        <>
          <h3 className="font-display text-[17px] text-purple mb-2.5">On the Assembly floor now</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
            {ov.running.map((p) => (
              <Link key={p.id} href="/assembly/pipeline"
                className="bg-white border border-lavender-deep rounded-[14px] shadow-soft px-4 py-3 flex items-center gap-3 hover:border-purple/40">
                <ItemThumb item={{ sku: p.templateName, name: p.templateName, imageUrl: p.template?.imageUrl }} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-body truncate">{p.templateName} × {fmtQty(p.qtyMilli)}</span>
                  <span className="block text-[12px] text-body-soft">
                    {p.assignedTo ?? p.actor ?? "—"} · since {new Date(p.startedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
                <span className="text-[11px] font-semibold px-2 py-1 rounded-full"
                  style={{ background: ASM_STATUS_META.IN_PROGRESS.bg, color: ASM_STATUS_META.IN_PROGRESS.colour }}>
                  In progress
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* DEC-ASM-014 — who is building this month */}
      {ov && ov.byActor.length > 0 && (
        <>
          <h3 className="font-display text-[17px] text-purple mb-2.5">Who is building (this month)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
            {ov.byActor.map((a) => (
              <div key={a.who} className="bg-white border border-lavender-deep rounded-[14px] shadow-soft px-4 py-3 flex items-center gap-3">
                <span className="w-[38px] h-[38px] rounded-full grid place-items-center text-white text-[14px] font-bold shrink-0"
                  style={{ background: "linear-gradient(135deg,#470066,#cf43ea)" }}>
                  {a.who.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-body truncate">{a.who}</span>
                  <span className="block text-[12px] text-body-soft">
                    {a.runs} run(s) · {fmtQty(a.piecesMilli)} pcs{a.avgMinutes ? ` · avg ${a.avgMinutes} min` : ""}
                  </span>
                </span>
                <b className="text-[13.5px]" style={{ color: ACCENT }}>{formatTaka(a.costPaisa)}</b>
              </div>
            ))}
          </div>
        </>
      )}

      {/* most produced */}
      {ov && ov.topTemplates.length > 0 && (
        <>
          <h3 className="font-display text-[17px] text-purple mb-2.5">Most produced (this month)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
            {ov.topTemplates.map((t) => (
              <div key={t.templateId} className="bg-white border border-lavender-deep rounded-[14px] shadow-soft px-4 py-3 flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-body truncate">{t.name}</span>
                  <span className="block text-[12px] text-body-soft">{t.runs} run(s) · {fmtQty(t.piecesMilli)} pcs</span>
                </span>
                <b className="text-[14px]" style={{ color: ACCENT }}>{formatTaka(t.costPaisa)}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ================================================================== WASTAGE */

export function AsmWastageView() {
  const [report, setReport] = useState<AsmWastageReport | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [days, setDays] = useState(30);

  async function load(d = days) {
    const r = await loadAsmWastageSafe(d);
    setReport(r.report);
    setIsDemo(r.isDemo);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Assembly"
        title="Production wastage"
        blurb="What broke or spoiled WHILE building, in taka (DEC-ASM-015). Entered on the finish form, posted as real WASTAGE — it also appears in Inventory's money reports. Shelf wastage (rot in the fridge) stays on Inventory → Wastage & Gift."
      />
      {isDemo && <DemoBar what="sample wastage" onRetry={() => load()} />}

      <div className="flex items-center gap-2 mb-4">
        {([7, 30, 90] as const).map((d) => (
          <button key={d} onClick={() => setDays(d)}
            className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border transition-colors"
            style={days === d
              ? { background: ACCENT, color: "#fff", borderColor: ACCENT }
              : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
            {d} days
          </button>
        ))}
        <span className="ml-auto text-[13.5px] text-body">
          Total wasted: <b style={{ color: (report?.totalWastedPaisa ?? 0) > 0 ? "#c0392b" : "#5c4a6b" }}>{formatTaka(report?.totalWastedPaisa ?? 0)}</b>
        </span>
      </div>

      <h3 className="font-display text-[17px] text-purple mb-2.5">By component</h3>
      <DataTable head={
        <div className="grid grid-cols-[44px_minmax(180px,1.5fr)_1fr_120px_130px] gap-3 items-center px-4 py-3 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95">
          <span /><span>Component</span><span /><span className="text-right">Qty wasted</span><span className="text-right">Money lost</span>
        </div>
      }>
        {report && report.byComponent.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-body-soft">No production wastage in this window — good news.</div>
        )}
        {report?.byComponent.map((c) => (
          <div key={c.componentItemId} className="grid grid-cols-[44px_minmax(180px,1.5fr)_1fr_120px_130px] gap-3 items-center px-4 py-3">
            <ItemThumb item={{ sku: c.sku, name: c.name, imageUrl: c.imageUrl }} size={38} />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-body truncate">{c.name}</span>
              <span className="block text-[12px] text-body-soft">{c.sku}</span>
            </span>
            <span />
            <span className="text-right text-[13px] text-body">{fmtQty(c.qtyMilli)} {c.unitShort}</span>
            <span className="text-right text-[13.5px] font-semibold" style={{ color: "#c0392b" }}>{formatTaka(c.valuePaisa)}</span>
          </div>
        ))}
      </DataTable>

      <h3 className="font-display text-[17px] text-purple mt-6 mb-2.5">By production</h3>
      <DataTable head={
        <div className="grid grid-cols-[110px_minmax(160px,1.3fr)_1fr_120px_130px] gap-3 items-center px-4 py-3 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95">
          <span>No.</span><span>Template</span><span>Wasted lines</span>
          <span className="text-right">Who</span><span className="text-right">Money lost</span>
        </div>
      }>
        {report?.docs.map((p) => (
          <div key={p.id} className="grid grid-cols-[110px_minmax(160px,1.3fr)_1fr_120px_130px] gap-3 items-center px-4 py-3">
            <span className="text-[13px] font-semibold text-purple">{p.productionNo}</span>
            <span className="text-[13px] text-body min-w-0 truncate">{p.templateName}</span>
            <span className="text-[12.5px] text-body-soft min-w-0 truncate">
              {p.lines.filter((l) => l.wastedQtyMilli > 0).map((l) => `${l.componentItem.name} ×${fmtQty(l.wastedQtyMilli)}`).join(", ") || "—"}
            </span>
            <span className="text-right text-[12.5px] text-body-soft">{p.assignedTo ?? p.actor ?? "—"}</span>
            <span className="text-right text-[13.5px] font-semibold" style={{ color: "#c0392b" }}>{formatTaka(p.totalWastedValuePaisa)}</span>
          </div>
        ))}
      </DataTable>
    </div>
  );
}

/* ================================================================= SETTINGS */

export function AsmSettingsView() {
  const [settings, setSettings] = useState<InvSettings | null>(null);
  const [whs, setWhs] = useState<ApiWarehouse[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    const w = await loadInvWarehousesSafe();
    setWhs(w.rows);
    setIsDemo(w.isDemo);
    try { setSettings(await getInvSettings()); } catch { setSettings(null); }
  }
  useEffect(() => { load(); }, []);

  async function set(key: "defaultAssemblyComponentWarehouseId" | "defaultAssemblyFinishedWarehouseId", id: string) {
    setBusy(true); setErr(""); setOk("");
    try {
      const s = await patchInvSettings({ [key]: id });
      setSettings(s);
      setOk("Saved.");
    } catch (e) { setErr(msg(e, "Could not save")); }
    finally { setBusy(false); }
  }

  const Pills = ({ value, onPick }: { value: string | null | undefined; onPick: (id: string) => void }) => (
    <div className="flex flex-wrap gap-2">
      {whs.filter((w) => w.code !== "ASSEMBLY").map((w) => (
        <button key={w.id} disabled={busy} onClick={() => onPick(w.id)}
          className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border transition-colors disabled:opacity-50"
          style={value === w.id
            ? { background: ACCENT, color: "#fff", borderColor: ACCENT }
            : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
          {w.name}
        </button>
      ))}
    </div>
  );

  const floor = whs.find((w) => w.code === "ASSEMBLY");
  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Assembly"
        title="Assembly settings"
        blurb="Set once here — used across production."
      />
      {isDemo && <DemoBar what="warehouses" onRetry={load} />}
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-5 max-w-[640px]">
        <Field label="Components picked from (default)" hint="Where production pulls components — can still be changed per run">
          <Pills value={settings?.defaultAssemblyComponentWarehouseId ?? null}
            onPick={(id) => set("defaultAssemblyComponentWarehouseId", id)} />
        </Field>
        <Field label="Finished goods transfer to (default)" hint="Where transferred pieces land as sellable stock">
          <Pills value={settings?.defaultAssemblyFinishedWarehouseId ?? null}
            onPick={(id) => set("defaultAssemblyFinishedWarehouseId", id)} />
        </Field>
        <Field label="Assembly floor (WIP)" hint="Created automatically — components sit here while work runs.">
          <span className="text-[13px] text-body">
            {floor ? `${floor.name} (${floor.code})` : "Will be created on the first production run."}
          </span>
        </Field>
      </div>
    </div>
  );
}
