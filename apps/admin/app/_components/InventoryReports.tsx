"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { WRAP, ACCENT, ItemPageHead, DemoBar, Kpi, DataTable, ItemThumb, Field, ErrBar, OkBar, msg } from "./ItemUI";
import {
  loadInvIssueReportSafe, loadInvValuationSafe, loadInvSettingsSafe, loadInvWarehousesSafe,
  patchInvSettings, formatTaka, fmtQty,
  type ApiWarehouse, type InvIssueReport, type InvSettings, type InvValuation,
} from "../_data/api";

/*
  Inventory — Reports + Settings.
  Architecture: RADIAN_INVENTORY_MODULE_ARCHITECTURE.md (locked 22 Jul 2026).

  Reports answer the owner's own question behind DEC-PUR-005/DEC-INV-005:
  "কত টাকার মাল damage হলো" — wastage & gift money per day, and what the
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
        blurb="The money answers: what rots, what goes out free, and what the shelf is worth right now — all at AVCO cost, all from the ledger."
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
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    const [s, w] = await Promise.all([loadInvSettingsSafe(), loadInvWarehousesSafe()]);
    setSettings(s.settings);
    setWhs(w.rows);
    setIsDemo(s.isDemo || w.isDemo);
  }
  useEffect(() => { load(); }, []);

  async function save(patch: Parameters<typeof patchInvSettings>[0]) {
    if (!settings) return;
    // Demo mode (API down): change locally so the owner can PREVIEW the choice,
    // but say plainly it is not saved — a red revert here just read as "broken".
    if (isDemo) {
      setSettings({ ...settings, ...patch } as InvSettings);
      setOk("Preview only — the API is not running, so this is NOT saved. Run radian_inventory_migrate.bat / START_RADIAN.bat first.");
      return;
    }
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

  const WhChoice = ({ value, onPick }: { value: string | null; onPick: (id: string) => void }) => (
    <div className="flex gap-2">
      {whs.map((w) => (
        <button key={w.id} type="button" disabled={busy} onClick={() => onPick(w.id)}
          className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border transition-colors disabled:opacity-60"
          style={value === w.id
            ? { background: ACCENT, color: "#fff", borderColor: ACCENT }
            : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
          {w.name}
        </button>
      ))}
    </div>
  );

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Inventory"
        title="Settings"
        blurb="Where sales deduct from and where receiving lands."
      />
      {isDemo && <DemoBar what="sample settings" onRetry={load} />}
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && <OkBar text={ok} onClose={() => setOk("")} />}

      {settings && (
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-5 max-w-[640px]">
          <Field label="Sales deduct from" required
            hint="Every sale takes stock from this warehouse by default.">
            <WhChoice value={settings.defaultSaleWarehouseId}
              onPick={(id) => save({ defaultSaleWarehouseId: id })} />
          </Field>

          <Field label="Purchases receive into" required
            hint="Default destination when a purchase is received (arrives with the Purchase hook)">
            <WhChoice value={settings.defaultReceiveWarehouseId}
              onPick={(id) => save({ defaultReceiveWarehouseId: id })} />
          </Field>

          <Field label="Per-order warehouse choice"
            hint="On: staff may pick a warehouse on each order; Off: the default above always applies">
            <button type="button" disabled={busy}
              onClick={() => save({ allowPerOrderWarehouse: !settings.allowPerOrderWarehouse })}
              className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border transition-colors disabled:opacity-60"
              style={settings.allowPerOrderWarehouse
                ? { background: "#0e7a3d", color: "#fff", borderColor: "#0e7a3d" }
                : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
              {settings.allowPerOrderWarehouse ? "On — staff can choose per order" : "Off — always use the default"}
            </button>
          </Field>

          <Field label="When stock hits zero"
            hint="Allow keeps orders moving and flags the row; Block stops deductions below zero">
            <div className="flex gap-2">
              {([["ALLOW_WARN", "Allow negative + warn"], ["BLOCK", "Block below zero"]] as const).map(([k, label]) => (
                <button key={k} type="button" disabled={busy}
                  onClick={() => save({ negativeStockPolicy: k })}
                  className="text-[12.5px] font-medium px-3.5 py-2 rounded-full border transition-colors disabled:opacity-60"
                  style={settings.negativeStockPolicy === k
                    ? { background: k === "ALLOW_WARN" ? "#b45309" : "#c0392b", color: "#fff", borderColor: "transparent" }
                    : { background: "#fff", color: "#5c4a6b", borderColor: "#e4d9ef" }}>
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <p className="text-[12px] text-body-soft mb-0">
            Every change is audited. Warehouse names are managed by the future Warehouse module (DEC-INV-014).
          </p>
        </div>
      )}
    </div>
  );
}
