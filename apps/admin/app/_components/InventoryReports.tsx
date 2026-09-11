"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, DemoBar, Kpi, DataTable, ItemThumb, ErrBar, OkBar, msg } from "./ItemUI";
import {
  loadInvIssueReportSafe, loadInvValuationSafe, loadInvSettingsSafe, loadInvWarehousesSafe,
  loadInvStockSafe, patchInvSettings, formatTaka, fmtQty,
  type ApiWarehouse, type InvIssueReport, type InvSettings, type InvValuation,
} from "../_data/api";

/*
  Inventory — Reports + Settings.
  Architecture: RADIAN_INVENTORY_MODULE_ARCHITECTURE.md (locked 22 Jul 2026).

  Reports answer the owner's own question behind DEC-PUR-005/DEC-INV-005:
  "how much money was damaged" — wastage & gift money per day, and what the
  shelf is worth right now at AVCO.
*/

/* ================================================================= REPORTS */

const RANGES = [7, 30, 90] as const;

export function InvReportsView() {
  const [days, setDays] = useState<number>(30);
  const [report, setReport] = useState<InvIssueReport | null>(null);
  const [valuation, setValuation] = useState<InvValuation | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(d = days) {
    setLoading(true);
    try {
      const [r, v] = await Promise.all([loadInvIssueReportSafe(d), loadInvValuationSafe()]);
      setReport(r.report);
      setValuation(v.valuation);
      setIsDemo(r.isDemo || v.isDemo);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const maxDay = useMemo(
    () => Math.max(1, ...(report?.series ?? []).map((s) => s.wastagePaisa + s.giftPaisa)),
    [report],
  );
  const worstDay = useMemo(() => {
    const s = [...(report?.series ?? [])].sort(
      (a, b) => b.wastagePaisa + b.giftPaisa - (a.wastagePaisa + a.giftPaisa),
    )[0];
    return s && s.wastagePaisa + s.giftPaisa > 0 ? s : null;
  }, [report]);

  const topRows = (valuation?.rows ?? []).slice(0, 10);
  const maxValue = Math.max(1, ...topRows.map((r) => Math.abs(r.valuePaisa)));

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Inventory"
        title="Reports"
        right={
          <span className="flex gap-2">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setDays(r)}
                className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border transition-colors"
                style={days === r
                  ? { background: ACCENT, color: "#fff", borderColor: ACCENT }
                  : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
                {r} days
              </button>
            ))}
          </span>
        }
      />
      {isDemo && <DemoBar what="sample report" onRetry={() => load()} />}

      {report && valuation && (
        <Kpi items={[
          { l: `Wastage (${days}d)`, v: formatTaka(report.totalWastagePaisa), c: "#c0392b", bg: "#fdecea", icon: "bolt" },
          { l: `Given free (${days}d)`, v: formatTaka(report.totalGiftPaisa), c: "#cf43ea", bg: "#fbeafe", icon: "heart" },
          { l: "Stock value now (AVCO)", v: formatTaka(valuation.totalPaisa), c: "#470066", bg: "#f5eafb", icon: "box" },
          {
            l: "Worst day", c: "#b45309", bg: "#fff4e6", icon: "clock",
            v: worstDay
              ? `${new Date(worstDay.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${formatTaka(worstDay.wastagePaisa + worstDay.giftPaisa)}`
              : "—",
          },
        ]} />
      )}

      {/* daily write-off bars */}
      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-5 mb-5">
        <div className="flex items-center gap-3 mb-3">
          <b className="text-[14.5px] text-body">Write-offs per day</b>
          <span className="text-[12px] text-body-soft flex items-center gap-1.5">
            <span className="w-[10px] h-[10px] rounded-[3px]" style={{ background: "#c0392b" }} /> Wastage
          </span>
          <span className="text-[12px] text-body-soft flex items-center gap-1.5">
            <span className="w-[10px] h-[10px] rounded-[3px]" style={{ background: "#cf43ea" }} /> Gift
          </span>
          <Link href="/inventory/issue" className="ml-auto text-[12.5px] font-medium underline" style={{ color: ACCENT }}>
            Entries →
          </Link>
        </div>
        {loading && <div className="py-8 text-[13px] text-body-soft">Loading…</div>}
        {!loading && report && (
          <div className="flex items-end gap-[3px] h-[150px]">
            {report.series.map((s) => {
              const total = s.wastagePaisa + s.giftPaisa;
              const hW = Math.round((s.wastagePaisa / maxDay) * 140);
              const hG = Math.round((s.giftPaisa / maxDay) * 140);
              return (
                <div key={s.date} className="flex-1 min-w-[4px] flex flex-col justify-end items-stretch group relative" style={{ height: 150 }}>
                  <div className="hidden group-hover:block absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full bg-white border border-lavender-deep rounded-[8px] shadow-soft px-2.5 py-1.5 text-[11.5px] whitespace-nowrap z-10">
                    <b>{new Date(s.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</b>
                    {" · "}<span style={{ color: "#c0392b" }}>{formatTaka(s.wastagePaisa)}</span>
                    {s.giftPaisa > 0 && <> · <span style={{ color: "#cf43ea" }}>{formatTaka(s.giftPaisa)}</span></>}
                  </div>
                  <div style={{ height: hG, background: "#cf43ea" }} className={hG > 0 ? "rounded-t-[3px]" : ""} />
                  <div style={{ height: hW, background: "#c0392b" }} className={hG === 0 && hW > 0 ? "rounded-t-[3px]" : ""} />
                  {total === 0 && <div style={{ height: 2, background: "#eee6f5" }} />}
                </div>
              );
            })}
          </div>
        )}
        {!loading && report && report.totalWastagePaisa + report.totalGiftPaisa === 0 && (
          <p className="text-[13px] text-body-soft mt-3 mb-0">Nothing written off in this range.</p>
        )}
      </div>

      {/* valuation — where the money sits */}
      <h3 className="font-display text-[17px] text-purple mb-2.5">Where the money sits (top 10)</h3>
      <DataTable head={
        <div className="grid grid-cols-[44px_minmax(160px,1.2fr)_110px_100px_1fr_120px] gap-3 items-center px-4 py-3 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95">
          <span /><span>Item</span><span className="text-right">On hand</span>
          <span className="text-right">@ cost</span><span>Share</span><span className="text-right">Value</span>
        </div>
      }>
        {topRows.length === 0 && <div className="px-4 py-6 text-[13px] text-body-soft">No stock yet — post opening counts first.</div>}
        {topRows.map((r) => (
          <div key={r.itemId} className="grid grid-cols-[44px_minmax(160px,1.2fr)_110px_100px_1fr_120px] gap-3 items-center px-4 py-3">
            <ItemThumb item={r} size={38} />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-body truncate">{r.name}</span>
              <span className="block text-[12px] text-body-soft">{r.sku}</span>
            </span>
            <span className="text-right text-[13px] text-body">{fmtQty(r.totalQtyMilli)} {r.unitShort}</span>
            <span className="text-right text-[12.5px] text-body-soft">{formatTaka(r.unitCostPaisa)}</span>
            <span className="h-[10px] rounded-full overflow-hidden" style={{ background: "#f1eaf8" }}>
              <span className="block h-full rounded-full"
                style={{ width: `${Math.round((Math.abs(r.valuePaisa) / maxValue) * 100)}%`, background: r.valuePaisa < 0 ? "#c0392b" : ACCENT }} />
            </span>
            <span className="text-right text-[13px] font-semibold" style={{ color: r.valuePaisa < 0 ? "#c0392b" : undefined }}>
              {formatTaka(r.valuePaisa)}
            </span>
          </div>
        ))}
      </DataTable>
    </div>
  );
}

/* ================================================================ SETTINGS */

export function InvSettingsView() {
  const [settings, setSettings] = useState<InvSettings | null>(null);
  const [whs, setWhs] = useState<ApiWarehouse[]>([]);
  const [held, setHeld] = useState<Record<string, number>>({});
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    const [s, w] = await Promise.all([loadInvSettingsSafe(), loadInvWarehousesSafe()]);
    setSettings(s.settings);
    setWhs(w.rows);
    setIsDemo(s.isDemo || w.isDemo);
    /*  Show what each warehouse holds right beside the pick — otherwise choosing one is a guess. */
    try {
      const st = await loadInvStockSafe();
      const tally: Record<string, number> = {};
      for (const r of st.rows) {
        for (const p of r.perWarehouse) {
          if (p.qtyMilli > 0) tally[p.warehouseId] = (tally[p.warehouseId] ?? 0) + 1;
        }
      }
      setHeld(tally);
    } catch { setHeld({}); }
  }
  useEffect(() => { load(); }, []);

  async function save(patch: Parameters<typeof patchInvSettings>[0]) {
    if (!settings) return;
    setBusy(true); setErr(""); setOk("");
    const prev = settings;
    setSettings({ ...settings, ...patch } as InvSettings); // optimistic
    try {
      const updated = await patchInvSettings(patch);
      setSettings(updated);
      setOk("Saved.");
    } catch (e) {
      setSettings(prev);
      setErr(msg(e, "Could not save the setting"));
    } finally { setBusy(false); }
  }

  /* ── the page is four settings of two very different weights ────────────
     Before 10 Aug they were one column of identical Fields squeezed into
     640px on a 1900px screen. The owner: *"setting page ar size thik nei
     and design o valo lage nai"*. Two real decisions now sit side by side
     as cards; the two switches go below, quieter, label left / control
     right. Nothing is wider than it needs to be, nothing is narrower.  */

  const Pill = ({ on, tone = ACCENT, onClick, children }: {
    on: boolean; tone?: string; onClick: () => void; children: React.ReactNode;
  }) => (
    <button type="button" disabled={busy} onClick={onClick}
      className="text-[12.5px] font-medium px-4 py-2 rounded-full border transition-colors disabled:opacity-60"
      style={on
        ? { background: tone, color: "#fff", borderColor: tone }
        : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
      {children}
    </button>
  );

  const WhCard = ({ icon, title, blurb, value, onPick, foot }: {
    icon: string; title: string; blurb: string;
    value: string | null; onPick: (id: string) => void; foot: React.ReactNode;
  }) => (
    <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="text-body-soft"><Icon name={icon} size={15} /></span>
        <b className="text-[14px] text-purple">{title}</b>
      </div>
      <p className="text-[12.5px] text-body-soft mt-0.5 mb-3">{blurb}</p>
      <div className="flex flex-wrap gap-2">
        {whs.filter((w) => w.isActive).map((w) => (
          <Pill key={w.id} on={value === w.id} onClick={() => onPick(w.id)}>{w.name}</Pill>
        ))}
      </div>
      <div className="mt-3">{foot}</div>
    </div>
  );

  const nameOf = (id: string | null) => whs.find((w) => w.id === id)?.name ?? null;
  const others = whs.filter((w) => w.isActive && w.id !== settings?.defaultSaleWarehouseId);
  const holdLine = (id: string | null) => {
    if (!id) return "Not chosen yet";
    const n = held[id] ?? 0;
    return n > 0 ? `Holding ${n} item${n > 1 ? "s" : ""} right now` : "Currently holding nothing";
  };

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Inventory"
        title="Settings"
      />
      {isDemo && <DemoBar what="sample settings" onRetry={load} />}
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      {settings && (
        <div>
          {/*  the page used to sit in a quarter of the screen (owner, 21 Aug:
              "1 vag niye bose ache") — three real decisions now share the width  */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 items-start">
            <WhCard icon="bag" title="Sales leave from"
              blurb="Where an order takes stock from first"
              value={settings.defaultSaleWarehouseId}
              onPick={(id) => save({ defaultSaleWarehouseId: id })}
              foot={
                /* DEC-INV-018 — the rule has to be readable HERE. A shop owner
                   cannot trust behaviour nobody told him about. */
                others.length > 0 ? (
                  <span className="block text-[12px] rounded-[9px] px-2.5 py-2"
                    style={{ background: "#e7f5f1", color: "#0e6b56" }}>
                    Runs out here? The rest comes from{" "}
                    <b>{others.map((w) => w.name).join(" / ")}</b> automatically.
                  </span>
                ) : (
                  <span className="text-[12px] text-body-soft">{holdLine(settings.defaultSaleWarehouseId)}</span>
                )
              }
            />

            <WhCard icon="box" title="Purchases land in"
              blurb="Where received goods are counted"
              value={settings.defaultReceiveWarehouseId}
              onPick={(id) => save({ defaultReceiveWarehouseId: id })}
              foot={<span className="text-[12px] text-body-soft">{holdLine(settings.defaultReceiveWarehouseId)}</span>}
            />

            {/*  DEC-ASM-003 — assembly's two ends lived only in code; now the
                 owner can see and change them like everything else  */}
            <WhCard icon="tools" title="Assembly picks from"
              blurb="Where bouquet components are taken from"
              value={settings.defaultAssemblyComponentWarehouseId ?? null}
              onPick={(id) => save({ defaultAssemblyComponentWarehouseId: id })}
              foot={<span className="text-[12px] text-body-soft">{holdLine(settings.defaultAssemblyComponentWarehouseId ?? null)}</span>}
            />
          </div>

          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 divide-y divide-lavender-deep/70">
            <div className="flex items-start justify-between gap-6 py-4">
              <span>
                <b className="block text-[13.5px] text-body">Staff pick a store per order</b>
                <span className="block text-[12.5px] text-body-soft">Off means the choices above always apply</span>
              </span>
              <Pill on={settings.allowPerOrderWarehouse} tone="#0e7a3d"
                onClick={() => save({ allowPerOrderWarehouse: !settings.allowPerOrderWarehouse })}>
                {settings.allowPerOrderWarehouse ? "On" : "Off"}
              </Pill>
            </div>

            <div className="flex items-start justify-between gap-6 py-4">
              <span>
                <b className="block text-[13.5px] text-body">When every store is empty</b>
                <span className="block text-[12.5px] text-body-soft">
                  Allow keeps the order moving and turns the row red; Block refuses the sale
                </span>
              </span>
              <span className="flex gap-2 shrink-0">
                <Pill on={settings.negativeStockPolicy === "ALLOW_WARN"} tone="#b45309"
                  onClick={() => save({ negativeStockPolicy: "ALLOW_WARN" })}>Allow, warn me</Pill>
                <Pill on={settings.negativeStockPolicy === "BLOCK"} tone="#c0392b"
                  onClick={() => save({ negativeStockPolicy: "BLOCK" })}>Block the sale</Pill>
              </span>
            </div>
          </div>

          {/*  the stores themselves are a SHOP-wide thing (CLAUDE.md §15), so
               they are made and closed in Setup → Warehouses, not here  */}
          <div className="mt-4 bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 flex flex-wrap items-center gap-3">
            <span className="w-[36px] h-[36px] rounded-[11px] grid place-items-center text-white" style={{ background: ACCENT }}>
              <Icon name="warehouse" size={16} />
            </span>
            <span className="flex-1 min-w-[220px]">
              <b className="block text-[13.5px] text-purple">Your stores</b>
              <span className="block text-[12px] text-body-soft">
                {whs.filter((w) => w.isActive).map((w) => `${w.name}${(held[w.id] ?? 0) > 0 ? ` (${held[w.id]} items)` : ""}`).join(" · ") || "None yet"}
              </span>
            </span>
            <a href="/inventory/warehouses"
              className="text-[13px] font-medium text-purple border border-lavender-deep rounded-[10px] px-4 py-2.5 hover:bg-lavender/40">
              Manage in Setup →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
