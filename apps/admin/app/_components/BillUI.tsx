"use client";

import React from "react";
import Icon from "./Icon";
import { formatTaka } from "../_data/api";

/*
  The shared face of a BILL page — purchase bill and counter bill alike
  (owner, 21 Aug: "payment section k iteam ar moto colorfull kro… timeline
  alada design a anba… subtotal/discount section ta purple kre futaia tulba…
  2 bar jen kra na lage").

  One file so the two pages cannot drift apart: the purple money rail, the
  coloured payment rows and the timeline are the same components on both.
*/

/* ------------------------------------------------- method colours (GBL-006) */

const METHOD_LOOK: Record<string, { deep: string; tint: string }> = {
  CASH:  { deep: "var(--t-ok)", tint: "var(--t-ok)" },
  BKASH: { deep: "var(--t-orchid)", tint: "var(--t-orchid)" },
  NAGAD: { deep: "var(--t-warn)", tint: "var(--t-warn)" },
  CARD:  { deep: "var(--t-info)", tint: "var(--t-info)" },
  BANK:  { deep: "var(--t-info)", tint: "var(--t-info)" },
  ONLINE:{ deep: "var(--t-info)", tint: "var(--t-info)" },
  COD:   { deep: "var(--t-ok)", tint: "var(--t-ok)" },
};

export function MethodChip({ method }: { method: string }) {
  const look = METHOD_LOOK[method.toUpperCase()] ?? { deep: "var(--t-accent)", tint: "var(--t-accent)" };
  const label = method.length <= 4 ? method.toUpperCase() : method[0].toUpperCase() + method.slice(1).toLowerCase();
  return (
    <span className="text-[10.5px] font-bold tracking-[0.04em] px-2.5 py-1 rounded-full shrink-0"
      style={{ background: look.tint, color: look.deep }}>
      {label === "Bkash" ? "bKash" : label}
    </span>
  );
}

/* ----------------------------------------------------------- payments card */

export interface PayLine {
  id: string;
  when: string; // already formatted
  method: string;
  amountPaisa: number;
  by?: string | null;
  note?: string | null;
  /** REFUND rows print red and negative */
  out?: boolean;
}

export function PaymentsCard({ rows, action, emptyText = "Nothing paid yet." }: {
  rows: PayLine[];
  action?: React.ReactNode;
  emptyText?: string;
}) {
  return (
    <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden mb-5">
      <div className="flex items-center justify-between gap-3 pl-4 pr-2.5 py-2" style={{ background: "var(--s-accent)" }}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-white inline-flex items-center gap-2">
          <Icon name="cash" size={13} /> Payments
        </span>
        {action}
      </div>
      {rows.length === 0 && <p className="text-[13px] text-body-soft px-4 py-4 m-0">{emptyText}</p>}
      {rows.map((x) => {
        const look = METHOD_LOOK[x.method.toUpperCase()] ?? { deep: "var(--t-accent)", tint: "var(--t-accent)" };
        return (
          <div key={x.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-lavender-deep/60 first:border-0">
            <span className="w-[32px] h-[32px] rounded-full grid place-items-center shrink-0"
              style={{ background: look.tint, color: look.deep }}>
              <Icon name={x.out ? "download" : "cash"} size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <MethodChip method={x.method} />
                {x.note && <span className="text-[11.5px] text-body-soft truncate">{x.note}</span>}
              </span>
              <span className="block text-[11.5px] text-body-soft mt-0.5">{x.when}{x.by ? ` · ${x.by}` : ""}</span>
            </span>
            <b className="text-[14.5px] shrink-0" style={{ color: x.out ? "var(--t-bad)" : "var(--t-ok)", fontVariantNumeric: "tabular-nums" }}>
              {x.out ? "− " : ""}{formatTaka(x.amountPaisa)}
            </b>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- timeline */

export interface BillEvent {
  id: string;
  kind: string; // payment · system · delivery · sales · general…
  label: string;
  when: string; // already formatted
  by?: string | null;
}

const EVENT_LOOK: Record<string, { icon: string; deep: string; tint: string }> = {
  payment:  { icon: "cash",    deep: "var(--t-ok)", tint: "var(--t-ok)" },
  system:   { icon: "gear",    deep: "var(--t-soft)", tint: "var(--t-accent)" },
  delivery: { icon: "truck",   deep: "var(--t-info)", tint: "var(--t-info)" },
  sales:    { icon: "tag",     deep: "var(--t-orchid)", tint: "var(--t-orchid)" },
};

export function BillTimeline({ events }: { events: BillEvent[] }) {
  if (!events.length) return null;
  return (
    <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden mb-5">
      <div className="pl-4 pr-2.5 py-2" style={{ background: "var(--s-accent)" }}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-white inline-flex items-center gap-2">
          <Icon name="clock" size={13} /> Timeline
        </span>
      </div>
      <div className="px-4 py-4">
        {events.map((e, i) => {
          const look = EVENT_LOOK[e.kind] ?? { icon: "sparkle", deep: "var(--t-accent)", tint: "var(--t-accent)" };
          return (
            <div key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
              {/*  the thread — stops at the last bead  */}
              {i < events.length - 1 && (
                <span aria-hidden className="absolute left-[15px] top-[32px] bottom-0 w-[2px]" style={{ background: "var(--s-accent)" }} />
              )}
              <span className="relative w-[32px] h-[32px] rounded-full grid place-items-center shrink-0"
                style={{ background: look.tint, color: look.deep }}>
                <Icon name={look.icon} size={14} />
              </span>
              <span className="min-w-0 pt-[2px]">
                <span className="block text-[13px] font-medium text-body leading-snug">{e.label}</span>
                <span className="block text-[11.5px] text-body-soft mt-0.5">{e.when}{e.by ? ` · ${e.by}` : ""}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- the money rail */

export interface RailRow {
  label: string;
  paisa: number;
  /** "minus" prints − and green (money off), "plus" prints + */
  tone?: "plus" | "minus";
}

/**
 * The bill's money, in the same dark-purple voice as the till and the new
 * purchase form (CLAUDE.md §14): the payable is the loudest thing, the
 * arithmetic sits under it, and paid/due close the story in colour.
 */
export function MoneyRail({ totalLabel = "Payable", totalPaisa, rows, paidPaisa, duePaisa, dueLabel = "Due" }: {
  totalLabel?: string;
  totalPaisa: number;
  rows: RailRow[];
  paidPaisa: number;
  duePaisa: number;
  dueLabel?: string;
}) {
  return (
    <div className="rounded-[16px] text-white shadow-lift overflow-hidden p-4"
      style={{ background: "linear-gradient(170deg,var(--a-solid),var(--a-solid))" }}>
      <div className="rounded-[12px] px-3 py-3.5 text-center" style={{ background: "rgba(255,255,255,.07)" }}>
        <div className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--t-accent)] font-semibold">{totalLabel}</div>
        <div className="font-display text-[30px] leading-[1.15]" style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatTaka(totalPaisa)}
        </div>
      </div>

      <div className="mt-3 px-1 space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-[12.5px]">
            <span className="text-[var(--t-accent)] font-medium">{r.label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: r.tone === "minus" ? "var(--t-ok)" : "#fff" }}>
              {r.tone === "minus" ? "− " : r.tone === "plus" ? "+ " : ""}{formatTaka(Math.abs(r.paisa))}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="rounded-[12px] px-3 py-2.5" style={{ background: "rgba(127,224,168,.14)" }}>
          <div className="text-[10px] uppercase tracking-[0.08em] font-semibold" style={{ color: "var(--t-ok)" }}>Paid</div>
          <div className="text-[18px] font-semibold font-display" style={{ color: "var(--t-ok)", fontVariantNumeric: "tabular-nums" }}>
            {formatTaka(paidPaisa)}
          </div>
        </div>
        <div className="rounded-[12px] px-3 py-2.5"
          style={{ background: duePaisa > 0 ? "rgba(240,180,106,.16)" : "rgba(255,255,255,.07)" }}>
          <div className="text-[10px] uppercase tracking-[0.08em] font-semibold" style={{ color: duePaisa > 0 ? "var(--t-warn)" : "var(--t-accent)" }}>
            {duePaisa > 0 ? dueLabel : "Nothing owed"}
          </div>
          <div className="text-[18px] font-semibold font-display" style={{ color: duePaisa > 0 ? "var(--t-warn)" : "#fff", fontVariantNumeric: "tabular-nums" }}>
            {formatTaka(duePaisa)}
          </div>
        </div>
      </div>
    </div>
  );
}
