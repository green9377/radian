"use client";

/*
  ═══════════════════════════════════════════════════════════════════════════
  হারানো order ফেরানো — DEC-WA-002…008 (মালিকের সিদ্ধান্ত, ৬ আগস্ট ২০২৬)।

  দুটো জিনিস এক পর্দায়, কারণ দুটো একই কাজের দুই দিক:
    · নিয়ম — কখন, কতবার, কতদিন
    · তালিকা — কারা ছেড়ে গেছেন, যাতে staff ফোন করতে পারে

  ⚠️ ফোনের তালিকাটা বার্তার চেয়ে কম জরুরি নয়। মালিকের কথা: "৯০ দিন এদের
  customer-এ convert করার চেষ্টা করব"। বড় অঙ্কের cart-এ একটা ফোন প্রায়
  সবসময়ই একটা template-এর চেয়ে ভালো কাজ করে।
  ═══════════════════════════════════════════════════════════════════════════
*/

import { useCallback, useEffect, useState } from "react";
import {
  ApiCheckoutLead, ApiRecoverySettings,
  getRecoverySettings, listCheckoutLeads, runRecoverySweep, saveRecoverySettings,
} from "../_data/api";
import {
  Banner, Card, Chip, Empty, FinHeader, Flash, Panel, TONE, WRAP,
  btnGhost, btnPrimary, btnPrimaryStyle, input, Lbl, Money, Tabs, Td, Th,
} from "./FinanceUI";

const STAGE_LABEL: Record<string, string> = {
  CART: "reached the cart",
  DETAILS: "gave name and phone",
  DELIVERY: "gave an address",
  PAYMENT: "went to pay",
};

const STATUS_TONE: Record<string, "emerald" | "amber" | "sky" | "slate"> = {
  CONVERTED: "emerald",
  OPEN: "amber",
  MESSAGED: "sky",
  SKIPPED: "slate",
};

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

export default function RecoveryView() {
  const [s, setS] = useState<ApiRecoverySettings | null>(null);
  const [leads, setLeads] = useState<ApiCheckoutLead[] | null>(null);
  const [tab, setTab] = useState<"OPEN" | "MESSAGED" | "CONVERTED" | "SKIPPED">("OPEN");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const flash = (m: string) => { setOk(m); setErr(""); setTimeout(() => setOk(""), 4000); };

  const load = useCallback(() => {
    getRecoverySettings().then(setS).catch((e) => setErr((e as Error).message));
    listCheckoutLeads(tab).then(setLeads).catch(() => setLeads([]));
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const set = <K extends keyof ApiRecoverySettings>(k: K, v: ApiRecoverySettings[K]) =>
    setS((x) => (x ? { ...x, [k]: v } : x));

  async function save() {
    if (!s) return;
    setBusy(true);
    try {
      setS(await saveRecoverySettings(s));
      flash("Saved");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sweep() {
    setBusy(true);
    try {
      const r = await runRecoverySweep();
      flash(`Ran — ${JSON.stringify(r)}`);
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing" emoji="↩"
        title="Recover lost orders"
        sub="Failed payments and unfinished checkouts — who gets reminded, and when"
      />
      <Flash ok={ok} err={err} />

      {s && !s.recoveryEnabled && (
        <Banner tone="amber" emoji="⚠" title="Everything is switched off">
          The master switch is off, so nothing is sent whatever the settings
          below say. Before turning it on, check the templates are approved in
          Meta — otherwise every message will be refused.
        </Banner>
      )}

      {s && s.recoveryEnabled && !s.sweeperEnabled && (
        <Banner tone="sky" emoji="ⓘ" title="Scheduled runs are off (correct for Demo)">
          Immediate messages still go out, but &ldquo;again after 24 hours&rdquo;
          and &ldquo;15 minutes later&rdquo; will not fire on their own. That is
          deliberate here — a timer waking the free database burns its monthly
          quota. Use <strong>Run now</strong> below to test. Turn this on for the
          real shop.
        </Banner>
      )}

      {/* ───────────── rules ───────────── */}
      <div className="mt-5">
        <Panel emoji="⚙" tone="brand" title="Rules" sub="Every number lives here — none of it is hardcoded">
          {!s ? (
            <div className="p-4 text-[13px] text-body-soft">Loading…</div>
          ) : (
            <div className="p-4 space-y-4">
              <Toggle
                on={s.recoveryEnabled}
                onChange={(v) => set("recoveryEnabled", v)}
                title="Recovery on"
                sub="With this off, nothing below happens at all"
              />

              <div className="border-t border-[#f0edf5] pt-4 space-y-3">
                <Toggle
                  on={s.paymentFailedEnabled}
                  onChange={(v) => set("paymentFailedEnabled", v)}
                  title="Message when a payment fails"
                  sub="The order exists, only the money is missing — the easiest kind to win back"
                />
                <div className="max-w-[280px]">
                  <Lbl>Send again after (hours)</Lbl>
                  <input
                    className={input} type="number" min={0} max={72}
                    value={s.paymentFailedRetryHours}
                    onChange={(e) => set("paymentFailedRetryHours", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-body-soft mt-1">
                    0 means no second message. If the money arrives first, it is
                    skipped anyway.
                  </p>
                </div>
              </div>

              <div className="border-t border-[#f0edf5] pt-4 space-y-3">
                <Toggle
                  on={s.abandonedEnabled}
                  onChange={(v) => set("abandonedEnabled", v)}
                  title="Message when a checkout is abandoned"
                  sub="Meta counts this as Marketing — it costs more, and the opt-out list is honoured"
                />
                <div className="max-w-[280px]">
                  <Lbl>Quiet for (minutes)</Lbl>
                  <input
                    className={input} type="number" min={5} max={1440}
                    value={s.abandonedAfterMinutes}
                    onChange={(e) => set("abandonedAfterMinutes", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-body-soft mt-1">
                    Five minutes is the floor. A bKash or card OTP takes longer
                    than that, and anything shorter would message someone who is
                    in the middle of paying.
                  </p>
                </div>
              </div>

              <div className="border-t border-[#f0edf5] pt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Lbl>Keep unfinished checkouts for (days)</Lbl>
                  <input
                    className={input} type="number" min={1} max={365}
                    value={s.leadRetentionDays}
                    onChange={(e) => set("leadRetentionDays", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-body-soft mt-1">
                    Deleted automatically after that. Phone numbers of people who
                    bought nothing are a liability to keep, not an asset.
                  </p>
                </div>
                <div>
                  <Lbl>Phone number shown in the messages</Lbl>
                  <input
                    className={input} placeholder="Falls back to Company settings"
                    value={s.supportPhone ?? ""}
                    onChange={(e) => set("supportPhone", e.target.value)}
                  />
                </div>
              </div>

              <div className="border-t border-[#f0edf5] pt-4 space-y-3">
                <Toggle
                  on={s.sweeperEnabled}
                  onChange={(v) => set("sweeperEnabled", v)}
                  title="Run on a schedule"
                  sub="Leave off in Demo — a timer waking the free database burns its monthly quota. On for the real shop."
                />
                <div className="max-w-[280px]">
                  <Lbl>Every (minutes)</Lbl>
                  <input
                    className={input} type="number" min={1} max={120}
                    value={s.sweeperEveryMinutes}
                    onChange={(e) => set("sweeperEveryMinutes", Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                <button className={btnPrimary} style={btnPrimaryStyle} disabled={busy} onClick={() => void save()}>
                  {busy ? "Saving…" : "Save"}
                </button>
                <button className={btnGhost} disabled={busy} onClick={() => void sweep()}>
                  Run now
                </button>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ───────────── the list ───────────── */}
      <div className="mt-5">
        <Panel
          emoji="☎" tone="sky"
          title="Unfinished checkouts"
          sub="Who stopped, and how far they got — the list to call from"
        >
          <div className="p-4">
            <Tabs
              value={tab}
              onChange={(v) => setTab(v as typeof tab)}
              items={[
                { key: "OPEN", label: "Still open", tone: "amber" },
                { key: "MESSAGED", label: "Messaged", tone: "sky" },
                { key: "CONVERTED", label: "Ordered", tone: "emerald" },
                { key: "SKIPPED", label: "Skipped", tone: "slate" },
              ]}
            />

            {!leads ? (
              <p className="text-[13px] text-body-soft mt-4">Loading…</p>
            ) : leads.length === 0 ? (
              <div className="mt-4">
                <Empty
                  emoji="✦"
                  title="Nothing here yet"
                  sub="A row appears once a shopper types a name or phone number at checkout."
                />
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr>
                      <Th>Who</Th>
                      <Th>How far</Th>
                      <Th>What they left</Th>
                      <Th right>Value</Th>
                      <Th>When</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l) => (
                      <tr key={l.id} className="border-t border-[#f4f1f8] align-top">
                        <Td>
                          <div className="font-semibold text-purple">{l.name || "No name given"}</div>
                          {l.phone && (
                            <a href={`tel:${l.phone}`} className="text-[12.5px] text-body">
                              {l.phone}
                            </a>
                          )}
                          {l.email && <div className="text-[11.5px] text-body-soft">{l.email}</div>}
                        </Td>
                        <Td>
                          <Chip tone="slate">{STAGE_LABEL[l.stage] ?? l.stage}</Chip>
                          {typeof l.draft?.address === "string" && l.draft.address && (
                            <p className="text-[11.5px] text-body-soft mt-1 max-w-[220px]">
                              {String(l.draft.address)}
                            </p>
                          )}
                        </Td>
                        <Td>
                          {l.cart?.summary?.length ? (
                            <ul className="text-[12px] text-body space-y-0.5 max-w-[240px]">
                              {l.cart.summary.slice(0, 3).map((c, i) => (
                                <li key={i}>
                                  {c.qty ? `${c.qty} × ` : ""}{c.name ?? "—"}
                                  {c.size ? ` (${c.size})` : ""}
                                </li>
                              ))}
                              {l.cart.summary.length > 3 && (
                                <li className="text-body-soft">+{l.cart.summary.length - 3} more</li>
                              )}
                            </ul>
                          ) : (
                            <span className="text-body-soft">—</span>
                          )}
                        </Td>
                        <Td right><Money paisa={l.totalPaisa} bold /></Td>
                        <Td>
                          <span className="text-[12px] text-body-soft">{ago(l.lastSeenAt)}</span>
                        </Td>
                        <Td>
                          <Chip tone={STATUS_TONE[l.status] ?? "slate"}>{l.status}</Chip>
                          {l.skipReason && (
                            <p className="text-[11px] text-body-soft mt-1 max-w-[180px]">{l.skipReason}</p>
                          )}
                          {l.messageError && (
                            <p className="text-[11px] mt-1 max-w-[180px]" style={{ color: TONE.rose.text }}>
                              {l.messageError}
                            </p>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Toggle({
  on, onChange, title, sub,
}: {
  on: boolean; onChange: (v: boolean) => void; title: string; sub?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13.5px] font-bold text-purple">{title}</div>
        {sub && <p className="text-[11.5px] text-body-soft leading-relaxed mt-0.5">{sub}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!on)}
        className="relative rounded-full shrink-0 transition-all mt-0.5"
        style={{
          width: 48, height: 28,
          background: on ? TONE.emerald.bg : "#ded7e8",
        }}
      >
        <span
          className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-all"
          style={{ width: 22, height: 22, left: on ? 48 - 22 - 3 : 3 }}
        />
      </button>
    </div>
  );
}
