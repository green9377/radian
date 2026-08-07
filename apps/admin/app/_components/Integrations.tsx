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
  ApiIntegration, ApiIntegrationsOverview, ApiIntKind,
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

/** oversized on/off pill for the payment hero cards — the small Delivery
    Switch reads as an afterthought at this scale, so this one is its own size. */
function BigSwitch({ on, glow, onClick }: { on: boolean; glow: string; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="relative rounded-full shrink-0 transition-all"
      style={{
        width: 56, height: 32,
        background: on ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.22)",
        boxShadow: on ? `0 0 0 3px ${glow}` : "none",
      }}
    >
      <span
        className="absolute top-1/2 -translate-y-1/2 rounded-full shadow-md transition-all"
        style={{ width: 24, height: 24, left: on ? 56 - 24 - 4 : 4, background: on ? "#16a34a" : "#fff" }}
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
            <div className={only ? "space-y-4" : "p-4 space-y-4"}>
              {g.kind === "COURIER" && (
                <p className="text-[12px] text-body-soft leading-relaxed max-w-[720px]">
                  The couriers themselves — names and tracking links — live in{" "}
                  <Link href="/delivery/setup" className="text-purple font-semibold">
                    Delivery → Setup
                  </Link>
                  . Those are couriers you <em>use</em>. These are the keys to
                  their APIs, which is a different thing: Steadfast works today
                  with no key at all, by typing the consignment number in yourself.
                </p>
              )}
              {g.services.map((s) => (
                <ServiceCard
                  key={s.provider} s={s}
                  couriers={g.kind === "COURIER" ? data?.couriers : undefined}
                  onSaved={(m) => { flash(m); load(); }} onError={setErr}
                />
              ))}
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
    <div
      className="rounded-[26px] overflow-hidden bg-white transition-transform hover:-translate-y-[2px]"
      style={{ boxShadow: s.isEnabled ? `0 16px 40px ${brand.glow}` : "0 4px 16px rgba(40,20,50,0.08)" }}
    >
      {/*  Full-bleed brand colour, not a thin strip: the card has to read as
          "this is bKash" from across the room.  */}
      <div className="relative px-5 pt-6 pb-9 overflow-hidden" style={{ background: brand.grad }}>
        <div className="absolute -right-8 -top-16 w-52 h-52 rounded-full bg-white opacity-[0.10]" />
        <div className="absolute -left-10 -bottom-20 w-44 h-44 rounded-full bg-white opacity-[0.08]" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-16 h-16 rounded-2xl bg-white grid place-items-center text-[26px] font-display font-bold shrink-0 shadow-[0_6px_18px_rgba(0,0,0,0.25)]"
                 style={{ color: brand.solid }}>
              {brand.badge}
            </div>
            <div className="min-w-0">
              <div className="text-white font-display font-bold text-[22px] leading-tight truncate drop-shadow-sm">{s.label}</div>
              <div className="text-white/85 text-[11px] font-bold tracking-[0.12em] uppercase mt-1">
                {s.isEnabled ? (s.hasSandbox && !s.isLive ? "● Sandbox mode" : "● Live") : "○ Switched off"}
              </div>
            </div>
          </div>
          <BigSwitch on={s.isEnabled} glow="rgba(255,255,255,0.5)" onClick={() => void save({ isEnabled: !s.isEnabled })} />
        </div>
      </div>

      {/*  The body overlaps the head slightly, like a bottom sheet, so the
          seam between brand and form looks intentional. */}
      <div className="relative -mt-4 rounded-t-[22px] bg-white px-5 pt-5 pb-5">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full"
                style={{ background: complete ? TONE.sky.soft : TONE.amber.soft, color: complete ? TONE.sky.text : TONE.amber.text }}>
            {s.fieldsFilled}/{s.fieldsTotal} KEYS
          </span>
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

        <p className="text-[12.5px] text-body leading-relaxed mb-4">{s.matters}</p>

        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {s.fields.map((f) => {
            const isRevealed = revealed.has(f.key);
            const touched = edits[f.key] !== undefined;
            const didType = typed.has(f.key);
            const saved = Boolean(f.value);
            const shown = touched
              ? edits[f.key]
              : (revealed.has(f.key) && full[f.key] !== undefined ? full[f.key] : (f.value ?? ""));
            return (
              <div key={f.key} className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Lbl>{f.label}</Lbl>
                  {f.optional && (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full mb-1"
                          style={{ background: TONE.slate.soft, color: TONE.slate.text }}>
                      OPTIONAL
                    </span>
                  )}
                  {saved && !didType && (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full mb-1"
                          style={{ background: TONE.emerald.soft, color: TONE.emerald.text }}>
                      SAVED
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
                    className="w-full min-w-0 border-2 rounded-2xl px-3.5 py-3 text-[13.5px] outline-none bg-[#faf8fc] transition-all focus:bg-white"
                    style={{ borderColor: "#ece5f2" }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = brand.solid;
                      e.currentTarget.style.boxShadow = `0 0 0 4px ${brand.glow}`;
                      // Select, never clear: the text must not appear to vanish.
                      e.currentTarget.select();
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#ece5f2";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                    type={f.secret && !isRevealed ? "password" : "text"}
                    placeholder="not set"
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
                      className="shrink-0 w-11 h-11 rounded-2xl grid place-items-center text-[16px] border-2 transition-colors"
                      style={{ borderColor: "#ece5f2" }}
                      title={isRevealed ? "Hide again" : "Show the full key — every reveal is written to the audit trail"}
                      onClick={() => void toggleReveal(f.key)}
                    >
                      {isRevealed ? "🙈" : "👁"}
                    </button>
                  )}
                </div>
                {f.hint && <p className="text-[11px] text-body-soft mt-1">{f.hint}</p>}
              </div>
            );
          })}

          {couriers && (
            <div className="min-w-0">
              <Lbl>Which courier is this?</Lbl>
              <select
                className="w-full min-w-0 border-2 rounded-2xl px-3.5 py-3 text-[13.5px] outline-none bg-[#faf8fc] transition-all focus:bg-white"
                style={{ borderColor: "#ece5f2" }}
                value={courierId}
                onChange={(e) => setCourierId(e.target.value)}
              >
                <option value="">— not linked —</option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <p className="text-[11px] text-body-soft mt-1">
                Links these keys to the courier Delivery already knows about.
              </p>
            </div>
          )}
        </div>

        <p className="text-[11px] text-body-soft mt-2.5">
          To remove a key, click into the box, clear it and press Update. Fields
          you do not touch are never changed.
        </p>

        {s.provider === "WHATSAPP" && (
          <>
            <WhatsAppTestRow brand={brand} onError={onError} />
            <WhatsAppTemplateRow brand={brand} onError={onError} />
          </>
        )}

        {(s.provider === "SMS" || s.provider === "EMAIL") && (
          <MessagingTestRow channel={s.provider} brand={brand} onError={onError} />
        )}

        <p className="text-[11px] text-body-soft mt-4">
          {s.lastCheckedAt
            ? `Last checked ${new Date(s.lastCheckedAt).toLocaleString()} — ${s.lastCheckOk ? "worked" : "failed"}${s.lastCheckNote ? `: ${s.lastCheckNote}` : ""}`
            : "Never checked against the provider — a saved key is not a working key"}
        </p>
        {s.movedFrom && (
          <p className="text-[10.5px] text-body-soft mt-1">
            Carried across from <code>{s.movedFrom}</code>
          </p>
        )}

        <button
          className="w-full mt-4 py-3.5 rounded-2xl text-white font-extrabold text-[14px] tracking-wide shadow-lg transition-transform active:scale-[0.98] disabled:opacity-40"
          style={{ background: brand.grad, boxShadow: `0 8px 22px ${brand.glow}` }}
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "SAVING…" : "UPDATE INFO"}
        </button>

        {s.hasSandbox && !s.isLive && s.isEnabled && (
          <p className="text-[11px] leading-relaxed mt-3" style={{ color: TONE.rose.text }}>
            Sandbox accepts payments that never arrive — a customer sees
            success, no money moves. Switch to LIVE only with real keys pasted in.
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

  return (
    <div className="mt-4 pt-4 border-t border-[#f0edf5]">
      <Lbl>Radian&rsquo;s six templates</Lbl>
      <p className="text-[11px] text-body-soft mb-2.5">
        The wording lives in the code. One click submits all six to Meta —
        Meta approves them, which takes minutes to a few hours.
      </p>

      {rows && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {rows.map((t) => (
            <span
              key={t.name}
              className="text-[11px] font-semibold px-2 py-1 rounded-full"
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
          className="px-5 py-3 rounded-2xl text-white font-extrabold text-[13px] transition-transform active:scale-[0.98] disabled:opacity-40"
          style={{ background: brand.grad, boxShadow: `0 6px 18px ${brand.glow}` }}
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
  );
}
