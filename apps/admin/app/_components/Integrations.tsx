"use client";

/*
  INTEGRATIONS — every outside service, grouped by what it DOES. ADM-D09.
  RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md, 30 Jul 2026

  The owner's instruction, 30 July: ALL of them here — Facebook, WhatsApp,
  Google, Meta, everything. Grouped, not one flat list, because a flat list makes
  "this one moves money" and "this one counts page views" look like the same kind
  of setting. Payment is first for exactly that reason.

  ⚠️ HOW THIS DOES NOT PUT A KEY IN TWO PLACES. The line is CONNECTION vs
  CONTENT:

     connection — keys, tokens, account numbers, pixel IDs, on/off,
                  sandbox-or-live. "Who are we connected to." → here.
     content    — the WhatsApp message wording, SEO titles, loyalty rates.
                  "What we send over that connection." → stays with Marketing
                  and SEO, which own those rules.

  The old columns in MessagingSetting and TrackingSetting still exist for one
  release — dropping them the same day they moved would leave no way back on a
  live shop — but there is exactly ONE read path on the server, and nothing else
  is allowed to read them.

  ⚠️ EVERY key box uses autoComplete="new-password". Chrome ignores "off"; only
  "new-password" is obeyed. On 29 July it filled the saved shop password into
  three separate key boxes before anybody noticed.

  ⚠️ Secrets arrive MASKED. A blank box therefore means "leave it alone", never
  "clear it" — otherwise opening this page and pressing Save would wipe every
  secret on it. Clearing is an explicit button.
*/

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ApiCourierService, ApiIntegration, ApiIntegrationsOverview, ApiIntKind,
  createCourierService, deleteCourierService, updateCourierService,
  getIntegrations, getWaTemplateStatus, revealIntegrationField, saveIntegration,
  submitWaTemplates, waTestSend, messagingTestSend, type ApiTemplateResult,
} from "../_data/api";
import {
  Banner, Card, Chip, FinHeader, Flash, Panel, TONE, WRAP,
  btnGhost, btnPrimary, btnPrimaryStyle, input, Lbl,
} from "./FinanceUI";

/*
  CARD DESIGN, 6 Aug 2026.

  The owner compared this page with the old site's Payment Gateways screen and
  called this one worse. The difference was never function — save, sandbox/live
  and validation all already worked — it was that the old page gave each
  gateway its own colour, kept the fields open, and used a switch you could see
  from across the room. That is what this card copies.

  What it deliberately does not copy: the old page showed store passwords in
  plain text. Here the overview only ever carries a masked value; the eye asks
  the server for the real one, and every reveal is written to the audit trail.
*/

/*
  One card for every service, whatever it connects to. Two layouts meant a key
  looked more or less important depending on which page it sat on, and there is
  no such thing as a half-important key: a wrong Page token breaks Messenger as
  completely as a wrong Store ID breaks checkout.
*/
const HERO_BRAND: Record<string, { grad: string; badge: string; ring: string; glow: string; solid: string }> = {
  SSLCOMMERZ: { grad: "linear-gradient(135deg,#062c47,#0a3d62 45%,#3c8dbc)", badge: "SC", ring: "#3c8dbc", glow: "rgba(10,61,98,0.35)", solid: "#0a3d62" },
  BKASH:      { grad: "linear-gradient(135deg,#8f0c47,#d6136c 45%,#ff5da2)", badge: "bK", ring: "#d6136c", glow: "rgba(214,19,108,0.35)", solid: "#d6136c" },
  NAGAD:      { grad: "linear-gradient(135deg,#9a3c0a,#e2691a 45%,#f7a339)", badge: "N", ring: "#e2691a", glow: "rgba(226,105,26,0.35)", solid: "#e2691a" },
  WHATSAPP:   { grad: "linear-gradient(135deg,#04463f,#0b7a68 45%,#25d366)", badge: "✆", ring: "#0b7a68", glow: "rgba(11,122,104,0.35)", solid: "#0b7a68" },
  EMAIL:      { grad: "linear-gradient(135deg,#1e2a5a,#2f4bab 45%,#6f8ff0)", badge: "✉", ring: "#2f4bab", glow: "rgba(47,75,171,0.32)", solid: "#2f4bab" },
  SMS:        { grad: "linear-gradient(135deg,#3f3a52,#5b5468 45%,#9f97b3)", badge: "▤", ring: "#5b5468", glow: "rgba(91,84,104,0.30)", solid: "#5b5468" },

  PATHAO:     { grad: "linear-gradient(135deg,#7a1020,#c81e3c 45%,#ff6b83)", badge: "P", ring: "#c81e3c", glow: "rgba(200,30,60,0.32)", solid: "#c81e3c" },
  STEADFAST:  { grad: "linear-gradient(135deg,#0d3b2e,#137a5c 45%,#4fd1a5)", badge: "S", ring: "#137a5c", glow: "rgba(19,122,92,0.32)", solid: "#137a5c" },
  REDX:       { grad: "linear-gradient(135deg,#5c0f14,#a51c22 45%,#f0666c)", badge: "R", ring: "#a51c22", glow: "rgba(165,28,34,0.32)", solid: "#a51c22" },

  META_ADS:       { grad: "linear-gradient(135deg,#0b2a63,#1877f2 45%,#63a4ff)", badge: "f", ring: "#1877f2", glow: "rgba(24,119,242,0.32)", solid: "#1877f2" },
  FACEBOOK_PAGE:  { grad: "linear-gradient(135deg,#062a5a,#0084ff 45%,#5fb6ff)", badge: "M", ring: "#0084ff", glow: "rgba(0,132,255,0.32)", solid: "#0084ff" },
  INSTAGRAM:      { grad: "linear-gradient(135deg,#7b2bbf,#dc2743 45%,#f9a825)", badge: "IG", ring: "#dc2743", glow: "rgba(220,39,67,0.32)", solid: "#c1275c" },
  GOOGLE_ADS_API: { grad: "linear-gradient(135deg,#1a4d2e,#2f9e44 45%,#8ce99a)", badge: "G", ring: "#2f9e44", glow: "rgba(47,158,68,0.30)", solid: "#2f9e44" },

  META_PIXEL:     { grad: "linear-gradient(135deg,#0b2a63,#1877f2 45%,#63a4ff)", badge: "◉", ring: "#1877f2", glow: "rgba(24,119,242,0.30)", solid: "#1877f2" },
  GA4:            { grad: "linear-gradient(135deg,#7a4a06,#e8912a 45%,#ffc879)", badge: "GA", ring: "#e8912a", glow: "rgba(232,145,42,0.30)", solid: "#e8912a" },
  GOOGLE_ADS_TAG: { grad: "linear-gradient(135deg,#1a4d2e,#2f9e44 45%,#8ce99a)", badge: "Ad", ring: "#2f9e44", glow: "rgba(47,158,68,0.30)", solid: "#2f9e44" },
  GTM:            { grad: "linear-gradient(135deg,#123a63,#2f7fd1 45%,#8ec6ff)", badge: "▣", ring: "#2f7fd1", glow: "rgba(47,127,209,0.30)", solid: "#2f7fd1" },
  TIKTOK_PIXEL:   { grad: "linear-gradient(135deg,#101013,#2b2b32 45%,#69c9d0)", badge: "♪", ring: "#69c9d0", glow: "rgba(40,40,50,0.32)", solid: "#1f1f26" },
  CLARITY:        { grad: "linear-gradient(135deg,#0f3d5c,#1e7fa8 45%,#7fd3ef)", badge: "◔", ring: "#1e7fa8", glow: "rgba(30,127,168,0.30)", solid: "#1e7fa8" },
  SNAP_PIXEL:     { grad: "linear-gradient(135deg,#7a6a05,#e0cf12 45%,#fff59d)", badge: "◠", ring: "#c9ba10", glow: "rgba(201,186,16,0.30)", solid: "#a89a0d" },
  PINTEREST_TAG:  { grad: "linear-gradient(135deg,#6b0a17,#bd081c 45%,#ff6b7d)", badge: "P", ring: "#bd081c", glow: "rgba(189,8,28,0.30)", solid: "#bd081c" },
};
const brandFor = (provider: string) =>
  HERO_BRAND[provider] ??
  { grad: TONE.brand.grad, badge: provider.slice(0, 2).toUpperCase(), ring: TONE.brand.bg, glow: "rgba(160,33,184,0.3)", solid: TONE.brand.bg };

/** On/off switch for a white card: green track when on, grey when off. */
function BigSwitch({ on, onClick }: { on: boolean; glow?: string; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="relative rounded-full shrink-0 transition-all"
      style={{ width: 48, height: 27, background: on ? "#16a34a" : "#d8d2e2" }}
    >
      <span
        className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-all"
        style={{ width: 21, height: 21, left: on ? 48 - 21 - 3 : 3 }}
      />
    </button>
  );
}

const TONE_FOR: Record<ApiIntKind, keyof typeof TONE> = {
  PAYMENT: "brand",
  COURIER: "sky",
  MESSAGING: "emerald",
  SOCIAL: "amber",
  ANALYTICS: "slate",
};
const EMOJI_FOR: Record<ApiIntKind, string> = {
  PAYMENT: "৳", COURIER: "⛟", MESSAGING: "✉", SOCIAL: "◍", ANALYTICS: "◔",
};

/**
 * `only` narrows the page to one group so the sidebar can offer each as its own
 * entry. The full page keeps all five, because "where are all our keys" is a
 * real question too.
 */
export default function Integrations({ only }: { only?: ApiIntKind } = {}) {
  const [data, setData] = useState<ApiIntegrationsOverview | null>(null);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    getIntegrations().then(setData).catch((e) => setErr((e as Error).message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setOk(m); setErr(""); setTimeout(() => setOk(""), 4000); };

  const groups = (data?.groups ?? []).filter((g) => !only || g.kind === only);
  const payment = data?.groups.find((g) => g.kind === "PAYMENT")?.services ?? [];
  const live = payment.filter((p) => p.isEnabled && p.isLive);
  const sandboxOn = payment.filter((p) => p.isEnabled && !p.isLive);
  const heading = only ? groups[0]?.label ?? "Integrations" : "Integrations & keys";

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Administration" emoji={only ? EMOJI_FOR[only] : "🔌"}
        title={heading}
        sub={
          only
            ? groups[0]?.blurb ?? ""
            : "Every outside service in one place, grouped by what it does"
        }
      />
      <Flash ok={ok} err={err} />

      {/*  The most consequential fact in the whole module: can the website take
           money, and is it real money. Shown on the full page and on payment.  */}
      {data && (!only || only === "PAYMENT") && (
        <div className="mb-5 space-y-3">
          {live.length === 0 && sandboxOn.length === 0 && (
            <Banner tone="amber" emoji="⚠" title="Checkout cannot take money">
              No payment gateway is switched on. The website can show a cart and
              a total, and then take nothing.
            </Banner>
          )}
          {sandboxOn.length > 0 && (
            <Banner
              tone="rose" emoji="⚠"
              title={`${sandboxOn.map((p) => p.label).join(", ")} is ON but in SANDBOX`}
            >
              Sandbox accepts payments that never arrive. To a customer it looks
              exactly like a successful order — and to you it looks like a paid
              order with no money behind it.
            </Banner>
          )}
          {live.length > 0 && (
            <Banner tone="emerald" emoji="✓"
                    title={`Taking real payments via ${live.map((p) => p.label).join(", ")}`}>
              Live keys are in use. Real money moves through this.
            </Banner>
          )}
        </div>
      )}

      {/*
        On a single-group page the header above already names the group, so
        wrapping the cards in a titled Panel would say the same thing twice.
      */}
      <div className="space-y-5">
        {groups.map((g) => {
          const body = (
            <div className={only ? "" : "p-4"}>
              {g.kind === "COURIER" ? (
                <CourierSection
                  couriers={data?.couriers ?? []}
                  services={g.services}
                  onSaved={(m) => { flash(m); load(); }}
                  onError={setErr}
                />
              ) : (
                /*  A grid of compact cards, like a wall of labelled switches —
                    the owner's reference design, 7 Aug. */
                /*  No items-start: cards in a row stretch to the tallest one, so
                    a section reads as one tidy block (owner, 7 Aug). */
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {g.services.map((s) => (
                    <ServiceCard
                      key={s.provider} s={s}
                      onSaved={(m) => { flash(m); load(); }} onError={setErr}
                    />
                  ))}
                </div>
              )}
            </div>
          );
          return only ? (
            <div key={g.kind}>{body}</div>
          ) : (
            <Panel
              key={g.kind}
              emoji={EMOJI_FOR[g.kind]}
              tone={TONE_FOR[g.kind]}
              title={g.label}
              sub={g.blurb}
            >
              {body}
            </Panel>
          );
        })}
      </div>

      {/*  What is deliberately NOT here. Saying so out loud is the difference
           between a boundary and an omission.  */}
      {!only && data && (
        <div className="mt-5">
          <Panel
            emoji="↗" tone="slate"
            title="What is NOT here, and why"
            sub="The connection lives here; what travels over it belongs to the module that decides it"
          >
            <div className="p-4">
              <p className="text-[12.5px] text-body leading-relaxed mb-3 max-w-[760px]">
                Every key is here. What is <strong>not</strong> here is the
                content that uses those keys — the wording of a WhatsApp message
                is a Marketing decision, not a connection setting. Keeping that
                split is what stops a key having two homes and nobody knowing
                which one the code reads.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {data.contentElsewhere.map((e) => (
                  <Link key={e.href + e.label} href={e.href} className="block">
                    <Card className="p-4 h-full">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[13px] font-bold text-purple">{e.label}</span>
                        <Chip tone="slate">{e.owner}</Chip>
                      </div>
                      <p className="text-[11.5px] text-body-soft leading-relaxed">{e.why}</p>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*
  THE SERVICE CARD.

  Fields are always visible. An "Edit" click before you can even see whether a
  key is set turns a five-second check into a hunt, and the question people
  actually arrive with is "is it set", not "let me change it".

  Two rules about the boxes, both from things that went wrong:

  - Clicking a box selects its contents, it never empties them. Emptying looked
    like the key had been lost, and worse, saving from that state would really
    have lost it.
  - Only boxes that were typed in are sent. Untouched means unchanged; typed
    then emptied means delete. That is the whole of it — there is no Clear
    button, by the owner's instruction.
*/

/*
  COURIERS — ONE CARD PER COURIER, KEYS FOLDED IN. 12 Aug 2026.

  The owner, plainly: "delivery-তে courier থাকলে এটা confusing and flow break
  করে." He was right, and the old note at the top of this section proved it —
  it had to explain that names lived on one screen and keys on another, which
  is a sentence no screen should ever need.

  So the courier list IS this section now. A courier is a row you add here;
  its API keys, if the company even has an API, are fields on that same row.

  ⚠️ WHY "HAS KEYS" IS NOT THE SAME AS "EXISTS". The owner first asked for the
  opposite of this — show only couriers that are integrated. That would have
  shut the shop down. The three providers below (Pathao, Steadfast, RedX) are
  a list written in code; there is no way to add a fourth from the panel, and
  most couriers in Bangladesh have no API at all. Tying "can I send a parcel by
  them" to "is there an API key" would have meant SA Paribahan could never
  carry a parcel again, and that a shop with empty key boxes could not despatch
  anything whatsoever. Existing in the list is what makes a courier usable;
  keys only decide whether the consignment number is typed by hand.
*/

const providerKeyFor = (courierName: string) =>
  courierName.toUpperCase().replace(/[^A-Z0-9]/g, '');

function CourierSection({
  couriers, services, onSaved, onError,
}: {
  couriers: ApiCourierService[];
  services: ApiIntegration[];
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState<Partial<ApiCourierService> | null>(null);
  const [busy, setBusy] = useState(false);

  /*  Which keys belong to which courier. `courierId` is the real answer — it is
      what the owner picked, or what this screen wrote. The name match is only
      for the three couriers that existed before this screen did and were never
      linked to anything; without it their keys would look homeless on the very
      first load after the change. */
  const serviceFor = (c: ApiCourierService) =>
    services.find((s) => s.courierId === c.id) ??
    services.find((s) => !s.courierId && s.provider === providerKeyFor(c.name));

  const claimed = new Set(couriers.map((c) => serviceFor(c)?.provider).filter(Boolean));
  const orphanKeys = services.filter((s) => !claimed.has(s.provider));

  async function save() {
    if (!editing?.name?.trim()) { onError("A courier needs a name"); return; }
    setBusy(true);
    try {
      if (editing.id) await updateCourierService(editing.id, editing as Record<string, unknown>);
      else await createCourierService(editing as Record<string, unknown>);
      setEditing(null);
      onSaved(`${editing.name.trim()} saved`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: ApiCourierService) {
    if (!confirm(`Remove ${c.name}? Parcels already sent by them keep their record.`)) return;
    try {
      await deleteCourierService(c.id);
      onSaved(`${c.name} removed`);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <p className="text-[12.5px] text-body-soft leading-relaxed max-w-[640px] m-0">
          Every courier you hand parcels to. These are the names the delivery
          board offers when a parcel is assigned — add one here and it is there.
        </p>
        <button
          onClick={() => setEditing({ isActive: true })}
          className={btnPrimary} style={btnPrimaryStyle}
        >
          + Add courier
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {couriers.map((c) => (
          <CourierCard
            key={c.id} c={c} s={serviceFor(c)}
            onSaved={onSaved} onError={onError}
            onEdit={() => setEditing(c)}
            onRemove={() => void remove(c)}
          />
        ))}
      </div>

      {couriers.length === 0 && (
        <div className="bg-white rounded-2xl border border-[#e7dff0] p-10 text-center text-[13.5px] text-body-soft">
          No couriers yet. Add the first one and it appears on the delivery board.
        </div>
      )}

      {/*  Keys with nobody to belong to. This should stay empty; it is here so
          that a key never disappears silently just because its courier was
          removed — a vanished secret is worse than an untidy screen. */}
      {orphanKeys.length > 0 && (
        <div className="mt-5">
          <p className="text-[12.5px] text-body-soft mb-3">
            These keys are not attached to any courier in your list. Add a
            courier with the matching name, or leave them — nothing uses them.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {orphanKeys.map((s) => (
              <ServiceCard key={s.provider} s={s} couriers={couriers} onSaved={onSaved} onError={onError} />
            ))}
          </div>
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] grid place-items-center p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-white rounded-2xl border border-[#e7dff0] p-5 w-full max-w-[440px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-[18px] text-purple m-0 mb-4">
              {editing.id ? `Edit ${editing.name}` : "Add courier"}
            </h3>
            <Lbl>Name *</Lbl>
            <input
              className={`${input} mb-3`} value={editing.name ?? ""}
              placeholder="SA Paribahan"
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <Lbl>Phone</Lbl>
            <input
              className={`${input} mb-3`} value={editing.phone ?? ""}
              onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
            />
            <Lbl>Tracking link — put {"{cn}"} where the consignment number goes</Lbl>
            <input
              className={`${input} mb-4 font-mono text-[12.5px]`}
              value={editing.trackingUrlTemplate ?? ""}
              placeholder="https://steadfast.com.bd/t/{cn}"
              onChange={(e) => setEditing({ ...editing, trackingUrlTemplate: e.target.value })}
            />
            <div className="flex gap-2.5">
              <button onClick={() => void save()} disabled={busy} className={`${btnPrimary} flex-1`} style={btnPrimaryStyle}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditing(null)} className={btnGhost}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CourierCard({
  c, s, onSaved, onError, onEdit, onRemove,
}: {
  c: ApiCourierService;
  /** the manifest service holding this courier's keys, when it has one */
  s?: ApiIntegration;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const brand = brandFor(s?.provider ?? providerKeyFor(c.name));
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const canAutoBook = !!s && s.fieldsFilled === s.fieldsTotal && s.isEnabled;

  async function saveKeys() {
    if (!s) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { courierId: c.id };
      for (const k of typed) body[k] = (edits[k] ?? "").trim();
      await saveIntegration(s.kind, s.provider, body);
      setEdits({}); setTyped(new Set());
      onSaved(`${c.name} keys saved`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    setBusy(true);
    try {
      await updateCourierService(c.id, { isActive: !c.isActive });
      onSaved(`${c.name} ${c.isActive ? "switched off" : "switched on"}`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="bg-white rounded-2xl border p-4 flex flex-col"
      style={{ borderColor: c.isActive ? brand.ring : "#e7dff0" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-[38px] h-[38px] rounded-xl grid place-items-center text-white text-[14px] font-semibold shrink-0"
          style={{ background: brand.grad }}
        >
          {brand.badge}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-purple truncate">{c.name}</div>
          <div className="text-[12px] text-body-soft truncate">
            {c.phone || "No phone yet"}
            {" · "}
            {c.trackingUrlTemplate || "no tracking link"}
          </div>
        </div>
        <BigSwitch on={c.isActive} onClick={toggleActive} />
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {canAutoBook ? (
          <span className="text-[11px] font-semibold bg-[#e8f6ef] text-[#0f7d55] px-2.5 py-1 rounded-full">
            Books by itself
          </span>
        ) : (
          <span className="text-[11px] font-semibold bg-[#fff4e2] text-[#b45309] px-2.5 py-1 rounded-full">
            Typed by hand
          </span>
        )}
        {!c.isActive && (
          <span className="text-[11px] font-semibold bg-[#f0edf4] text-body-soft px-2.5 py-1 rounded-full">
            Not offered on the board
          </span>
        )}
        <span className="flex-1" />
        <button onClick={onEdit} className="text-[12.5px] font-semibold text-orchid hover:text-purple">Edit</button>
        <button onClick={onRemove} className="text-[12.5px] font-semibold text-body-soft hover:text-[#b91c1c]">Remove</button>
      </div>

      {s ? (
        <div className="mt-3 pt-3 border-t border-[#f2e9fa]">
          <div className="grid gap-3 sm:grid-cols-2">
            {s.fields.map((f) => (
              <div key={f.key}>
                <Lbl>{f.label}</Lbl>
                <input
                  className={input}
                  type={f.secret ? "password" : "text"}
                  autoComplete="new-password"
                  placeholder={f.value ? String(f.value) : "not set"}
                  value={edits[f.key] ?? ""}
                  onChange={(e) => {
                    setEdits((x) => ({ ...x, [f.key]: e.target.value }));
                    setTyped((t) => new Set(t).add(f.key));
                  }}
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => void saveKeys()} disabled={busy || typed.size === 0}
            className={`${btnPrimary} w-full mt-3`} style={btnPrimaryStyle}
          >
            {busy ? "Saving…" : "Save keys"}
          </button>
          {/*  A blank box means "leave it alone", never "clear it" — opening the
              page and pressing save must not wipe a working key. */}
          <p className="text-[11.5px] text-body-soft mt-2 m-0">
            Leave a box empty to keep what is already saved.
          </p>
        </div>
      ) : (
        <div className="mt-3 pt-3 border-t border-[#f2e9fa] text-[12.5px] text-body-soft">
          Added by you. This courier has no API, so its consignment number is
          always typed in — which is how most couriers work.
        </div>
      )}
    </div>
  );
}

function ServiceCard({
  s, couriers, onSaved, onError,
}: {
  s: ApiIntegration;
  couriers?: { id: string; name: string }[];
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const brand = brandFor(s.provider);
  const [edits, setEdits] = useState<Record<string, string>>({});
  /** Boxes actually typed into — clicking one is not typing in it. */
  const [typed, setTyped] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  /** Real values fetched by the eye. The overview never carries them. */
  const [full, setFull] = useState<Record<string, string>>({});
  const [courierId, setCourierId] = useState(s.courierId ?? "");
  const [busy, setBusy] = useState(false);
  const complete = s.fieldsFilled === s.fieldsTotal;

  async function toggleReveal(key: string) {
    if (revealed.has(key)) {
      setRevealed((r) => { const n = new Set(r); n.delete(key); return n; });
      return;
    }
    setRevealed((r) => new Set(r).add(key));
    if (full[key] === undefined && !typed.has(key)) {
      try {
        const r = await revealIntegrationField(s.kind, s.provider, key);
        if (r.value) setFull((x) => ({ ...x, [key]: r.value as string }));
      } catch (e) {
        onError((e as Error).message);
      }
    }
  }

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...extra };
      if (couriers) body.courierId = courierId || null;
      for (const k of typed) body[k] = (edits[k] ?? "").trim();
      await saveIntegration(s.kind, s.provider, body);
      setEdits({}); setTyped(new Set());
      onSaved(`${s.label} saved`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    /*
      One clean white card per service — the owner's reference design (7 Aug):
      thin border, small brand mark, open fields, one button. The switched-on
      card earns its brand colour as a border; everything else stays quiet.
    */
    <div
      className="rounded-2xl bg-white p-5 transition-shadow h-full flex flex-col"
      style={{
        border: s.isEnabled ? `2px solid ${brand.ring}` : "1px solid #eae4f0",
        boxShadow: s.isEnabled ? `0 6px 22px ${brand.glow}` : "0 2px 10px rgba(40,20,50,0.05)",
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl grid place-items-center text-[15px] font-display font-bold text-white shrink-0"
               style={{ background: brand.grad }}>
            {brand.badge}
          </div>
          <div className="min-w-0">
            <div className="font-display font-bold text-[15.5px] leading-tight truncate">{s.label}</div>
            <div className="text-[10.5px] font-bold tracking-[0.1em] uppercase mt-0.5"
                 style={{ color: s.isEnabled ? (s.hasSandbox && !s.isLive ? TONE.rose.text : "#16a34a") : "#a79fb5" }}>
              {s.isEnabled ? (s.hasSandbox && !s.isLive ? "Sandbox" : "Live") : "Off"}
              <span className="ml-2 font-extrabold" style={{ color: complete ? "#a79fb5" : TONE.amber.text }}>
                {s.fieldsFilled}/{s.fieldsTotal}
              </span>
            </div>
          </div>
        </div>
        <BigSwitch on={s.isEnabled} onClick={() => void save({ isEnabled: !s.isEnabled })} />
      </div>

      <div className="flex flex-col gap-3 flex-1">
        <div className="flex items-center gap-2 flex-wrap empty:hidden">
          {s.hasSandbox && (
            /* An explicit two-option control: the previous single pill read as
               a status label, and the owner could not find the mode switch. */
            <div className="flex items-center rounded-full overflow-hidden border border-slate-200">
              <button
                type="button" disabled={busy}
                onClick={() => s.isLive && void save({ isLive: false })}
                className="text-[11px] font-extrabold px-3 py-1 transition-colors"
                style={!s.isLive
                  ? { background: "#dc2626", color: "#fff" }
                  : { background: "#fff", color: "#94a3b8" }}
              >
                SANDBOX
              </button>
              <button
                type="button" disabled={busy}
                onClick={() => {
                  if (s.isLive) return;
                  // Real keys in live mode move real money the moment a customer pays.
                  if (window.confirm(`Switch ${s.label} to LIVE? Real transactions will start immediately.`)) {
                    void save({ isLive: true });
                  }
                }}
                className="text-[11px] font-extrabold px-3 py-1 transition-colors"
                style={s.isLive
                  ? { background: "#16a34a", color: "#fff" }
                  : { background: "#fff", color: "#94a3b8" }}
              >
                LIVE
              </button>
            </div>
          )}
        </div>

        {/*  The long "why this matters" paragraph is gone on purpose — the
            owner asked for the quiet version. Hints live in tooltips now. */}
        <div className="space-y-3">
          {s.fields.map((f) => {
            const isRevealed = revealed.has(f.key);
            const touched = edits[f.key] !== undefined;
            const didType = typed.has(f.key);
            const saved = Boolean(f.value);
            const shown = touched
              ? edits[f.key]
              : (revealed.has(f.key) && full[f.key] !== undefined ? full[f.key] : (f.value ?? ""));
            return (
              <div key={f.key} className="min-w-0" title={f.hint}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Lbl>{f.label}</Lbl>
                  {saved && !didType && (
                    <span className="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded-full mb-1"
                          style={{ background: TONE.emerald.soft, color: TONE.emerald.text }}>
                      ✓
                    </span>
                  )}
                  {didType && shown.trim() === "" && saved && (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full mb-1"
                          style={{ background: TONE.rose.soft, color: TONE.rose.text }}>
                      WILL BE CLEARED
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5 min-w-0">
                  <input
                    className="w-full min-w-0 rounded-xl px-3 py-2.5 text-[13px] outline-none bg-white transition-all"
                    style={{ border: "1.5px solid #e6dfee" }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = brand.solid;
                      e.currentTarget.style.boxShadow = `0 0 0 3px ${brand.glow}`;
                      // Select, never clear: the text must not appear to vanish.
                      e.currentTarget.select();
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e6dfee";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                    type={f.secret && !isRevealed ? "password" : "text"}
                    placeholder={f.hint ?? (f.optional ? "optional" : "not set")}
                    value={shown}
                    autoComplete="new-password"
                    onChange={(e) => {
                      const v = e.target.value;
                      setEdits((x) => ({ ...x, [f.key]: v }));
                      setTyped((t) => (t.has(f.key) ? t : new Set(t).add(f.key)));
                    }}
                  />
                  {f.secret && (
                    <button
                      type="button"
                      className="shrink-0 w-10 rounded-xl grid place-items-center text-[14px] transition-colors"
                      style={{ border: "1.5px solid #e6dfee" }}
                      title={isRevealed ? "Hide again" : "Show the full key — every reveal is written to the audit trail"}
                      onClick={() => void toggleReveal(f.key)}
                    >
                      {isRevealed ? "🙈" : "👁"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {couriers && (
            <div className="min-w-0">
              <Lbl>Linked courier</Lbl>
              <select
                className="w-full min-w-0 rounded-xl px-3 py-2.5 text-[13px] outline-none bg-white"
                style={{ border: "1.5px solid #e6dfee" }}
                value={courierId}
                onChange={(e) => setCourierId(e.target.value)}
              >
                <option value="">— not linked —</option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {s.provider === "WHATSAPP" && (
          <>
            <WhatsAppTestRow brand={brand} onError={onError} />
            <WhatsAppTemplateRow brand={brand} onError={onError} />
          </>
        )}

        {(s.provider === "SMS" || s.provider === "EMAIL") && (
          <MessagingTestRow channel={s.provider} brand={brand} onError={onError} />
        )}

        {s.lastCheckedAt && (
          <p className="text-[10.5px] text-body-soft">
            Last checked {new Date(s.lastCheckedAt).toLocaleString()} —{" "}
            {s.lastCheckOk ? "worked" : "failed"}{s.lastCheckNote ? `: ${s.lastCheckNote}` : ""}
          </p>
        )}

        <button
          className="w-full py-3 rounded-xl text-white font-extrabold text-[13px] tracking-wide transition-transform active:scale-[0.98] disabled:opacity-40 mt-auto"
          style={{ background: brand.grad, boxShadow: `0 4px 14px ${brand.glow}` }}
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Update Info"}
        </button>

        {s.hasSandbox && !s.isLive && s.isEnabled && (
          <p className="text-[11px] leading-relaxed" style={{ color: TONE.rose.text }}>
            Sandbox: payments look successful, no money moves.
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*
  "The key is saved" and "the key works" are different claims. This row is the
  only proof of the second: it sends Meta's pre-approved `hello_world` to a
  number you choose.

  Our own templates are not used here on purpose — approval takes hours, and
  whether the key works needs answering in thirty seconds.

  On a test number Meta only delivers to the five numbers registered with it.
  Anything else is refused, and that refusal says nothing about the key.
*/

/*
  Same claim as the WhatsApp row — "saved" and "works" are different — for the
  channels that have no sandbox at all. The test costs one real SMS (or one
  email), which is the cheapest possible proof.
*/
function MessagingTestRow({
  channel, brand, onError,
}: {
  channel: "SMS" | "EMAIL";
  brand: { grad: string; glow: string; solid: string };
  onError: (msg: string) => void;
}) {
  const sms = channel === "SMS";
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function send() {
    if (!to.trim()) return;
    setBusy(true); setResult(null);
    try {
      const r = await messagingTestSend(channel, to.trim());
      setResult(
        r.ok
          ? { ok: true, msg: sms ? `Sent — check the phone ${to.trim()}.` : `Sent — check the inbox of ${to.trim()}.` }
          : { ok: false, msg: r.error || "The provider refused it. The full answer is in Marketing → Messaging history." },
      );
    } catch (e) {
      setResult({ ok: false, msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-[#f0edf5]">
      <Lbl>Check the keys actually work</Lbl>
      <div className="flex flex-wrap gap-1.5 items-center">
        <input
          className="flex-1 min-w-[180px] border-2 rounded-2xl px-3.5 py-3 text-[13.5px] outline-none bg-[#faf8fc] transition-all focus:bg-white"
          style={{ borderColor: "#ece5f2" }}
          onFocus={(e) => { e.currentTarget.style.borderColor = brand.solid; e.currentTarget.style.boxShadow = `0 0 0 4px ${brand.glow}`; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#ece5f2"; e.currentTarget.style.boxShadow = "none"; }}
          placeholder={sms ? "01712345678" : "you@example.com"}
          value={to}
          inputMode={sms ? "tel" : "email"}
          autoComplete="off"
          onChange={(e) => setTo(e.target.value)}
        />
        <button
          type="button"
          className="shrink-0 px-5 py-3 rounded-2xl text-white font-extrabold text-[13px] transition-transform active:scale-[0.98] disabled:opacity-40"
          style={{ background: brand.grad, boxShadow: `0 6px 18px ${brand.glow}` }}
          disabled={busy || !to.trim()}
          onClick={() => void send()}
        >
          {busy ? "Sending…" : "Send test"}
        </button>
      </div>
      {result && (
        <p
          className="text-[11.5px] leading-relaxed mt-2"
          style={{ color: result.ok ? TONE.emerald.text : TONE.rose.text }}
        >
          {result.ok ? "✓ " : "✗ "}{result.msg}
        </p>
      )}
      {!result && (
        <p className="text-[11px] text-body-soft mt-1.5">
          {sms
            ? "Sends one real SMS to this number — costs one message, proves the key."
            : "Sends one real email to this address — the only proof the key works."}
        </p>
      )}
    </div>
  );
}

function WhatsAppTestRow({
  brand, onError,
}: {
  brand: { grad: string; glow: string; solid: string };
  onError: (msg: string) => void;
}) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function send() {
    if (!to.trim()) return;
    setBusy(true); setResult(null);
    try {
      const r = await waTestSend(to.trim());
      setResult(
        r.sent
          ? { ok: true, msg: `Sent — check WhatsApp on ${to.trim()}.` }
          : !r.configured
            ? { ok: false, msg: "No keys saved yet. Add the Phone number ID and access token, then press Update." }
            : { ok: false, msg: "Keys are saved, but Meta refused the message. The reason is in the API log (radian_api_logs.bat). Usually: an expired token, the wrong Phone number ID, or a number not on the test number's allowed list." },
      );
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-[#f0edf5]">
      <Lbl>Check the keys actually work</Lbl>
      <div className="flex flex-wrap gap-1.5 items-center">
        <input
          className="flex-1 min-w-[180px] border-2 rounded-2xl px-3.5 py-3 text-[13.5px] outline-none bg-[#faf8fc] transition-all focus:bg-white"
          style={{ borderColor: "#ece5f2" }}
          onFocus={(e) => { e.currentTarget.style.borderColor = brand.solid; e.currentTarget.style.boxShadow = `0 0 0 4px ${brand.glow}`; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#ece5f2"; e.currentTarget.style.boxShadow = "none"; }}
          placeholder="01712345678"
          value={to}
          inputMode="tel"
          autoComplete="off"
          onChange={(e) => setTo(e.target.value)}
        />
        <button
          type="button"
          className="shrink-0 px-5 py-3 rounded-2xl text-white font-extrabold text-[13px] transition-transform active:scale-[0.98] disabled:opacity-40"
          style={{ background: brand.grad, boxShadow: `0 6px 18px ${brand.glow}` }}
          disabled={busy || !to.trim()}
          onClick={() => void send()}
        >
          {busy ? "Sending…" : "Send test"}
        </button>
      </div>
      {result && (
        <p
          className="text-[11.5px] leading-relaxed mt-2"
          style={{ color: result.ok ? TONE.emerald.text : TONE.rose.text }}
        >
          {result.ok ? "✓ " : "✗ "}{result.msg}
        </p>
      )}
      {!result && (
        <p className="text-[11px] text-body-soft mt-1.5">
          Sends Meta&rsquo;s own <code>hello_world</code> — the only way to prove the
          keys work before our templates are approved.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*
  Submits every template to Meta in one click. The wording already lives in
  code, so filling the same form six times in WhatsApp Manager would only be a
  chance to mistype one — and it has to be done at least twice, once on the
  test account and again on the real one.

  Meta approves, not this button. Submitted and working are shown separately
  because PENDING can sit for hours and then come back REJECTED.

  "Already exists" is not a failure. Pressing the button twice is the normal
  thing to do, and colouring that red would be a false alarm.
*/

const TPL_TONE: Record<string, "emerald" | "amber" | "rose" | "slate"> = {
  APPROVED: "emerald",
  PENDING: "amber",
  "ALREADY EXISTS": "emerald",
  REJECTED: "rose",
  "NOT SUBMITTED": "slate",
};

function WhatsAppTemplateRow({
  brand, onError,
}: {
  brand: { grad: string; glow: string; solid: string };
  onError: (msg: string) => void;
}) {
  const [rows, setRows] = useState<ApiTemplateResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState<ApiTemplateResult[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    getWaTemplateStatus()
      .then((r) => setRows(r.configured ? r.templates : null))
      .catch(() => setRows(null));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function submit() {
    setBusy(true); setNote("");
    try {
      const r = await submitWaTemplates();
      if (!r.configured) {
        setNote("Both the WABA ID and the access token are needed — the two boxes above.");
        setFailed([]);
      } else {
        const bad = r.results.filter((x) => !x.ok);
        const good = r.results.length - bad.length;
        setNote(
          bad.length
            ? `${good} of ${r.results.length} submitted. Meta refused ${bad.length} — reasons below.`
            : `${good} of ${r.results.length} submitted. Meta reviews them next — minutes to a few hours.`,
        );
        setFailed(bad);
      }
      refresh();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /*
    Collapsed by default: six chips and two buttons made the WhatsApp card
    twice as tall as its neighbours (owner, 7 Aug). The closed row still
    answers the only daily question — how many are approved.
  */
  const approved = (rows ?? []).filter(
    (t) => t.status === "APPROVED" || t.status === "ALREADY EXISTS",
  ).length;
  const attention = failed.length > 0 || (rows ?? []).some((t) => t.status === "REJECTED");

  return (
    <div className="mt-4 pt-3 border-t border-[#f0edf5]">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 py-1"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-[12px] font-bold text-body">Message templates</span>
        <span className="flex items-center gap-2">
          {rows && (
            <span
              className="text-[10.5px] font-extrabold px-2 py-0.5 rounded-full"
              style={{
                background: attention ? TONE.rose.soft : approved === rows.length ? TONE.emerald.soft : TONE.amber.soft,
                color: attention ? TONE.rose.text : approved === rows.length ? TONE.emerald.text : TONE.amber.text,
              }}
            >
              {approved}/{rows.length} approved
            </span>
          )}
          <span className="text-[11px] text-body-soft transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }}>▾</span>
        </span>
      </button>

      {open && (
        <div className="mt-2.5">
          <p className="text-[11px] text-body-soft mb-2">
            The wording lives in the code — one click submits all six to Meta.
          </p>
          {rows && (
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {rows.map((t) => (
                <span
                  key={t.name}
                  className="text-[10.5px] font-semibold px-2 py-1 rounded-full"
                  style={{
                    background: TONE[TPL_TONE[t.status ?? ""] ?? "slate"].soft,
                    color: TONE[TPL_TONE[t.status ?? ""] ?? "slate"].text,
                  }}
                  title={t.error ?? t.status ?? ""}
                >
                  {t.name} · {t.status ?? (t.ok ? "OK" : "?")}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="px-4 py-2.5 rounded-xl text-white font-extrabold text-[12px] transition-transform active:scale-[0.98] disabled:opacity-40"
              style={{ background: brand.grad, boxShadow: `0 4px 12px ${brand.glow}` }}
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "Submitting…" : "Create templates in Meta"}
            </button>
            <button className={btnGhost} disabled={busy} onClick={refresh}>
              Check status
            </button>
          </div>

          {note && <p className="text-[11.5px] text-body-soft mt-2">{note}</p>}

          {failed.length > 0 && (
            <ul className="mt-2 space-y-1">
              {failed.map((f) => (
                <li key={f.name} className="text-[11.5px] leading-relaxed" style={{ color: TONE.rose.text }}>
                  <strong>{f.name}</strong> — {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
