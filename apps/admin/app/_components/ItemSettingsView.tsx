"use client";

import { useEffect, useState } from "react";
import { WRAP, ACCENT, msg, ItemPageHead, ErrBar, OkBar, OfflineBox } from "./ItemUI";
import { getItemSettings, patchItemSettings, formatTaka } from "../_data/api";

/*
  Items — pricing defaults. DEC-ITM-023 (owner, 20 Aug 2026).

  One number: the profit the shop adds to cost. Every counter price follows it, so a
  purchase that moves the average moves the price with it. An item may carry its own
  percent, and an item may fix an exact price — both overrule this.
*/

export default function ItemSettingsView() {
  const [bp, setBp] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function load() {
    try {
      const s = await getItemSettings();
      setBp(s.defaultMarkupBp);
      setText(String(s.defaultMarkupBp / 100));
      setOffline(false);
    } catch { setOffline(true); }
  }
  useEffect(() => { load(); }, []);

  const typedBp = text.trim() === "" ? null : Math.max(0, Math.round((parseFloat(text) || 0) * 100));
  const dirty = typedBp !== null && typedBp !== bp;

  async function save() {
    if (typedBp === null) return;
    setBusy(true); setErr(null); setOk(null);
    try {
      const s = await patchItemSettings({ defaultMarkupBp: typedBp });
      setBp(s.defaultMarkupBp);
      setOk("Saved. Every automatic price follows the new figure.");
    } catch (e) { setErr(msg(e, "Could not save.")); }
    finally { setBusy(false); }
  }

  // a worked example, so the percent is not an abstraction
  const example = 10000; // ৳100 cost
  const exampleSell = typedBp === null ? null : Math.round(example * (1 + typedBp / 10_000));

  return (
    <div className={WRAP}>
      <ItemPageHead eyebrow="master data · items" title="Pricing" />
      {offline && <OfflineBox onRetry={load} />}
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      {ok && <OkBar text={ok} onClose={() => setOk(null)} />}

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-4 max-w-[560px]">
        <b className="text-[14px] text-purple block mb-3">Profit added to cost</b>

        <div className="flex items-center gap-2.5">
          <div className="relative w-[130px]">
            <input className="ipt w-full text-right" inputMode="decimal" style={{ paddingRight: 30 }}
              value={text} onChange={(e) => setText(e.target.value)} placeholder="20" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13.5px] font-semibold pointer-events-none"
              style={{ color: "#b0a4b7" }}>%</span>
          </div>
          <button onClick={save} disabled={!dirty || busy}
            className="text-white text-[13px] font-medium px-5 py-2.5 rounded-[10px] disabled:opacity-40"
            style={{ background: ACCENT }}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>

        {exampleSell !== null && (
          <div className="mt-3.5 rounded-[12px] px-4 py-3 flex items-center gap-3 flex-wrap"
            style={{ background: "linear-gradient(120deg,#1d3325,#1f352a)" }}>
            <span className="text-[13px] text-body">
              {formatTaka(example)} <span className="text-body-soft">cost</span>
            </span>
            <span className="text-body-soft">→</span>
            <b className="font-display text-[22px] leading-none" style={{ color: "#76efab" }}>
              {formatTaka(exampleSell)}
            </b>
            <span className="text-[12.5px] font-semibold" style={{ color: "#76efab" }}>counter price</span>
          </div>
        )}
      </div>
    </div>
  );
}
