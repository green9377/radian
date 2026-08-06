"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import DemoBanner from "./DemoBanner";
import {
  listCustomersSafe,
  setCustomerBlocked,
  formatTaka,
  initials,
  ago,
  genAvatar,
  type ApiCustomer,
} from "../_data/api";
import { demoRisk, RISK_META, type RiskLevel } from "../_data/customerDemo";

/*
  Customer Management · Risk & blocklist.
  COD is the norm in Bangladesh, so fake orders and refused deliveries are a real
  cost. Customer owns the block flag + reason; the underlying order/delivery facts
  are Sales/Delivery-owned and only read here.

  Block / unblock is REAL (POST /customers/:id/block|unblock).
  Risk counters are DEMO until Sales/Delivery expose them.
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

export default function CustomerRisk() {
  const [all, setAll] = useState<ApiCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [level, setLevel] = useState("");
  const [q, setQ] = useState("");
  const [isDemo, setIsDemo] = useState(false);

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

  const enriched = useMemo(
    () => all.map((c) => ({ c, risk: demoRisk(c.id, c.ordersCount, c.status === "BLOCKED") })),
    [all],
  );

  const stats = useMemo(() => {
    let high = 0, med = 0, blocked = 0, fake = 0, failed = 0;
    for (const e of enriched) {
      if (e.risk.level === "high") high++;
      else if (e.risk.level === "medium") med++;
      if (e.c.status === "BLOCKED") blocked++;
      fake += e.risk.fakeCod;
      failed += e.risk.failedDeliveries;
    }
    return { high, med, blocked, fake, failed };
  }, [enriched]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return enriched
      .filter((e) => {
        const okQ = !s || e.c.name.toLowerCase().includes(s) || e.c.phone.includes(s);
        const okL = !level || (level === "blocked" ? e.c.status === "BLOCKED" : e.risk.level === level);
        return okQ && okL;
      })
      .sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2 } as Record<RiskLevel, number>;
        return rank[a.risk.level] - rank[b.risk.level];
      });
  }, [enriched, q, level]);

  async function toggleBlock(c: ApiCustomer) {
    const blocking = c.status !== "BLOCKED";
    if (blocking && !confirm(`Block "${c.name}"? They will not be able to log in or order. Data is kept.`)) return;
    setBusy(c.id);
    try {
      const updated = await setCustomerBlocked(c.id, blocking);
      setAll((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: updated.status } : x)));
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
            <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
            Customer Management · risk
          </div>
          <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Risk &amp; blocklist</h1>
          <p className="text-body-soft text-[13.5px] m-0 max-w-[760px]">
            Fake COD orders and refused deliveries cost real money. Blocking stops login and ordering — it never deletes the customer.
          </p>
        </div>
        <Link href="/customers/list" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid">
          All customers
        </Link>
      </div>

      {error && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px]">
          {error}. Is the API (:4000) running? <button className="underline" onClick={load}>Retry</button>
        </div>
      )}
      <DemoBanner isDemo={isDemo} onReload={load} />
      {loading && <div className="text-[13px] text-body-soft mb-4">Loading risk board…</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { l: "High risk", v: String(stats.high), c: "#c0392b", bg: "#fdecec", icon: "shield" },
          { l: "Watch list", v: String(stats.med), c: "#d98a0f", bg: "#fff8ec", icon: "bolt" },
          { l: "Blocked", v: String(stats.blocked), c: "#b42318", bg: "#fbecec", icon: "trash" },
          { l: "Fake COD (total)", v: String(stats.fake), c: "#8b3fb0", bg: "#f5eafb", icon: "cash" },
          { l: "Failed deliveries", v: String(stats.failed), c: "#3182c9", bg: "#e9f1fb", icon: "truck" },
        ].map((k, i) => (
          <div key={i} className="rounded-[14px] px-3.5 py-3 shadow-soft border border-white/60" style={{ background: k.bg }}>
            <span className="w-[24px] h-[24px] rounded-[7px] flex items-center justify-center text-white" style={{ background: k.c }}>
              <Icon name={k.icon} size={13} />
            </span>
            <div className="font-display text-[23px] leading-none mt-2.5" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[11px] font-medium text-body mt-1.5">{k.l}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <div className="relative max-w-[300px] w-full">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft">
            <Icon name="search" size={18} />
          </span>
          <input className="ipt ipt-icon h-[44px]" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="ipt max-w-[190px] h-[44px]" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">All risk levels</option>
          <option value="high">High risk</option>
          <option value="medium">Watch</option>
          <option value="low">Low</option>
          <option value="blocked">Blocked only</option>
        </select>
        <span className="text-[13px] text-body-soft ml-auto">{rows.length} customer{rows.length === 1 ? "" : "s"}</span>
      </div>

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="text-left font-medium px-5 py-2.5">Customer</th>
              <th className="text-left font-medium px-4 py-2.5">Risk</th>
              <th className="text-left font-medium px-4 py-2.5">Fake COD</th>
              <th className="text-left font-medium px-4 py-2.5">Failed delivery</th>
              <th className="text-left font-medium px-4 py-2.5">Refunds</th>
              <th className="text-left font-medium px-4 py-2.5">Value / last order</th>
              <th className="text-left font-medium px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, risk }) => {
              const meta = RISK_META[risk.level];
              const blocked = c.status === "BLOCKED";
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
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-full font-semibold border ${meta.chip}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={risk.fakeCod > 0 ? "font-semibold text-[#c0392b]" : "text-body-soft"}>{risk.fakeCod}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={risk.failedDeliveries > 0 ? "font-semibold text-[#b45309]" : "text-body-soft"}>{risk.failedDeliveries}</span>
                  </td>
                  <td className="px-4 py-3 text-body-soft">{risk.refunds}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-purple">{formatTaka(c.ltvPaisa)}</div>
                    <div className="text-[13px] text-body-soft">{c.ordersCount} orders · {ago(c.lastOrderAt)}</div>
                  </td>
                  <td className="px-4 py-3">
                    {blocked ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full bg-[#fdecea] text-[#c0392b] font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#c0392b]" /> Blocked
                        </span>
                        {risk.blockReason && <div className="text-[13px] text-body-soft mt-1 max-w-[160px]">{risk.blockReason}</div>}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full bg-[#e6f4ec] text-[#2e7d5b] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#2e7d5b]" /> Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      disabled={busy === c.id}
                      onClick={() => toggleBlock(c)}
                      className={
                        "text-[12px] font-medium px-3 py-1.5 rounded-[9px] border whitespace-nowrap disabled:opacity-50 " +
                        (blocked
                          ? "border-lavender-deep text-purple hover:border-orchid"
                          : "border-[#e0a1a1] text-[#c0392b] hover:bg-[#fdecea]")
                      }
                    >
                      {busy === c.id ? "…" : blocked ? "Unblock" : "Block"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="text-center text-body-soft py-12 border-t border-lavender-deep">No customers match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!isDemo && (
        <div className="bg-[#fff4e6] border border-[#fce4c4] text-[#b45309] rounded-[12px] px-4 py-3 mt-4 text-[12.5px]">
          <b>Risk counters are placeholders.</b> Fake-COD, failed-delivery and refund counts are not on the API yet — they
          will come from Sales &amp; Delivery, which own those events. Block / unblock below is real.
        </div>
      )}
      <p className="text-body-soft text-[12px] mt-3.5">
        Block / unblock is saved. Customer Management stores only the block flag and reason — the underlying order and
        delivery facts stay owned by Sales &amp; Delivery (One Data, One Owner).
      </p>
    </div>
  );
}
