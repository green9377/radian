"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import DemoBanner from "./DemoBanner";
import { setDemoMode } from "../_data/demoMode";
import { listCustomersSafe, formatTaka, initials, ago, genAvatar, type ApiCustomer } from "../_data/api";
import { findDuplicates } from "../_data/customerDemo";
import { demoMerge } from "../_data/demoStore";

/*
  Customer Management · Duplicates & merge.
  Master-data hygiene: the same person often ends up with two records (new phone,
  typo, staff-created walk-in). Merging keeps ONE customer with the full history.

  Detection is real (runs on the live customer list). Merge is a PROTOTYPE until
  POST /customers/:id/merge exists — merging must move orders, recipients and
  segments to the primary and soft-hide the duplicate.
*/

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

export default function CustomerDuplicates() {
  const [all, setAll] = useState<ApiCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [primary, setPrimary] = useState<Record<string, string>>({});
  const [merged, setMerged] = useState<string[]>([]);
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

  const groups = useMemo(() => findDuplicates(all).filter((g) => !merged.includes(g.key)), [all, merged]);

  /** default primary = the record with the most orders, then most recipients */
  function primaryOf(key: string, members: ApiCustomer[]): string {
    if (primary[key]) return primary[key];
    const best = [...members].sort(
      (a, b) => b.ordersCount - a.ordersCount || (b.recipients?.length ?? 0) - (a.recipients?.length ?? 0),
    )[0];
    return best.id;
  }

  function doMerge(key: string, members: ApiCustomer[]) {
    const keepId = primaryOf(key, members);
    const keep = members.find((m) => m.id === keepId)!;
    const drop = members.filter((m) => m.id !== keepId);
    const totalOrders = members.reduce((s, m) => s + m.ordersCount, 0);
    const totalLtv = members.reduce((s, m) => s + m.ltvPaisa, 0);

    if (
      !confirm(
        `Merge ${drop.length} profile(s) into "${keep.name}" (${keep.phone})?\n` +
          `${totalOrders} orders · ${formatTaka(totalLtv)} on one profile. The duplicate is hidden, never deleted.`,
      )
    )
      return;

    if (isDemo) {
      const result = demoMerge(
        keepId,
        drop.map((d) => d.id),
      );
      if (result) {
        setAll((prev) =>
          prev.filter((c) => !drop.some((d) => d.id === c.id)).map((c) => (c.id === keepId ? result : c)),
        );
        setMerged((prev) => [...prev, key]);
      }
      return;
    }
    setError("Merging live records is not available yet.");
    setMerged((prev) => [...prev, key]);
  }

  const dupCount = groups.reduce((s, g) => s + g.members.length, 0);

  return (
    <div className={WRAP}>
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid">
            <span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />
            Customer Management · duplicates
          </div>
          <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Duplicates &amp; merge</h1>
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
      {loading && <div className="text-[13px] text-body-soft mb-4">Scanning for duplicates…</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 mb-5">
        {[
          { l: "Possible duplicate sets", v: String(groups.length), c: groups.length ? "var(--t-warn)" : "var(--t-ok)", bg: groups.length ? "var(--s-warn)" : "var(--s-ok)", icon: "copy" },
          { l: "Profiles involved", v: String(dupCount), c: "var(--t-accent)", bg: "var(--s-accent)", icon: "user" },
          { l: "Merged this session", v: String(merged.length), c: "var(--t-ok)", bg: "var(--s-ok)", icon: "check" },
          { l: "Total customers", v: String(all.length), c: "var(--t-info)", bg: "var(--s-info)", icon: "grid" },
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

      {groups.length === 0 && !loading ? (
        <div className="bg-white border border-lavender-deep rounded-[18px] p-10 shadow-soft text-center">
          <div className="w-12 h-12 rounded-full bg-[var(--s-ok)] text-[var(--t-ok)] grid place-items-center mx-auto mb-3">
            <Icon name="check" size={24} />
          </div>
          <div className="font-display text-[18px] text-purple">No duplicates found</div>
          {!isDemo && (
            <>
              <button
                onClick={() => {
                  setDemoMode(true);
                  load();
                }}
                className="mt-3 bg-purple hover:bg-purple-deep text-white text-[13px] font-medium px-4 py-2 rounded-[10px] shadow-soft"
              >
                Show demo data
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => {
            const keepId = primaryOf(g.key, g.members);
            return (
              <div key={g.reason + g.key} className="bg-white border border-lavender-deep rounded-[18px] shadow-soft overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-lavender-deep bg-[var(--s-warn)] flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center text-white" style={{ background: "var(--s-warn)" }}>
                      <Icon name="copy" size={16} />
                    </span>
                    <div>
                      <div className="font-display text-[15.5px] text-purple leading-tight">
                        {g.members.length} profiles look like the same person
                      </div>
                      <div className="text-[13px] text-body-soft">
                        matched on {g.reason === "phone" ? `phone ending ${g.key}` : "identical name"}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => doMerge(g.key, g.members)}
                    className="bg-purple hover:bg-purple-deep text-white text-[13px] font-medium px-4 py-2 rounded-[10px] shadow-soft"
                  >
                    Merge into selected
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
                  {g.members.map((m) => {
                    const isKeep = m.id === keepId;
                    return (
                      <label
                        key={m.id}
                        className={
                          "flex items-start gap-3 border rounded-[14px] p-3.5 cursor-pointer transition-colors " +
                          (isKeep ? "border-orchid bg-orchid-soft/40" : "border-lavender-deep hover:border-orchid-mid")
                        }
                      >
                        <input
                          type="radio"
                          name={"dup-" + g.reason + g.key}
                          checked={isKeep}
                          onChange={() => setPrimary((p) => ({ ...p, [g.key]: m.id }))}
                          className="mt-1 accent-[var(--t-orchid)]"
                        />
                        <span
                          className="w-[38px] h-[38px] rounded-full grid place-items-center text-white text-[12px] font-medium font-display shrink-0"
                          style={{ background: m.avatarBg || genAvatar(m.id) }}
                        >
                          {initials(m.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-purple">{m.name}</span>
                            {isKeep && <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple text-white font-semibold">KEEP THIS</span>}
                          </div>
                          <div className="text-[13px] text-body-soft">{m.phone} · {m.country}</div>
                          <div className="text-[12px] text-body mt-1.5">
                            <b className="text-purple">{m.ordersCount}</b> orders · <b className="text-purple">{formatTaka(m.ltvPaisa)}</b>
                            {" · "}{(m.recipients?.length ?? 0)} recipients
                          </div>
                          <div className="text-[13px] text-body-soft mt-0.5">last order {ago(m.lastOrderAt)}</div>
                          <Link href={`/customers/${m.id}`} className="text-[11.5px] font-semibold text-orchid mt-1 inline-block">
                            Open profile →
                          </Link>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
