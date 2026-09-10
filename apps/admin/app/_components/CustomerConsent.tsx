"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import DemoBanner from "./DemoBanner";
import { listCustomersSafe, initials, genAvatar, type ApiCustomer } from "../_data/api";
import { demoConsent, type Consent } from "../_data/customerDemo";

/*
  Customer Management · Consent — who agreed to receive what.
  WhatsApp-first business: sending promos to someone who opted out burns the number.
  Consent is CUSTOMER-OWNED; Marketing only READS it when building an audience.

  DEMO: values derive from the customer id until consent fields land on the API.
  ⇄ SWAP HERE: PATCH /customers/:id/consent
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

type Key = keyof Pick<Consent, "orderUpdates" | "marketingWhatsapp" | "occasionReminders" | "email" | "sms">;

const CHANNELS: { k: Key; label: string; hint: string; c: string; icon: string }[] = [
  { k: "orderUpdates", label: "Order updates", hint: "transactional — order confirmed, out for delivery", c: "#12a172", icon: "bag" },
  { k: "marketingWhatsapp", label: "WhatsApp promos", hint: "campaigns, offers, festival blasts", c: "#c01fd8", icon: "phone" },
  { k: "occasionReminders", label: "Occasion reminders", hint: "“Meem's birthday is in 3 days”", c: "#d64fa0", icon: "sparkle" },
  { k: "email", label: "Email", hint: "receipts, newsletters", c: "#3182c9", icon: "mail" },
  { k: "sms", label: "SMS", hint: "fallback when WhatsApp fails", c: "#b5642f", icon: "phone" },
];

function Toggle({ on, onClick, c }: { on: boolean; onClick: () => void; c: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-[40px] h-[22px] rounded-full relative transition-colors shrink-0"
      style={{ background: on ? c : "#2f2638" }}
      aria-pressed={on}
    >
      <span className="absolute top-[2px] w-[18px] h-[18px] bg-white rounded-full shadow transition-all" style={{ left: on ? 20 : 2 }} />
    </button>
  );
}

export default function CustomerConsent() {
  const [all, setAll] = useState<ApiCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Partial<Consent>>>({});
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [isDemo, setIsDemo] = useState(false);

  /* remember consent changes across reloads so the screen behaves like a real one */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("radian-demo-consent");
      if (raw) setOverrides(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("radian-demo-consent", JSON.stringify(overrides));
    } catch {
      /* ignore */
    }
  }, [overrides]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listCustomersSafe();
      setAll(res.items);
      setIsDemo(res.isDemo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const consentOf = (c: ApiCustomer): Consent => ({ ...demoConsent(c.id), ...(overrides[c.id] ?? {}) });

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((c) => {
      const con = consentOf(c);
      const okQ = !s || c.name.toLowerCase().includes(s) || c.phone.includes(s);
      const okF =
        !filter ||
        (filter === "promo-in" ? con.marketingWhatsapp : filter === "promo-out" ? !con.marketingWhatsapp : filter === "rem-in" ? con.occasionReminders : true);
      return okQ && okF;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, q, filter, overrides]);

  const stats = useMemo(() => {
    let promo = 0, rem = 0, mail = 0, sms = 0, txn = 0;
    for (const c of all) {
      const x = consentOf(c);
      if (x.marketingWhatsapp) promo++;
      if (x.occasionReminders) rem++;
      if (x.email) mail++;
      if (x.sms) sms++;
      if (x.orderUpdates) txn++;
    }
    const t = all.length || 1;
    return { promo, rem, mail, sms, txn, pct: (n: number) => Math.round((n / t) * 100) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, overrides]);

  function toggle(c: ApiCustomer, k: Key) {
    const cur = consentOf(c);
    setOverrides((prev) => ({ ...prev, [c.id]: { ...(prev[c.id] ?? {}), [k]: !cur[k] } }));
  }

  return (
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
            <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
            Customer Management · consent
          </div>
          <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Consent &amp; communication</h1>
          <p className="text-body-soft text-[13.5px] m-0 max-w-[760px]">
            What each customer agreed to receive. Marketing must respect this — messaging an opt-out risks your WhatsApp number.
          </p>
        </div>
        <Link href="/customers/list" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid">
          All customers
        </Link>
      </div>

      {error && (
        <div className="bg-[#3b1a16] border border-[#4d2e2e] text-[#e1837a] rounded-[12px] px-4 py-3 mb-4 text-[13px]">
          {error}. Is the API (:4000) running? <button className="underline" onClick={load}>Retry</button>
        </div>
      )}
      <DemoBanner isDemo={isDemo} onReload={load} />
      {loading && <div className="text-[13px] text-body-soft mb-4">Loading consent…</div>}

      {/* channel summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {CHANNELS.map((ch) => {
          const n = ch.k === "marketingWhatsapp" ? stats.promo : ch.k === "occasionReminders" ? stats.rem : ch.k === "email" ? stats.mail : ch.k === "sms" ? stats.sms : stats.txn;
          return (
            <div key={ch.k} className="bg-white border border-lavender-deep rounded-[14px] px-4 py-3.5 shadow-soft">
              <span className="w-[24px] h-[24px] rounded-[7px] flex items-center justify-center text-white" style={{ background: ch.c }}>
                <Icon name={ch.icon} size={13} />
              </span>
              <div className="font-display text-[23px] leading-none mt-2.5" style={{ color: ch.c }}>{stats.pct(n)}%</div>
              <div className="text-[11px] font-medium text-body mt-1.5 leading-tight">{ch.label}</div>
              <div className="text-[13px] text-body-soft mt-0.5">{n} of {all.length} opted in</div>
              <div className="h-[6px] bg-lavender rounded-full overflow-hidden mt-2">
                <div className="h-full rounded-full" style={{ width: `${stats.pct(n)}%`, background: ch.c }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* filters */}
      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <div className="relative max-w-[300px] w-full">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft">
            <Icon name="search" size={18} />
          </span>
          <input className="ipt ipt-icon h-[44px]" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="ipt max-w-[220px] h-[44px]" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Everyone</option>
          <option value="promo-in">Promo opted-IN</option>
          <option value="promo-out">Promo opted-OUT</option>
          <option value="rem-in">Reminder opted-IN</option>
        </select>
        <span className="text-[13px] text-body-soft ml-auto">{rows.length} customer{rows.length === 1 ? "" : "s"}</span>
      </div>

      {/* table */}
      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="text-left font-medium px-5 py-2.5">Customer</th>
              {CHANNELS.map((ch) => (
                <th key={ch.k} className="text-left font-medium px-3 py-2.5" title={ch.hint}>{ch.label}</th>
              ))}
              <th className="text-left font-medium px-4 py-2.5">Captured</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const con = consentOf(c);
              return (
                <tr key={c.id} className="border-t border-lavender-deep hover:bg-lavender/50">
                  <td className="px-5 py-3">
                    <Link href={`/customers/${c.id}`} className="flex items-center gap-3">
                      <span className="w-[32px] h-[32px] rounded-full grid place-items-center text-white text-[11px] font-medium font-display shrink-0" style={{ background: c.avatarBg || genAvatar(c.id) }}>
                        {initials(c.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium text-purple truncate">{c.name}</span>
                        <span className="block text-[13px] text-body-soft">{c.phone}</span>
                      </span>
                    </Link>
                  </td>
                  {CHANNELS.map((ch) => (
                    <td key={ch.k} className="px-3 py-3">
                      <Toggle on={con[ch.k]} c={ch.c} onClick={() => toggle(c, ch.k)} />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-[13px] text-body-soft">
                    {con.source}
                    <div className="text-[11px]">{new Date(con.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center text-body-soft py-12 border-t border-lavender-deep">No customers match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!isDemo && (
        <div className="bg-[#3b2b17] border border-[#534028] text-[#f7a96e] rounded-[12px] px-4 py-3 mt-4 text-[12.5px]">
          <b>These are placeholder values.</b> Consent is not stored on the Customer API yet, so nothing here reflects what
          your real customers actually agreed to. Real consent gets captured at checkout, from the account page, from a
          &ldquo;STOP&rdquo; reply, or by staff — after the WhatsApp Business API is connected.
        </div>
      )}
      <p className="text-body-soft text-[12px] mt-3.5">
        Order updates should normally stay on — they are service messages, not marketing. Consent is Customer-owned;
        Marketing only reads it when building an audience.
      </p>
    </div>
  );
}
