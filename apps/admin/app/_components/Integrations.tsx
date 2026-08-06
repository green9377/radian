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
  getIntegrations, saveIntegration, waTestSend,
} from "../_data/api";
import {
  Banner, Card, Chip, FinHeader, Flash, Panel, TONE, WRAP,
  btnGhost, btnPrimary, btnPrimaryStyle, input, Lbl,
} from "./FinanceUI";

/*
  PAYMENT GATEWAY CARDS — redesign, 6 Aug 2026.

  মালিকের অনুরোধ: পুরনো সাইটের Payment Gateways পাতা দেখিয়ে বললেন এটা অনেক
  সুন্দর সাজানো, আর এই পাতাটা "baje" (খারাপ)। তুলনা করে দেখা গেল আসল পার্থক্যটা
  ফাংশনের না — SSLCommerz/bKash/Nagad এখানে আগে থেকেই পুরোপুরি কাজ করে
  (save, sandbox/live, validation সব আছে)। পার্থক্যটা শুধু চেহারায়: পুরনো
  পাতায় প্রতিটা gateway-র নিজস্ব রং/লোগো আছে, field সবসময় খোলা দেখা যায়,
  বড় toggle switch — আর এখানে সব ধূসর card, click করে "Edit" চাপলে তবেই
  field দেখা যায়।

  ⚠️ যা ইচ্ছাকৃতভাবে কপি করা হয়নি: পুরনো পাতায় Store Password/API Key
  সবসময় plaintext-এ খোলা দেখাচ্ছিল (মালিক নিজেই মার্কার দিয়ে ঢেকেছেন
  screenshot-এ)। এখানে backend কখনো পুরো secret ফেরত পাঠায় না
  (integrations.service.ts-এর mask() — শেষ ৪ অক্ষর ছাড়া সব ঢাকা), তাই
  "reveal" বাটন আসল secret কখনো দেখাতে পারবে না — এটা এই আর্কিটেকচারের
  ইচ্ছাকৃত নিরাপত্তা, বাগ না। চোখ-আইকন শুধু আপনি এইমাত্র যা টাইপ করলেন সেটা
  দেখাবে (নতুন key ঠিক টাইপ হয়েছে কিনা যাচাইয়ের জন্য), আগের সেভ করা key না।
*/

/*  ৬ আগস্ট (বিকেল) — মালিক Messaging পাতাটা দেখে বললেন এটাও Payment-এর মতো
    সাজানো চাই। তাই brand map আর hero card দুটোই Payment-এর একার জিনিস থেকে
    সরিয়ে যেকোনো group-এর জন্য খোলা হলো। WhatsApp-এর চাবি ঠিকমতো বসেছে কিনা
    সেটা দেখতে পারাটা bKash-এর চাবির মতোই জরুরি — কম জরুরি দেখানোর কারণ নেই। */
const HERO_BRAND: Record<string, { grad: string; badge: string; ring: string; glow: string; solid: string }> = {
  SSLCOMMERZ: { grad: "linear-gradient(135deg,#062c47,#0a3d62 45%,#3c8dbc)", badge: "SC", ring: "#3c8dbc", glow: "rgba(10,61,98,0.35)", solid: "#0a3d62" },
  BKASH:      { grad: "linear-gradient(135deg,#8f0c47,#d6136c 45%,#ff5da2)", badge: "bK", ring: "#d6136c", glow: "rgba(214,19,108,0.35)", solid: "#d6136c" },
  NAGAD:      { grad: "linear-gradient(135deg,#9a3c0a,#e2691a 45%,#f7a339)", badge: "ন", ring: "#e2691a", glow: "rgba(226,105,26,0.35)", solid: "#e2691a" },
  WHATSAPP:   { grad: "linear-gradient(135deg,#04463f,#0b7a68 45%,#25d366)", badge: "✆", ring: "#0b7a68", glow: "rgba(11,122,104,0.35)", solid: "#0b7a68" },
  EMAIL:      { grad: "linear-gradient(135deg,#1e2a5a,#2f4bab 45%,#6f8ff0)", badge: "✉", ring: "#2f4bab", glow: "rgba(47,75,171,0.32)", solid: "#2f4bab" },
  SMS:        { grad: "linear-gradient(135deg,#3f3a52,#5b5468 45%,#9f97b3)", badge: "▤", ring: "#5b5468", glow: "rgba(91,84,104,0.30)", solid: "#5b5468" },
};
const brandFor = (provider: string) =>
  HERO_BRAND[provider] ??
  { grad: TONE.brand.grad, badge: provider.slice(0, 2).toUpperCase(), ring: TONE.brand.bg, glow: "rgba(160,33,184,0.3)", solid: TONE.brand.bg };

/** যেসব group বড় branded card পায় — বাকিরা কমপ্যাক্ট ServiceCard-এই থাকে */
const HERO_KINDS: ApiIntKind[] = ["PAYMENT", "MESSAGING"];

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

      <div className="space-y-5">
        {groups.map((g) => (
          <Panel
            key={g.kind}
            emoji={EMOJI_FOR[g.kind]}
            tone={TONE_FOR[g.kind]}
            title={g.label}
            sub={g.blurb}
          >
            <div className="p-4 space-y-3">
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
                HERO_KINDS.includes(g.kind) ? (
                  <HeroServiceCard
                    key={s.provider} s={s}
                    onSaved={(m) => { flash(m); load(); }} onError={setErr}
                  />
                ) : (
                  <ServiceCard
                    key={s.provider} s={s}
                    couriers={g.kind === "COURIER" ? data?.couriers : undefined}
                    onSaved={(m) => { flash(m); load(); }} onError={setErr}
                  />
                )
              ))}
            </div>
          </Panel>
        ))}
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

function ServiceCard({
  s, couriers, onSaved, onError,
}: {
  s: ApiIntegration;
  couriers?: { id: string; name: string }[];
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  /*  HeroServiceCard-এর সাথে এক নিয়ম (৬ আগস্ট, মালিক): Clear বোতাম নেই,
      হাতে মুছে Save চাপলেই মুছবে। দুই card-এ দুই আচরণ থাকলে একদিন কেউ
      ভুল জায়গায় ভুল প্রত্যাশা নিয়ে বসবে।  */
  const [typed, setTyped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [courierId, setCourierId] = useState(s.courierId ?? "");

  const complete = s.fieldsFilled === s.fieldsTotal;

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...extra };
      // যেখানে হাত পড়েছে শুধু সেটাই যায় — ফাঁকা হলে ফাঁকাই যায় (হাতে clear)
      for (const k of typed) body[k] = (edits[k] ?? "").trim();
      if (couriers) body.courierId = courierId || null;

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
    <Card
      className="p-4"
      style={{
        borderColor: s.isEnabled
          ? (s.kind === "PAYMENT" && !s.isLive ? TONE.rose.ring : TONE.emerald.ring)
          : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-bold text-purple">{s.label}</span>
            {s.isEnabled ? (
              s.hasSandbox && !s.isLive
                ? <Chip tone="rose">sandbox</Chip>
                : <Chip tone="emerald">on</Chip>
            ) : (
              <Chip tone="slate">off</Chip>
            )}
            <Chip tone={complete ? "sky" : "amber"}>
              {s.fieldsFilled}/{s.fieldsTotal} keys
            </Chip>
          </div>
          <p className="text-[12px] text-body leading-relaxed mt-1.5">{s.matters}</p>

          {/*  Where the wording/content lives, for the services that have some.
               Without this the split looks like a missing feature.  */}
          {s.contentAt && (
            <p className="text-[11.5px] mt-1.5">
              <Link href={s.contentAt.href} className="text-purple font-semibold">
                {s.contentAt.label} →
              </Link>
              <span className="text-body-soft"> (owned by that module, not here)</span>
            </p>
          )}

          {/*  "A key is saved" and "the key works" are different facts, reported
               separately. A green tick that only means "a string is present" is
               how a broken checkout looks healthy.  */}
          <p className="text-[11px] text-body-soft mt-1.5">
            {s.lastCheckedAt
              ? `Last checked ${new Date(s.lastCheckedAt).toLocaleString()} — ${s.lastCheckOk ? "worked" : "failed"}${s.lastCheckNote ? `: ${s.lastCheckNote}` : ""}`
              : "Never checked against the provider — a saved key is not a working key"}
          </p>
          {s.movedFrom && (
            <p className="text-[10.5px] text-body-soft mt-1">
              Carried across from <code>{s.movedFrom}</code>
            </p>
          )}
        </div>
        <button className={btnGhost} onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : complete ? "Edit" : "Add keys"}
        </button>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-[#f0edf5] space-y-3">
          {s.fields.map((f) => {
            const touched = edits[f.key] !== undefined;
            const shown = touched ? edits[f.key] : (f.value ?? "");
            return (
              <div key={f.key}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Lbl>{f.label}</Lbl>
                  {f.value && !typed.has(f.key) && (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full mb-1"
                          style={{ background: TONE.emerald.soft, color: TONE.emerald.text }}>
                      SAVED
                    </span>
                  )}
                </div>
                <input
                  className={input}
                  type={f.secret ? "password" : "text"}
                  placeholder="not set"
                  value={shown}
                  /*  ⚠️ Chrome ignores "off". Only "new-password" is obeyed, and
                      on 29 July it filled the saved shop password into three of
                      these boxes.  */
                  autoComplete="new-password"
                  /*  লেখা সরে না, শুধু select হয়ে থাকে — HeroServiceCard-এর
                      মতোই। কারণ ওখানেই লেখা আছে।  */
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEdits((x) => ({ ...x, [f.key]: v }));
                    setTyped((t) => (t.has(f.key) ? t : new Set(t).add(f.key)));
                  }}
                />
                {f.hint && <p className="text-[11px] text-body-soft mt-1">{f.hint}</p>}
              </div>
            );
          })}

          {couriers && (
            <div>
              <Lbl>Which courier is this?</Lbl>
              <select className={input} value={courierId}
                      onChange={(e) => setCourierId(e.target.value)}>
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

          <div className="flex flex-wrap gap-1.5 pt-1">
            <button className={btnPrimary} style={btnPrimaryStyle} disabled={busy}
                    onClick={() => void save()}>
              {busy ? "Saving…" : "Save keys"}
            </button>

            {s.hasSandbox && (
              <button className={btnGhost} disabled={busy}
                      onClick={() => void save({ isLive: !s.isLive })}>
                {s.isLive ? "Switch to sandbox" : "Switch to LIVE"}
              </button>
            )}

            {/*  Switching ON is refused by the server while fields are empty — a
                 gateway that looks connected and fails when a customer pays is
                 worse than one that is plainly off.  */}
            <button className={btnGhost} disabled={busy}
                    onClick={() => void save({ isEnabled: !s.isEnabled })}>
              {s.isEnabled ? "Switch off" : "Switch on"}
            </button>
          </div>

          {s.hasSandbox && !s.isLive && (
            <p className="text-[11px] leading-relaxed" style={{ color: TONE.amber.text }}>
              Sandbox keys and live keys are different keys. Switching to live
              without pasting the live ones in will simply stop working.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- */
/*  HERO CARD — always-open, branded. Same data + same save() calls as
    ServiceCard; only the shell is different. Payment got it first (6 Aug,
    সকাল); Messaging joined the same day বিকেলে।

    ⚠️ ৬ আগস্ট (বিকেল) — মালিকের দুটো অভিযোগ, দুটোই এই ফাংশনে:

    ১. "number token দেওয়ার পরেও তা আবার চলে যায়"।
       আগের আচরণ: box-এ ক্লিক করলেই লেখা মুছে ফাঁকা হয়ে যেত (onFocus)।
       না লিখে সরে গেলে ফাঁকাই থেকে যেত — চোখে দেখাত "চাবি হারিয়ে গেছে",
       আর তার চেয়ে খারাপ, ওই ফাঁকা box দেখে আবার Save চাপলে সত্যিই মুছে
       যাওয়ার ঝুঁকি ছিল। এখন: ক্লিকে ফাঁকা হয় (যাতে নতুন key টাইপ করতে
       গিয়ে পুরনো অক্ষরের সাথে লড়তে না হয়), কিন্তু **একটা অক্ষরও না
       লিখে সরে গেলে সংরক্ষিত মানটা নিজে থেকেই ফিরে আসে** (`typed` flag)।

    ২. "clear option দরকার নাই, হাত দিয়ে ধরে clear করব"।
       Clear বোতাম বাদ। এখন নিয়মটা সহজ:
         box ছুঁইনি          → কিছু পাঠাই না, কিছু বদলায় না
         লিখেছি              → নতুন মান যায়
         লিখে সব মুছে দিয়েছি → খালি মান যায় = মুছে গেল (হাতে করা clear)  */

function HeroServiceCard({
  s, onSaved, onError,
}: {
  s: ApiIntegration;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const brand = brandFor(s.provider);
  const [edits, setEdits] = useState<Record<string, string>>({});
  /** কোন box-এ সত্যিই টাইপ হয়েছে — শুধু ক্লিক করা "টাইপ করা" নয় */
  const [typed, setTyped] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const complete = s.fieldsFilled === s.fieldsTotal;

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...extra };
      // যেখানে হাত পড়েছে শুধু সেটাই যায় — ফাঁকা হলে ফাঁকাই যায় (হাতে clear)
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
      {/*  HERO — full-bleed brand colour, not a thin strip. This is the part
          that has to read as "this is bKash" from across the room, the way
          the reference the owner sent does.  */}
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

      {/*  Body overlaps the hero slightly, like a bottom sheet — the seam is
          where "brand" hands off to "form", and it should look intentional. */}
      <div className="relative -mt-4 rounded-t-[22px] bg-white px-5 pt-5 pb-5">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full"
                style={{ background: complete ? TONE.sky.soft : TONE.amber.soft, color: complete ? TONE.sky.text : TONE.amber.text }}>
            {s.fieldsFilled}/{s.fieldsTotal} KEYS
          </span>
          {s.hasSandbox && (
            <button
              type="button" disabled={busy}
              onClick={() => void save({ isLive: !s.isLive })}
              className="text-[11px] font-extrabold px-2.5 py-1 rounded-full text-white transition-transform active:scale-95"
              style={{ background: s.isLive ? "#16a34a" : "#dc2626" }}
            >
              {s.isLive ? "● LIVE — tap for sandbox" : "● SANDBOX — tap for live"}
            </button>
          )}
        </div>

        <p className="text-[12.5px] text-body leading-relaxed mb-4">{s.matters}</p>

        {/*  Fields are always visible — no "Add keys" click needed, matching
            the reference layout the owner pointed to.  */}
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {s.fields.map((f) => {
            const isRevealed = revealed.has(f.key);
            const touched = edits[f.key] !== undefined;
            const didType = typed.has(f.key);
            const shown = touched ? edits[f.key] : (f.value ?? "");
            const saved = Boolean(f.value);
            return (
              <div key={f.key} className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Lbl>{f.label}</Lbl>
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
                      /*  ⚠️ ৬ আগস্ট, দ্বিতীয় দফা। প্রথম চেষ্টায় ক্লিক করলে ঘর
                          ফাঁকা হয়ে যেত (না লিখে সরে গেলে ফিরে আসত)। মালিক
                          আবার একই কথা বললেন — "ঘরে ক্লিক দিলে information
                          চলে যায়"। ঠিকই বলেছেন: চোখে যেটা ঘটে সেটাই সত্যি,
                          পরে ফিরে আসবে কিনা তাতে কিছু যায় আসে না।

                          এখন লেখা সরেই না — শুধু পুরোটা SELECT হয়ে থাকে।
                          তাই নতুন key টাইপ করলে এক টানে পুরনোটার জায়গায়
                          বসে যায়, আর কিছু না করে সরে গেলে যেমন ছিল তেমনই।  */
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
                      title="Show what you just typed — a saved key can never be shown again, by design"
                      onClick={() => setRevealed((r) => {
                        const n = new Set(r);
                        n.has(f.key) ? n.delete(f.key) : n.add(f.key);
                        return n;
                      })}
                    >
                      {isRevealed ? "🙈" : "👁"}
                    </button>
                  )}
                </div>
                {f.hint && <p className="text-[11px] text-body-soft mt-1">{f.hint}</p>}
              </div>
            );
          })}
        </div>

        {/*  মালিকের নির্দেশ ৬ আগস্ট: Clear বোতাম নেই। নিয়মটা লিখে রাখা হলো,
             নাহলে "মুছব কীভাবে" প্রশ্নটা প্রতিবার ফিরে আসবে।  */}
        <p className="text-[11px] text-body-soft mt-2.5">
          একটা key মুছতে হলে ঘরে ক্লিক করে সব লেখা মুছে দিয়ে Update চাপুন।
          না ছুঁলে কিছুই বদলাবে না।
        </p>

        {s.provider === "WHATSAPP" && <WhatsAppTestRow brand={brand} onError={onError} />}

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
/*  WHATSAPP — "চাবি বসল" আর "চাবি কাজ করে" এক কথা নয়। এই সারিটা দ্বিতীয়টার
    একমাত্র প্রমাণ: নিজের নম্বরে Meta-র pre-approved `hello_world` যায়।

    ⚠️ ইচ্ছাকৃতভাবে নিজেদের template নয়। template approve হতে ঘণ্টা লাগে;
    চাবি ঠিক কিনা সেটা ৩০ সেকেন্ডে জানা দরকার। তাই Meta যেটা সব account-এ
    আগে থেকেই approve করে রাখে, সেটাই।

    ⚠️ test number-এর বেলায় শুধু আগে থেকে অনুমোদিত (সর্বোচ্চ ৫টা) নম্বরেই
    যাবে — অন্য নম্বর দিলে Meta ফিরিয়ে দেবে, চাবি ভুল বলে নয়।  */

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
          ? { ok: true, msg: `পাঠানো হয়েছে — ${to.trim()} নম্বরের WhatsApp দেখুন।` }
          : !r.configured
            ? { ok: false, msg: "চাবিই বসানো নেই। Phone number ID আর access token দিয়ে Update চাপুন।" }
            : { ok: false, msg: "চাবি আছে, কিন্তু Meta বার্তাটা ফিরিয়ে দিয়েছে। কারণ API log-এ (radian_api_logs.bat)। সাধারণ কারণ: token-এর মেয়াদ শেষ, ভুল Phone number ID, বা test number-এ নম্বরটা অনুমোদিত নয়।" },
      );
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-[#f0edf5]">
      <Lbl>চাবি সত্যিই কাজ করে কিনা দেখুন</Lbl>
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
          {busy ? "পাঠাচ্ছি…" : "Send test"}
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
          Meta-র নিজের <code>hello_world</code> বার্তা যাবে — নিজেদের template
          approve হওয়ার আগেই চাবি ঠিক কিনা প্রমাণ পাওয়ার একমাত্র উপায়।
        </p>
      )}
    </div>
  );
}
