"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import DemoBanner from "./DemoBanner";
import {
  listCustomersSafe,
  listSegmentsSafe,
  deleteCustomer,
  formatTaka,
  initials,
  ago,
  genAvatar,
  type ApiCustomer,
  type ApiSegment,
} from "../_data/api";

/*
  Customer list — ⇄ SWAPPED: এখন :4000 /customers থেকে আসল ডেটা।
  Orders & lifetime value = Sales-owned (read-only ref)। Phone = intl identity।
*/

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "accent" | "gold" | "info" }) {
  const color =
    tone === "ok" ? "text-[#2e7d5b]" : tone === "info" ? "text-[#2b5f9e]" : tone === "gold" ? "text-rosegold" : "text-purple";
  return (
    <div className="bg-white border border-lavender-deep rounded-[14px] px-4 py-3.5 shadow-soft">
      <div className="text-[13px] text-body-soft">{label}</div>
      <div className={`text-[26px] font-medium mt-0.5 font-display ${color}`}>{value}</div>
    </div>
  );
}

export default function CustomerListView() {
  const [all, setAll] = useState<ApiCustomer[]>([]);
  const [segments, setSegments] = useState<ApiSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [seg, setSeg] = useState("");
  const [stat, setStat] = useState("");
  const [isDemo, setIsDemo] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [res, segs] = await Promise.all([listCustomersSafe(), listSegmentsSafe()]);
      setAll(res.items);
      setSegments(segs.items);
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

  const stats = useMemo(() => {
    let repeat = 0,
      ltv = 0,
      abroad = 0;
    for (const c of all) {
      if (c.tier === "repeat") repeat++;
      if (c.isAbroad) abroad++;
      ltv += c.ltvPaisa;
    }
    return { total: all.length, repeat, abroad, ltv };
  }, [all]);

  const rows = useMemo(() => {
    return all.filter((c) => {
      const okQ =
        !q ||
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        c.phone.includes(q) ||
        c.country.toLowerCase().includes(q.toLowerCase()) ||
        (c.email ?? "").toLowerCase().includes(q.toLowerCase());
      const okCountry = !country || (country === "bd" ? !c.isAbroad : country === "abroad" ? c.isAbroad : true);
      const okSeg = !seg || (c.segments ?? []).some((s) => s.slug === seg);
      const okStat =
        !stat ||
        (stat === "new"
          ? c.tier === "new"
          : stat === "repeat"
            ? c.tier === "repeat"
            : stat === "blocked"
              ? c.status === "BLOCKED"
              : stat === "active"
                ? c.status === "ACTIVE"
                : true);
      return okQ && okCountry && okSeg && okStat;
    });
  }, [all, q, country, seg, stat]);

  async function onDelete(c: ApiCustomer) {
    if (!confirm(`Delete "${c.name}"? Soft-hide (data kept, recoverable).`)) return;
    try {
      await deleteCustomer(c.id);
      setAll((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that customer.");
    }
  }

  return (
    <div className="px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full">
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="font-display text-[30px] text-purple m-0 leading-tight">Customers</h1>
        </div>
        <Link
          href="/customers/new"
          className="bg-purple hover:bg-purple-deep text-white text-[14px] font-medium px-5 py-3 rounded-[12px] inline-flex items-center gap-2 shadow-soft transition-colors"
        >
          <Icon name="plus" size={18} /> Add customer
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 mb-6">
        <Stat label="Total customers" value={String(stats.total)} tone="accent" />
        <Stat label="Repeat buyers" value={String(stats.repeat)} tone="ok" />
        <Stat label="Ordering from abroad" value={String(stats.abroad)} tone="info" />
        <Stat label="Lifetime value" value={formatTaka(stats.ltv)} tone="gold" />
      </div>

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <div className="relative max-w-[320px] w-full">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft">
            <Icon name="search" size={18} />
          </span>
          <input
            className="ipt ipt-icon h-[44px]"
            placeholder="Search by name, phone, email or country…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="ipt max-w-[170px] h-[44px]" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          <option value="bd">Bangladesh</option>
          <option value="abroad">Abroad (NRB)</option>
        </select>
        <select className="ipt max-w-[170px] h-[44px]" value={seg} onChange={(e) => setSeg(e.target.value)}>
          <option value="">All segments</option>
          {segments.map((s) => (
            <option key={s.id} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <select className="ipt max-w-[160px] h-[44px]" value={stat} onChange={(e) => setStat(e.target.value)}>
          <option value="">All customers</option>
          <option value="new">New (0 orders)</option>
          <option value="repeat">Repeat (2+)</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
        </select>
        <span className="text-[13px] text-body-soft ml-auto">
          {loading ? "loading…" : `${rows.length} customer${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <DemoBanner isDemo={isDemo} onReload={load} />

      {error && (
        <div className="bg-[#fdecea] border border-[#e0a1a1] text-[#c0392b] rounded-[12px] px-4 py-3 mb-4 text-[13px]">
          {error}. Is the API (:4000) running?{" "}
          <button className="underline" onClick={load}>
            Retry
          </button>
        </div>
      )}

      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="text-body-soft text-[11.5px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="text-left font-medium px-4 py-3.5">Customer</th>
              <th className="text-left font-medium px-4 py-3.5">WhatsApp / phone</th>
              <th className="text-left font-medium px-4 py-3.5">Country</th>
              <th className="text-left font-medium px-4 py-3.5">Orders</th>
              <th className="text-left font-medium px-4 py-3.5">Lifetime value</th>
              <th className="text-left font-medium px-4 py-3.5">Segment</th>
              <th className="text-left font-medium px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const blocked = c.status === "BLOCKED";
              return (
                <tr key={c.id} className="hover:bg-lavender/70 border-t border-lavender-deep transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3.5">
                      <div
                        className="w-[44px] h-[44px] rounded-full shrink-0 shadow-soft grid place-items-center text-white font-medium font-display text-[15px]"
                        style={{ background: c.avatarBg || genAvatar(c.name) }}
                      >
                        {initials(c.name)}
                      </div>
                      <div>
                        <div className="font-medium text-purple leading-snug">{c.name}</div>
                        <div className="text-body-soft text-[12px]">{c.email ?? "— no email —"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="leading-snug">{c.phone}</div>
                    {c.whatsappVerified && <div className="text-[11px] text-[#2e7d5b] font-medium">✓ WhatsApp</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "text-[12.5px] px-2.5 py-1 rounded-full " +
                        (c.isAbroad ? "bg-[#eaf1fb] text-[#2b5f9e] font-medium" : "bg-lavender-deep/60 text-body")
                      }
                    >
                      {c.country}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={c.ordersCount === 0 ? "text-body-soft" : ""}>{c.ordersCount}</span>
                    {c.lastOrderAt && <div className="text-[13px] text-body-soft">last {ago(c.lastOrderAt)}</div>}
                  </td>
                  <td className="px-4 py-3 font-medium">{formatTaka(c.ltvPaisa)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {c.tier === "new" && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#eaf1fb] text-[#2b5f9e] font-medium">New</span>
                      )}
                      {(c.segments ?? []).map((s) => (
                        <span key={s.id} className="text-[11px] px-2 py-0.5 rounded-full bg-orchid-soft text-purple font-medium">
                          {s.name}
                        </span>
                      ))}
                      {c.tier !== "new" && (c.segments ?? []).length === 0 && (
                        <span className="text-body-soft text-[12px]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {blocked ? (
                      <span className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full bg-[#fdecea] text-[#c0392b] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#c0392b]" /> Blocked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full bg-[#e6f4ec] text-[#2e7d5b] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#2e7d5b]" /> Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <Link
                        href={`/customers/${c.id}`}
                        className="border border-lavender-deep hover:border-orchid hover:text-purple text-body-soft w-[34px] h-[34px] rounded-[10px] grid place-items-center transition-colors"
                        title="Edit"
                      >
                        <Icon name="edit" size={17} />
                      </Link>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => onDelete(c)}
                        className="border border-lavender-deep hover:border-[#e0a1a1] hover:text-[#c0392b] text-body-soft w-[34px] h-[34px] rounded-[10px] grid place-items-center transition-colors"
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-body-soft py-12 border-t border-lavender-deep">
                  {all.length === 0 ? "No customers yet." : "No customers match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
