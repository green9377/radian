"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  WRAP, FinHeader, Card, Panel, Kpi, Chip, Empty, Flash, Banner,
  btnPrimary, btnPrimaryStyle, btnGhost, input, Lbl, TONE,
} from "./FinanceUI";
import {
  trackingSettings, trackingStatus, saveTracking,
  type ApiTracking, type ApiTrackingStatus,
} from "../_data/api";

/*
  TRACKING CODES — MKT-D15.

  Every pixel id in one place, pasted once, read by the storefront at run time.

  The hard part of this screen is not the form. It is telling the truth about
  what these codes will and will not do today, in the place where somebody is
  about to spend money on the strength of them:

    · Purchase cannot fire, because the storefront cannot create an order yet.
      A pixel fed only PageView teaches Facebook to find people who look and
      leave — and then spends the budget doing exactly that. Worse than nothing.

    · The customers are still on radianbd.com, which carries its own GTM
      container. Codes pasted here affect the NEW storefront, which nobody
      shops on yet.

  Both are said on the screen, not buried in a document nobody opens.
*/

type FieldDef = { key: keyof ApiTracking; label: string; hint: string };

const FIELDS: FieldDef[] = [
  { key: "gtmId", label: "Google Tag Manager", hint: "GTM-XXXXXXX" },
  { key: "metaPixelId", label: "Meta Pixel — Facebook & Instagram", hint: "15–16 digits" },
  { key: "ga4MeasurementId", label: "Google Analytics 4", hint: "G-XXXXXXXXXX" },
  { key: "googleAdsId", label: "Google Ads", hint: "AW-XXXXXXXXX" },
  { key: "googleAdsConversionLabel", label: "Google Ads conversion label", hint: "optional" },
  { key: "tiktokPixelId", label: "TikTok Pixel", hint: "from Events Manager" },
  { key: "snapPixelId", label: "Snapchat Pixel", hint: "optional" },
  { key: "pinterestTagId", label: "Pinterest Tag", hint: "optional" },
  { key: "clarityId", label: "Microsoft Clarity", hint: "free session recording" },
];

export function TrackingView() {
  const [s, setS] = useState<ApiTracking | null>(null);
  const [st, setSt] = useState<ApiTrackingStatus | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([trackingSettings(), trackingStatus()]);
      setS(a); setSt(b);
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!s || !st) return <div className={WRAP}><Flash ok="" err={err} /><Empty title="Loading…" /></div>;

  const set = (k: keyof ApiTracking, v: unknown) => setS({ ...s, [k]: v } as ApiTracking);

  const save = async () => {
    setBusy(true); setErr(""); setOk("");
    try {
      const body: Record<string, unknown> = { ...s };
      delete body.capiTokenSet;
      delete body.id;
      // only send the token if a new one was typed — otherwise it would be cleared
      if (token.trim()) body.capiAccessToken = token.trim();
      else delete body.capiAccessToken;
      await saveTracking(body);
      setToken("");
      setOk("Saved");
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const purchaseBlocked = st.events.find((e) => e.name === "Purchase" && !e.ready);

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing"
        title="Tracking codes"
        emoji="🎯"
        tone="brand"
        right={
          <button className={btnPrimary} style={btnPrimaryStyle} onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        }
      />
      <Flash ok={ok} err={err} />

      {purchaseBlocked && (
        <Banner tone="amber" emoji="⚠" title="Purchase does not fire yet">
          Checkout is not live, so no sale event is sent.
        </Banner>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Codes in place" value={`${st.liveCount}/${st.platforms.length}`} emoji="🎯"
          tone={st.liveCount > 0 ? "emerald" : "slate"} />
        <Kpi label="Events that work today" value={`${st.events.filter((e) => e.ready).length}/${st.events.length}`}
          emoji="⚡" tone="amber" hint="Purchase waits on checkout" />
        <Kpi label="Server-side to Meta" value={st.capi.ready ? "on" : "off"} emoji="🛰"
          tone={st.capi.ready ? "emerald" : "slate"} hint="sees phone & walk-in too" />
        <Kpi label="Master switch" value={s.enabled ? "on" : "off"} emoji="🔌"
          tone={s.enabled ? "emerald" : "rose"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="The codes" emoji="🎯" tone="brand">
          <div className="p-5 space-y-4">
            {FIELDS.map((f) => (
              <div key={f.key as string}>
                <Lbl>{f.label}</Lbl>
                <input className={input}
                  value={(s[f.key] as string | null) ?? ""}
                  placeholder={f.hint}
                  onChange={(e) => set(f.key, e.target.value)} />
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="What can be tracked today" emoji="⚡" tone="sky">
            <div className="p-5 space-y-2.5">
              {st.events.map((e) => (
                <div key={e.name} className="flex items-start gap-2.5">
                  <span className="text-[13px] mt-0.5"
                    style={{ color: e.ready ? TONE.emerald.text : TONE.rose.text }}>
                    {e.ready ? "✓" : "✕"}
                  </span>
                  <div>
                    <div className="text-[13.5px] font-semibold text-purple">{e.name}</div>
                    <div className="text-[11.5px] text-body-soft">{e.why}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Server-side to Meta" emoji="🛰" tone={st.capi.ready ? "emerald" : "slate"}>
            <div className="p-5">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                  <input type="checkbox" checked={s.capiEnabled}
                    onChange={(e) => set("capiEnabled", e.target.checked)} />
                  <span>Send events to Meta from the server</span>
                </label>
                <div>
                  <Lbl>Dataset ID</Lbl>
                  <input className={input} value={s.capiDatasetId ?? ""}
                    placeholder="from Events Manager → Settings"
                    onChange={(e) => set("capiDatasetId", e.target.value)} />
                </div>
                <div>
                  <Lbl>Access token {s.capiTokenSet && <Chip tone="emerald">one is saved</Chip>}</Lbl>
                  {/*  "new-password" is the only value Chrome obeys here. With
                       autoComplete off — or absent — it offers the saved website
                       password, and a wrong token saved silently is worse than
                       an empty one. */}
                  <input className={input} type="password" value={token}
                    name="radian-capi-token" autoComplete="new-password"
                    data-1p-ignore data-lpignore="true"
                    placeholder={s.capiTokenSet ? "leave blank to keep the saved one" : "paste the token"}
                    onChange={(e) => setToken(e.target.value)} />
                </div>
              </div>
              {s.capiEnabled && !st.capi.ready && (
                <div className="mt-3 text-[12px] rounded-xl px-3 py-2"
                  style={{ background: TONE.amber.soft, color: TONE.amber.text }}>
                  Switched on, but the dataset id or token is missing — nothing is being sent.
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Switches" emoji="🔌" tone="slate">
            <div className="p-5 space-y-3">
              <label className="flex items-start gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={s.enabled} className="mt-0.5"
                  onChange={(e) => set("enabled", e.target.checked)} />
                <span>
                  <strong>Load tracking on the storefront</strong>
                  <div className="text-[11.5px] text-body-soft">Off means nothing loads at all, whatever is typed above.</div>
                </span>
              </label>
              <label className="flex items-start gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={s.testMode} className="mt-0.5"
                  onChange={(e) => set("testMode", e.target.checked)} />
                <span>
                  <strong>Test mode</strong>
                  <div className="text-[11.5px] text-body-soft">
                    Events are marked as tests, so checking the wiring does not pollute the real numbers.
                  </div>
                </span>
              </label>
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button className={btnPrimary} style={btnPrimaryStyle} onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <Link className={btnGhost} href="/marketing/seo">SEO settings</Link>
      </div>
    </div>
  );
}
