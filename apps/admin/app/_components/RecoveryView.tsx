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
  CART: "cart পর্যন্ত",
  DETAILS: "নাম-নম্বর দিয়েছেন",
  DELIVERY: "ঠিকানা দিয়েছেন",
  PAYMENT: "টাকা দিতে গিয়েছিলেন",
};

const STATUS_TONE: Record<string, "emerald" | "amber" | "sky" | "slate"> = {
  CONVERTED: "emerald",
  OPEN: "amber",
  MESSAGED: "sky",
  SKIPPED: "slate",
};

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m} মিনিট আগে`;
  if (m < 1440) return `${Math.round(m / 60)} ঘণ্টা আগে`;
  return `${Math.round(m / 1440)} দিন আগে`;
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
      flash(`চালানো হয়েছে — ${JSON.stringify(r)}`);
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
        title="হারানো order ফেরানো"
        sub="পেমেন্ট ফেল, আর অসমাপ্ত checkout — কাকে কখন মনে করিয়ে দেওয়া হবে"
      />
      <Flash ok={ok} err={err} />

      {s && !s.recoveryEnabled && (
        <Banner tone="amber" emoji="⚠" title="সব বন্ধ আছে">
          মাস্টার সুইচ বন্ধ, তাই কোনো বার্তাই যাচ্ছে না — নিচের বাকি
          সেটিংগুলো যা-ই থাকুক। চালু করার আগে template তিনটে Meta-তে approve
          হয়েছে কিনা দেখে নিন, নইলে বার্তা পাঠাতে গিয়ে ফেরত আসবে।
        </Banner>
      )}

      {s && s.recoveryEnabled && !s.sweeperEnabled && (
        <Banner tone="sky" emoji="ⓘ" title="সময়মতো চালানো বন্ধ (Demo-র জন্য এটাই ঠিক)">
          সাথে সাথের বার্তাগুলো যাবে, কিন্তু &ldquo;২৪ ঘণ্টা পর&rdquo; আর
          &ldquo;১৫ মিনিট পর&rdquo; নিজে থেকে চলবে না। ফ্রি ডেটাবেজের মাসিক
          কোটা বাঁচাতে এটা ইচ্ছাকৃত — নিচের <strong>এখনই চালান</strong> বোতাম
          দিয়ে হাতে চালিয়ে দেখুন। আসল দোকানে এটা চালু রাখতে হবে।
        </Banner>
      )}

      {/* ───────────── নিয়ম ───────────── */}
      <div className="mt-5">
        <Panel emoji="⚙" tone="brand" title="নিয়ম" sub="প্রতিটা সংখ্যা এখানে — কোডে কিছু বসানো নেই">
          {!s ? (
            <div className="p-4 text-[13px] text-body-soft">লোড হচ্ছে…</div>
          ) : (
            <div className="p-4 space-y-4">
              <Toggle
                on={s.recoveryEnabled}
                onChange={(v) => set("recoveryEnabled", v)}
                title="সব চালু"
                sub="এটা বন্ধ থাকলে নিচের কিছুই ঘটে না"
              />

              <div className="border-t border-[#f0edf5] pt-4 space-y-3">
                <Toggle
                  on={s.paymentFailedEnabled}
                  onChange={(v) => set("paymentFailedEnabled", v)}
                  title="পেমেন্ট ফেল হলে বার্তা"
                  sub="order তৈরি আছে, টাকা আসেনি — সবচেয়ে সহজে ফেরানো যায় এমন order"
                />
                <div className="max-w-[280px]">
                  <Lbl>কত ঘণ্টা পর আবার একবার</Lbl>
                  <input
                    className={input} type="number" min={0} max={72}
                    value={s.paymentFailedRetryHours}
                    onChange={(e) => set("paymentFailedRetryHours", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-body-soft mt-1">
                    ০ দিলে দ্বিতীয়বার যাবে না। এর মধ্যে টাকা এসে গেলে এমনিতেও যাবে না।
                  </p>
                </div>
              </div>

              <div className="border-t border-[#f0edf5] pt-4 space-y-3">
                <Toggle
                  on={s.abandonedEnabled}
                  onChange={(v) => set("abandonedEnabled", v)}
                  title="checkout ছেড়ে গেলে বার্তা"
                  sub="⚠️ Meta এটাকে Marketing ধরে — দাম বেশি, আর opt-out তালিকা মানা হয়"
                />
                <div className="max-w-[280px]">
                  <Lbl>কত মিনিট চুপ থাকলে</Lbl>
                  <input
                    className={input} type="number" min={5} max={1440}
                    value={s.abandonedAfterMinutes}
                    onChange={(e) => set("abandonedAfterMinutes", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-body-soft mt-1">
                    ৫ মিনিটের কম দেওয়া যায় না — bKash বা কার্ডের OTP-তেই তার
                    বেশি সময় লাগে, আর তখন টাকা দেওয়ার মাঝপথে থাকা গ্রাহকের
                    কাছে বার্তা চলে যেত।
                  </p>
                </div>
              </div>

              <div className="border-t border-[#f0edf5] pt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Lbl>অসমাপ্ত checkout কতদিন রাখা হবে</Lbl>
                  <input
                    className={input} type="number" min={1} max={365}
                    value={s.leadRetentionDays}
                    onChange={(e) => set("leadRetentionDays", Number(e.target.value))}
                  />
                  <p className="text-[11px] text-body-soft mt-1">
                    এরপর নিজে থেকে মুছে যাবে। যাঁরা কিছু কেনেননি তাঁদের নম্বর
                    অনির্দিষ্টকাল জমিয়ে রাখা সম্পদ নয়, দায়।
                  </p>
                </div>
                <div>
                  <Lbl>বার্তায় যে নম্বরে ফোন করতে বলা হবে</Lbl>
                  <input
                    className={input} placeholder="Company settings-এর নম্বর"
                    value={s.supportPhone ?? ""}
                    onChange={(e) => set("supportPhone", e.target.value)}
                  />
                </div>
              </div>

              <div className="border-t border-[#f0edf5] pt-4 space-y-3">
                <Toggle
                  on={s.sweeperEnabled}
                  onChange={(v) => set("sweeperEnabled", v)}
                  title="সময়মতো নিজে থেকে চালাও"
                  sub="⚠️ Demo-তে বন্ধ রাখুন — ফ্রি ডেটাবেজের মাসিক কোটা শেষ হয়ে যায়। আসল দোকানে চালু।"
                />
                <div className="max-w-[280px]">
                  <Lbl>কত মিনিট পরপর</Lbl>
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
                  এখনই চালান
                </button>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ───────────── তালিকা ───────────── */}
      <div className="mt-5">
        <Panel
          emoji="☎" tone="sky"
          title="অসমাপ্ত checkout"
          sub="কারা কতদূর গিয়ে থেমেছেন — ফোন করার তালিকা"
        >
          <div className="p-4">
            <Tabs
              value={tab}
              onChange={(v) => setTab(v as typeof tab)}
              items={[
                { key: "OPEN", label: "এখনো খোলা", tone: "amber" },
                { key: "MESSAGED", label: "বার্তা গেছে", tone: "sky" },
                { key: "CONVERTED", label: "order হয়েছে", tone: "emerald" },
                { key: "SKIPPED", label: "বাদ", tone: "slate" },
              ]}
            />

            {!leads ? (
              <p className="text-[13px] text-body-soft mt-4">লোড হচ্ছে…</p>
            ) : leads.length === 0 ? (
              <div className="mt-4">
                <Empty
                  emoji="✦"
                  title="এখানে কিছু নেই"
                  sub="গ্রাহক checkout-এ নাম বা নম্বর লিখলে তবেই সারি তৈরি হয়।"
                />
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr>
                      <Th>কে</Th>
                      <Th>কতদূর</Th>
                      <Th>কী রেখে গেছেন</Th>
                      <Th right>কত টাকার</Th>
                      <Th>কখন</Th>
                      <Th>অবস্থা</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l) => (
                      <tr key={l.id} className="border-t border-[#f4f1f8] align-top">
                        <Td>
                          <div className="font-semibold text-purple">{l.name || "নাম দেননি"}</div>
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
                                <li className="text-body-soft">আরও {l.cart.summary.length - 3}টা</li>
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
