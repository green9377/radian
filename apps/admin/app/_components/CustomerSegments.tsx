"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import DemoBanner from "./DemoBanner";
import { listCustomersSafe, listSegmentsSafe, formatTaka, type ApiCustomer, type ApiSegment } from "../_data/api";
import { demoAddSegment, demoRenameSegment, demoRemoveSegment } from "../_data/demoStore";

/*
  Customer Management · Segments — the segment (customer group) master.
  Create / rename / remove a segment, see how many customers carry it and what
  they are worth. Editing is LOCAL DEMO for now (API has GET /segments only).
  ⇄ SWAP HERE: POST/PATCH/DELETE /segments when the endpoint lands.
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";
const MIX = ["#8b3fb0", "#e08a0f", "#3182c9", "#d64fa0", "#1aa06a", "#b5642f", "#00a1a7"];

type Row = ApiSegment & { _count?: { customers: number }; demo?: boolean; rule?: string };

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** suggested auto-rules — shown so staff understand where segments can come from */
const AUTO_RULES: Record<string, string> = {
  vip: "Lifetime value ≥ ৳20,000",
  corporate: "Manually tagged by staff",
  wholesale: "Manually tagged by staff",
  birthday: "Has a recipient with a birthday saved",
  anniversary: "Has a recipient with an anniversary saved",
};

export default function CustomerSegments() {
  const [segs, setSegs] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isDemo, setIsDemo] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, c] = await Promise.all([listSegmentsSafe(), listCustomersSafe()]);
      setSegs(s.items);
      setCustomers(c.items);
      setIsDemo(c.isDemo || s.isDemo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load segments");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  /** value + customers carried by each segment, computed from the customer list */
  const enriched = useMemo(() => {
    return segs.map((s) => {
      const members = customers.filter((c) => (c.segments ?? []).some((x) => x.slug === s.slug));
      const ltv = members.reduce((sum, m) => sum + m.ltvPaisa, 0);
      const orders = members.reduce((sum, m) => sum + m.ordersCount, 0);
      return { seg: s, count: members.length || s._count?.customers || 0, ltv, orders, members };
    });
  }, [segs, customers]);

  const untagged = useMemo(() => customers.filter((c) => (c.segments ?? []).length === 0).length, [customers]);
  const maxCount = Math.max(...enriched.map((e) => e.count), 1);

  function addSegment() {
    const n = name.trim();
    if (!n) return;
    const slug = slugify(n);
    if (segs.some((s) => s.slug === slug)) {
      setError("That segment already exists.");
      return;
    }
    if (isDemo) {
      demoAddSegment(n);
      setName("");
      load();
      return;
    }
    setError("Creating segments is not available yet.");
  }
  function saveEdit(id: string) {
    const n = editName.trim();
    setEditId(null);
    if (!n) return;
    if (isDemo) {
      demoRenameSegment(id, n);
      load();
      return;
    }
    setSegs((prev) => prev.map((s) => (s.id === id ? { ...s, name: n } : s)));
  }
  function remove(id: string, count: number) {
    if (count > 0 && !confirm(`This segment is on ${count} customer(s). Remove the tag from them as well?`)) return;
    if (isDemo) {
      demoRemoveSegment(id);
      load();
      return;
    }
    setSegs((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
            <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
            Customer Management · segments
          </div>
          <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Segments</h1>
        </div>
        <Link href="/customers/list" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid">
          All customers
        </Link>
      </div>

      {error && (
        <div className="bg-[var(--s-bad)] border border-[var(--l-bad)] text-[var(--t-bad)] rounded-[12px] px-4 py-3 mb-4 text-[13px]">
          {error}. Is the API (:4000) running? <button className="underline" onClick={load}>Retry</button>
        </div>
      )}
      <DemoBanner isDemo={isDemo} onReload={load} />
      {loading && <div className="text-[13px] text-body-soft mb-4">Loading segments…</div>}

      {/* summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 mb-5">
        {[
          { l: "Segments", v: String(segs.length), c: "var(--t-accent)", bg: "var(--s-accent)", icon: "hash" },
          { l: "Tagged customers", v: String(customers.length - untagged), c: "var(--t-ok)", bg: "var(--s-ok)", icon: "user" },
          { l: "Untagged", v: String(untagged), c: untagged ? "var(--t-warn)" : "var(--t-ok)", bg: "var(--s-warn)", icon: "bolt" },
          { l: "Value in segments", v: formatTaka(enriched.reduce((s, e) => s + e.ltv, 0)), c: "var(--t-orchid)", bg: "var(--s-orchid)", icon: "cash" },
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

      {/* create */}
      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-5 mb-4">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center text-white" style={{ background: "var(--s-orchid)" }}>
            <Icon name="plus" size={16} />
          </span>
          <div className="font-display text-[16px] text-purple leading-tight">Create a segment</div>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <input
            className="ipt h-[44px] max-w-[340px]"
            placeholder="Segment name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSegment()}
          />
          <button onClick={addSegment} className="bg-purple hover:bg-purple-deep text-white text-[13.5px] font-medium px-5 rounded-[11px] shadow-soft">
            Add segment
          </button>
        </div>
      </div>

      {/* table */}
      <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
              <th className="text-left font-medium px-5 py-2.5">Segment</th>
              <th className="text-left font-medium px-4 py-2.5">Customers</th>
              <th className="text-left font-medium px-4 py-2.5">Share</th>
              <th className="text-left font-medium px-4 py-2.5">Orders</th>
              <th className="text-left font-medium px-4 py-2.5">Lifetime value</th>
              <th className="text-left font-medium px-4 py-2.5">How it fills</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {enriched.map((e, i) => (
              <tr key={e.seg.id} className="border-t border-lavender-deep hover:bg-lavender/50">
                <td className="px-5 py-3">
                  {editId === e.seg.id ? (
                    <div className="flex gap-2">
                      <input className="ipt h-[36px] max-w-[200px]" value={editName} onChange={(ev) => setEditName(ev.target.value)} autoFocus />
                      <button onClick={() => saveEdit(e.seg.id)} className="text-[12px] font-semibold text-orchid">Save</button>
                      <button onClick={() => setEditId(null)} className="text-[13px] text-body-soft">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <span className="w-1.5 h-6 rounded-full shrink-0" style={{ background: MIX[i % MIX.length] }} />
                      <div>
                        <div className="font-medium text-purple">{e.seg.name}</div>
                        <div className="text-[13px] text-body-soft">{e.seg.slug}</div>
                      </div>
                      {e.seg.demo && <span className="text-[10px] px-2 py-0.5 rounded-full bg-orchid-soft text-purple font-medium">demo</span>}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-semibold text-purple">{e.count}</td>
                <td className="px-4 py-3 w-[160px]">
                  <div className="h-[9px] bg-lavender rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(e.count / maxCount) * 100}%`, background: MIX[i % MIX.length] }} />
                  </div>
                </td>
                <td className="px-4 py-3">{e.orders}</td>
                <td className="px-4 py-3 font-semibold text-purple">{formatTaka(e.ltv)}</td>
                <td className="px-4 py-3 text-[13px] text-body-soft">{AUTO_RULES[e.seg.slug] ?? "Manually tagged by staff"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setEditId(e.seg.id); setEditName(e.seg.name); }}
                      className="border border-lavender-deep hover:border-orchid hover:text-purple text-body-soft w-[32px] h-[32px] rounded-[9px] grid place-items-center"
                      title="Rename"
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    <button
                      onClick={() => remove(e.seg.id, e.count)}
                      className="border border-lavender-deep hover:border-[var(--l-bad)] hover:text-[var(--t-bad)] text-body-soft w-[32px] h-[32px] rounded-[9px] grid place-items-center"
                      title="Remove"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {enriched.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center text-body-soft py-10 border-t border-lavender-deep">
                  No segments yet — create your first one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
