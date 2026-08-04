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
  getIntegrations, saveIntegration,
} from "../_data/api";
import {
  Banner, Card, Chip, FinHeader, Flash, Panel, TONE, WRAP,
  btnGhost, btnPrimary, btnPrimaryStyle, input, Lbl,
} from "./FinanceUI";

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
                <ServiceCard
                  key={s.provider} s={s}
                  couriers={g.kind === "COURIER" ? data?.couriers : undefined}
                  onSaved={(m) => { flash(m); load(); }} onError={setErr}
                />
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
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [courierId, setCourierId] = useState(s.courierId ?? "");

  const complete = s.fieldsFilled === s.fieldsTotal;

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...extra };
      // only fields actually typed into are sent — a blank box means "untouched"
      for (const [k, v] of Object.entries(edits)) if (v.trim()) body[k] = v.trim();
      // ...unless Clear was pressed, which sends an explicit empty
      for (const k of cleared) body[k] = "";
      if (couriers) body.courierId = courierId || null;

      await saveIntegration(s.kind, s.provider, body);
      setEdits({}); setCleared(new Set());
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
          {s.fields.map((f) => (
            <div key={f.key}>
              <Lbl>{f.label}</Lbl>
              <div className="flex gap-1.5">
                <input
                  className={input}
                  type={f.secret ? "password" : "text"}
                  placeholder={
                    cleared.has(f.key) ? "will be cleared"
                      : f.value ? `${f.value} — leave blank to keep` : "not set"
                  }
                  value={edits[f.key] ?? ""}
                  /*  ⚠️ Chrome ignores "off". Only "new-password" is obeyed, and
                      on 29 July it filled the saved shop password into three of
                      these boxes.  */
                  autoComplete="new-password"
                  onChange={(e) => setEdits((x) => ({ ...x, [f.key]: e.target.value }))}
                />
                {f.value && (
                  <button
                    className={btnGhost}
                    onClick={() => setCleared((c) => {
                      const n = new Set(c);
                      n.has(f.key) ? n.delete(f.key) : n.add(f.key);
                      return n;
                    })}
                  >
                    {cleared.has(f.key) ? "Keep" : "Clear"}
                  </button>
                )}
              </div>
              {f.hint && <p className="text-[11px] text-body-soft mt-1">{f.hint}</p>}
            </div>
          ))}

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
