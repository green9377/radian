"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import SaveBar, { type SaveState } from "./SaveBar";
import {
  listShopHours, setShopHour, listShopClosures, addShopClosure, removeShopClosure,
  getCompany, saveCompany, uploadImage,
  getStorefrontSettings, setStorefrontSettings,
  type ApiShopHour, type ApiShopClosure, type ApiCompany, type ApiStorefrontSettings,
} from "../_data/api";

/*
  Storefront · Visit the shop — everything on that one card, on one screen.

  It started as an "Opening hours" screen with the address, phone, map link and
  photo left over in Settings → Company. The owner's objection was immediate and
  right: one section of the website should not need two screens to edit.

  The address and phone are still STORED on CompanySetting, and still written
  through `CompanyService` — Administration owns that row. Two screens editing
  one row is fine; two tables holding one fact is not. Settings → Company
  continues to work and shows the same values.

  ⚠️ WHY THIS IS NOT ONE TEXT BOX. The website carries a live "Open now · till
  10 PM" pill that changes with the clock. A single sentence would leave that
  pill either permanently lying or removed — so the times are real numbers, and
  the readable line on the site is generated from them. The two cannot drift.

  The closures list is the other half, and the more important one: without it
  the site says "Open" on Eid morning and somebody drives to Dhanmondi to find
  the shutters down.
*/

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** minutes-since-midnight ↔ the "HH:MM" an <input type="time"> speaks */
const toTime = (m: number | null) =>
  m === null || m === undefined ? "" : `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (t: string) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/*
  Same page frame as every other admin screen (31 Jul 2026).

  The storefront screens were built at a fixed `max-w-[860px]`–`[1100px]`, which
  on the owner's monitor left the whole module pinned to the left with a third
  of the screen empty, while Products, Categories and the rest filled the width.
  One admin, one frame.

  `WRAP` is the same string those screens use — full width, padding that grows
  with the viewport. Individual columns still cap their own width where reading
  comfort needs it; the PAGE no longer does.
*/
const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

export default function ShopHoursView() {
  const [hours, setHours] = useState<ApiShopHour[]>([]);
  const [closures, setClosures] = useState<ApiShopClosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  /* one honest place for "is my change in" — see SaveBar */
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [newDate, setNewDate] = useState("");
  const [newReason, setNewReason] = useState("");
  const [co, setCo] = useState<ApiCompany | null>(null);
  const [settings, setSettings] = useState<ApiStorefrontSettings | null>(null);
  const [uploading, setUploading] = useState(false);

  const flash = (m: string) => { setOk(m); setSaveState("saved"); setTimeout(() => setOk(null), 2000); };

  useEffect(() => { void reload(); }, []);
  async function reload() {
    setLoading(true);
    try {
      const [h, c, company, st] = await Promise.all([
        listShopHours(), listShopClosures(), getCompany(), getStorefrontSettings(),
      ]);
      setHours(h); setClosures(c); setCo(company); setSettings(st); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not load"); }
    finally { setLoading(false); }
  }

  async function patchCompany(body: Partial<ApiCompany>) {
    try {
      setSaveState("saving");
      const updated = await saveCompany(body);
      setCo(updated);
      flash("Saved");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save"); setSaveState("error");
      void reload();
    }
  }

  async function patchSettings(body: { shopChipTitle?: string; shopChipSub?: string; pdpUnderBuyText?: string; pdpUnderBuyPreorderText?: string }) {
    try {
      setSaveState("saving");
      setSettings(await setStorefrontSettings(body));
      flash("Saved");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save"); setSaveState("error");
    }
  }

  async function pickPhoto(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(file, "brand");
      await patchCompany({ shopImageUrl: url });
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); }
  }

  async function patch(weekday: number, body: { isClosed?: boolean; openMin?: number | null; closeMin?: number | null }) {
    try {
      setSaveState("saving");
      const updated = await setShopHour(weekday, body);
      setHours((hs) => hs.map((h) => (h.weekday === weekday ? updated : h)));
      flash("Saved");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save"); setSaveState("error");
      void reload();
    }
  }

  /** the same summary the website builds, so this screen shows what it will say */
  const summary = summarise(hours);

  async function addClosed() {
    if (!newDate) return;
    try {
      const c = await addShopClosure({ date: newDate, reason: newReason });
      setClosures((cs) => [...cs.filter((x) => x.date.slice(0, 10) !== newDate), c].sort((a, b) => a.date.localeCompare(b.date)));
      setNewDate(""); setNewReason("");
      flash("Added");
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not add"); }
  }

  return (
    <div className={WRAP}>
      <h1 className="font-display text-[22px] text-purple mb-1">Visit the shop</h1>
      <p className="text-[13px] text-body-soft mb-5">
        Everything on the shop card near the bottom of every page. Saves as you click away.
      </p>

      <SaveBar state={saveState} onSave={() => flash("Saved")} />

      {err && (
        <div className="flex items-start gap-2 bg-[#fdecea] border border-[#f5c6c2] rounded-[11px] px-3.5 py-2.5 text-[12px] text-[#a3261f] mb-4">
          <span className="mt-0.5 shrink-0"><Icon name="alert" size={14} /></span><span>{err}</span>
        </div>
      )}
      {ok && <div className="bg-[#eef7f0] border border-[#cfe8d6] rounded-[11px] px-3.5 py-2 text-[12px] text-[#12693f] mb-4">{ok}</div>}

      {/* ---- the card's own details: photo, address, phone, map ---- */}
      {co && (
        <div className="bg-white border border-lavender-deep rounded-[14px] p-4 mb-6">
          <p className="text-[11.5px] font-medium text-body-soft uppercase tracking-[0.12em] mb-3">The shop</p>
          <div className="grid grid-cols-1 md:grid-cols-[210px_1fr] gap-4">
            <div>
              <span className="text-[12.5px] font-medium text-body block mb-1.5">
                Photo
                <span className="block text-[11px] text-body-soft font-normal mt-0.5">1000 × 1200 · upright</span>
              </span>
              <label className="relative block w-full aspect-[5/6] rounded-[12px] border-2 border-dashed border-lavender-deep bg-lavender/40 hover:border-orchid cursor-pointer overflow-hidden grid place-items-center">
                {co.shopImageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={co.shopImageUrl} alt="" className={"absolute inset-0 w-full h-full object-cover " + (uploading ? "opacity-40" : "")} />
                  : <span className="text-body-soft text-[11.5px] flex flex-col items-center gap-1"><Icon name="upload" size={18} /> Drag &amp; drop</span>}
                {uploading && <span className="absolute inset-x-0 bottom-0 bg-purple/85 text-white text-[11px] py-1 text-center">Uploading…</span>}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)} />
              </label>
              {co.shopImageUrl && <button onClick={() => patchCompany({ shopImageUrl: null })} className="text-[12.5px] text-body-soft hover:text-[#c0392b] mt-1.5">Remove</button>}
            </div>

            <div className="space-y-3">
              <F label="Street address">
                <input className="ipt" defaultValue={co.operatingAddress ?? ""} placeholder="House 12, Road 5, Dhanmondi"
                  onBlur={(e) => e.target.value !== (co.operatingAddress ?? "") && patchCompany({ operatingAddress: e.target.value })} />
              </F>
              <div className="grid grid-cols-2 gap-3">
                <F label="City"><input className="ipt" defaultValue={co.city ?? ""} placeholder="Dhaka"
                  onBlur={(e) => e.target.value !== (co.city ?? "") && patchCompany({ city: e.target.value })} /></F>
                <F label="Postcode"><input className="ipt" defaultValue={co.postcode ?? ""} placeholder="1205"
                  onBlur={(e) => e.target.value !== (co.postcode ?? "") && patchCompany({ postcode: e.target.value })} /></F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Phone" hint="the Call button dials this">
                  <input className="ipt" defaultValue={co.publicPhone ?? ""} placeholder="+880 1X XXX XXXXX"
                    onBlur={(e) => e.target.value !== (co.publicPhone ?? "") && patchCompany({ publicPhone: e.target.value })} />
                </F>
                <F label="WhatsApp" hint="leave empty if it is the same number">
                  <input className="ipt" defaultValue={co.whatsappPhone ?? ""} placeholder="same as phone"
                    onBlur={(e) => e.target.value !== (co.whatsappPhone ?? "") && patchCompany({ whatsappPhone: e.target.value })} />
                </F>
              </div>
              <F label="Google Maps link" hint="open your shop in Google Maps → Share → copy the link. Without it the “Get directions” button is not shown at all.">
                <input className="ipt" defaultValue={co.mapUrl ?? ""} placeholder="https://maps.app.goo.gl/…"
                  onBlur={(e) => e.target.value !== (co.mapUrl ?? "") && patchCompany({ mapUrl: e.target.value })} />
              </F>

              {/*  The little card floating on the photograph. The owner asked
                  where "Dhanmondi, Dhaka" is changed (11 Aug 2026) — the answer
                  was nowhere: the schema and the API had carried these two
                  since the words were pulled out of the component, and no
                  screen was ever built for them. Both blank → the card is not
                  drawn, rather than a white box on the photo.  */}
              <div className="grid grid-cols-2 gap-3">
                <F label="Card on the photo — line 1" hint="the bold line">
                  <input className="ipt" defaultValue={settings?.shopChipTitle ?? ""} placeholder="Dhanmondi, Dhaka"
                    onBlur={(e) => e.target.value !== (settings?.shopChipTitle ?? "") && patchSettings({ shopChipTitle: e.target.value })} />
                </F>
                <F label="Card on the photo — line 2" hint="blank on both lines hides the card">
                  <input className="ipt" defaultValue={settings?.shopChipSub ?? ""} placeholder="Watch your gift arranged by hand"
                    onBlur={(e) => e.target.value !== (settings?.shopChipSub ?? "") && patchSettings({ shopChipSub: e.target.value })} />
                </F>
              </div>

              {/*  DEC-PRD-052 — the reassurance line under the product page's
                  Buy Now button. The owner asked whether it could be changed
                  (26 Aug 2026); until then it was typed into the component.
                  Blank returns the storefront's built-in wording.  */}
              <div className="grid grid-cols-2 gap-3">
                <F label="Line under Buy Now" hint="blank = the built-in wording">
                  <input className="ipt" defaultValue={settings?.pdpUnderBuyText ?? ""}
                    placeholder="Delivery date, gift message - all on the next step. No payment until you confirm."
                    onBlur={(e) => e.target.value !== (settings?.pdpUnderBuyText ?? "") && patchSettings({ pdpUnderBuyText: e.target.value })} />
                </F>
                <F label="Same line on a pre-order" hint="a pre-order must not promise no-payment">
                  <input className="ipt" defaultValue={settings?.pdpUnderBuyPreorderText ?? ""}
                    placeholder="We'll confirm the sending date with you before anything ships."
                    onBlur={(e) => e.target.value !== (settings?.pdpUnderBuyPreorderText ?? "") && patchSettings({ pdpUnderBuyPreorderText: e.target.value })} />
                </F>
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-[11.5px] font-medium text-body-soft uppercase tracking-[0.12em] mb-2">When it is open</p>

      {/* What the site will actually print. The owner sets seven rows; this is
          the one sentence they add up to. */}
      <div className="bg-white border border-lavender-deep rounded-[14px] px-4 py-3.5 mb-4 flex items-center gap-3">
        <span className="text-orchid shrink-0"><Icon name="clock" size={18} /></span>
        <div>
          <div className="text-[11.5px] text-body-soft uppercase tracking-[0.12em] mb-0.5">The website will say</div>
          <div className="text-[14.5px] text-purple font-medium">{summary || "—"}</div>
        </div>
      </div>

      {loading ? <p className="text-[13px] text-body-soft">Loading…</p> : (
        <div className="space-y-1.5 mb-8">
          {DAYS.map((name, wd) => {
            const h = hours.find((x) => x.weekday === wd);
            const closed = h?.isClosed ?? false;
            return (
              <div key={wd} className={"border rounded-[12px] px-4 py-3 grid items-center gap-3 " +
                (closed ? "border-lavender-deep/50 bg-lavender/25" : "border-lavender-deep bg-white")}
                style={{ gridTemplateColumns: "120px 1fr auto" }}
              >
                <span className="text-[13.5px] font-medium text-purple">{name}</span>
                {closed ? (
                  <span className="text-[13px] text-body-soft">Shut all day</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <input type="time" className="ipt w-[130px]" defaultValue={toTime(h?.openMin ?? null)}
                      onBlur={(e) => patch(wd, { openMin: toMin(e.target.value) })} />
                    <span className="text-body-soft text-[13px]">to</span>
                    <input type="time" className="ipt w-[130px]" defaultValue={toTime(h?.closeMin ?? null)}
                      onBlur={(e) => patch(wd, { closeMin: toMin(e.target.value) })} />
                  </div>
                )}
                <label className="flex items-center gap-2 text-[12.5px] text-body cursor-pointer">
                  <input type="checkbox" checked={closed} onChange={(e) => patch(wd, { isClosed: e.target.checked })} />
                  Closed
                </label>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="font-display text-[17px] text-purple mb-1">Days the shop is shut</h2>
      <p className="text-[13px] text-body-soft mb-3">
        Eid, a wedding, anything. On these days the website says closed no matter what the week above says.
        {/* Said plainly because the cost of NOT doing it is a customer standing
            outside a locked shop, and that is not recoverable. */}
      </p>

      <div className="flex gap-2 flex-wrap items-end mb-3">
        <div>
          <span className="text-[12px] text-body-soft block mb-1">Date</span>
          <input type="date" className="ipt w-[170px]" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
        </div>
        <div className="flex-1 min-w-[180px]">
          <span className="text-[12px] text-body-soft block mb-1">Why (optional)</span>
          <input className="ipt" placeholder="Eid-ul-Fitr" value={newReason} onChange={(e) => setNewReason(e.target.value)} />
        </div>
        <button onClick={addClosed} disabled={!newDate}
          className="bg-purple hover:bg-purple-deep disabled:opacity-50 text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px]">
          Add
        </button>
      </div>

      {closures.length === 0 ? (
        <p className="text-[13px] text-body-soft">No closed days coming up.</p>
      ) : (
        <div className="space-y-1.5">
          {closures.map((c) => (
            <div key={c.id} className="border border-lavender-deep rounded-[12px] bg-white px-4 py-2.5 flex items-center gap-3">
              <span className="text-[13.5px] text-purple font-medium">{prettyDate(c.date)}</span>
              <span className="text-[13px] text-body-soft flex-1">{c.reason ?? ""}</span>
              <button onClick={async () => { await removeShopClosure(c.id); setClosures((cs) => cs.filter((x) => x.id !== c.id)); }}
                className="text-body-soft hover:text-[#c0392b] p-1"><Icon name="trash" size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  // a <div>, not a <label> — see the note in CollectionsView about picture drops
  return (
    <div>
      <span className="text-[12.5px] font-medium text-body block mb-1.5">
        {label}
        {hint && <span className="block text-[11px] text-body-soft font-normal mt-0.5">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

function prettyDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const fmt = (min: number) => {
  const h24 = Math.floor(min / 60) % 24, m = min % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h24 < 12 ? "AM" : "PM"}`;
};

/** mirrors `summarise()` in the API so the preview cannot promise a different
 *  sentence from the one the site prints */
function summarise(hours: ApiShopHour[]): string {
  if (hours.length === 0) return "";
  const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const key = (h: ApiShopHour) =>
    h.isClosed || h.openMin === null || h.closeMin === null ? "closed" : `${h.openMin}-${h.closeMin}`;
  const ordered = [...hours].sort((a, b) => a.weekday - b.weekday);
  if (ordered.every((h) => key(h) === key(ordered[0]))) {
    return key(ordered[0]) === "closed"
      ? "Closed every day"
      : `Open every day, ${fmt(ordered[0].openMin!)} – ${fmt(ordered[0].closeMin!)}`;
  }
  const runs: { from: number; to: number; k: string }[] = [];
  for (const h of ordered) {
    const k = key(h), last = runs[runs.length - 1];
    if (last && last.k === k && last.to === h.weekday - 1) last.to = h.weekday;
    else runs.push({ from: h.weekday, to: h.weekday, k });
  }
  return runs.map((r) => {
    const days = r.from === r.to ? short[r.from] : `${short[r.from]}–${short[r.to]}`;
    if (r.k === "closed") return `${days} closed`;
    const [o, c] = r.k.split("-").map(Number);
    return `${days} ${fmt(o)} – ${fmt(c)}`;
  }).join(" · ");
}
