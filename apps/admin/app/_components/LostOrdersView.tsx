"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { Said, useSay } from "./Said";
import { WRAP, ErrorBox } from "./OrderViews";
import {
  listLostOrders,
  handleLostOrder,
  formatTaka,
  WEB_BASE,
  type ApiLostRow,
  type ApiLostList,
  type ApiLostKind,
  type ApiRecoveryOutcome,
} from "../_data/api";
import {
  SOLID, CELL, LABEL, VALUE, SOFT, NO, NAME, TABLE_WRAP, TABLE,
  Pill, Tag, ActButton, Band, Segs, Search, Count, Head, Empty,
  fmtStamp, fmtAgo, CopyIcon, type Tile,
} from "./OrdersUi";

/*
  Orders -> Lost orders (owner, 9 Sep 2026; design/lost-orders-v1.html, cleaned
  up to design/orders-module-v4.html).

  One list of everyone who started to buy and did not finish:
    LEFT       typed something at checkout and left — whatever they typed is on the row
    FAILED     pressed Place Order, the gateway failed
    CANCELLED  pressed Place Order, then Cancel on the gateway
    UNPAID     opened the gateway and closed the tab
  The API decides all of that; this screen draws it and writes ONE thing —
  what staff did about a row (the Handled button).

  Ref says exactly what the thing is: an order number, or "Checkout lead".
  "Who & what they left" is always the same block — Recipient / Address /
  Deliver / Message / Items — so every row reads the same and an empty field
  shows a dash instead of vanishing.
*/

const KIND: Record<ApiLostKind, { label: string; colour: string }> = {
  LEFT: { label: "Left at checkout", colour: SOLID.amber },
  FAILED: { label: "Payment failed", colour: SOLID.red },
  CANCELLED: { label: "Payment cancelled", colour: SOLID.red },
  UNPAID: { label: "Unpaid · closed tab", colour: SOLID.grey },
};
const OUTCOME: Record<ApiRecoveryOutcome, { label: string; colour: string }> = {
  CALLED: { label: "Called", colour: SOLID.blue },
  NO_ANSWER: { label: "No answer", colour: SOLID.amber },
  WILL_PAY: { label: "Will pay", colour: SOLID.indigo },
  NOT_INTERESTED: { label: "Not interested", colour: SOLID.red },
  ORDERED: { label: "Ordered", colour: SOLID.green },
  CLOSED: { label: "Closed", colour: SOLID.grey },
};
const STAGE_INDEX: Record<ApiLostRow["stage"], number> = { CART: 1, DETAILS: 2, DELIVERY: 3, PAYMENT: 4, PLACED: 4 };
const STAGE_LABEL: Record<ApiLostRow["stage"], string> = { CART: "Left at cart", DETAILS: "Left at Details", DELIVERY: "Left at Delivery", PAYMENT: "Left at Payment", PLACED: "Order placed" };

type Seg = "OPEN" | "LEFT" | "FAILED" | "UNPAID" | "RECOVERED" | "CLOSED";
const SEGS: [Seg, string][] = [
  ["OPEN", "Open"],
  ["LEFT", "Left at checkout"],
  ["FAILED", "Failed / cancelled"],
  ["UNPAID", "Unpaid"],
  ["RECOVERED", "Recovered"],
  ["CLOSED", "Closed"],
];
function inSeg(r: ApiLostRow, seg: Seg): boolean {
  switch (seg) {
    case "OPEN": return r.bucket === "OPEN";
    case "LEFT": return r.bucket === "OPEN" && r.kind === "LEFT";
    case "FAILED": return r.bucket === "OPEN" && (r.kind === "FAILED" || r.kind === "CANCELLED");
    case "UNPAID": return r.bucket === "OPEN" && r.kind === "UNPAID";
    case "RECOVERED": return r.bucket === "RECOVERED";
    case "CLOSED": return r.bucket === "CLOSED";
  }
}

/* ---------- the fixed block: what a person typed, in the order a call needs it ---------- */
const KNOWN = new Set(["name", "phone", "email", "isGift", "recipientName", "recipientPhone", "address", "clientKey", "date", "slotLabel", "methodLabel", "giftMessage", "deliveryNotes", "zone", "step"]);
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function fmtDate(v: string | null): string | null {
  if (!v) return null;
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return v;
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function block(r: ApiLostRow): { k: string; v: string | null }[] {
  const d = r.draft ?? {};
  const recipient = r.isGift ? [r.recipientName, r.recipientPhone].filter(Boolean).join(" · ") || null : r.name || r.phone ? "Self" : null;
  const deliver = [fmtDate(str(d.date)), str(d.methodLabel), str(d.slotLabel)].filter(Boolean).join(" · ") || null;
  const items = r.cartSummary.length
    ? r.cartSummary.map((c) => `${c.name ?? "item"}${c.size ? ` (${c.size})` : ""}${c.qty && c.qty > 1 ? ` ×${c.qty}` : ""}`).join(", ")
    : r.itemCount > 0
      ? `${r.itemCount} item${r.itemCount === 1 ? "" : "s"}`
      : null;
  const out: { k: string; v: string | null }[] = [
    { k: "Recipient", v: recipient },
    { k: "Address", v: r.address },
    { k: "Deliver", v: deliver },
    { k: "Message", v: str(d.giftMessage) },
    { k: "Items", v: items },
  ];
  const notes = str(d.deliveryNotes);
  if (notes) out.push({ k: "Notes", v: notes });
  for (const [k, v] of Object.entries(d)) {
    if (KNOWN.has(k) || v === null || v === undefined || v === "" || v === false || typeof v === "object") continue;
    out.push({ k: k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()), v: String(v) });
  }
  return out;
}

function Row({ r, onChanged }: { r: ApiLostRow; onChanged: () => void }) {
  const say = useSay();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const kind = KIND[r.kind];
  const phone = r.phone ?? "";
  const cartLink = r.leadId ? `${WEB_BASE}/cart/${r.leadId}` : null;
  const payLink = r.orderNo ? `${WEB_BASE}/pay/${encodeURIComponent(r.orderNo)}` : null;
  const waText = r.leadId
    ? `Hi ${r.name || "there"}, this is Radian. Your cart is saved — finish your order here: ${cartLink}`
    : `Hi ${r.name || "there"}, this is Radian. Your order ${r.orderNo} is waiting for payment — pay here: ${payLink}`;
  const wa = phone ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(waText)}` : null;
  const lines = block(r);
  const openRow = r.bucket === "OPEN";

  async function handle(outcome: ApiRecoveryOutcome) {
    setBusy(true);
    try {
      await handleLostOrder({ leadId: r.leadId ?? undefined, orderId: r.orderId ?? undefined, outcome, note: note || undefined });
      setOpen(false);
      setNote("");
      onChanged();
    } catch (e) {
      say.fromError(e, "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="hover:bg-[var(--s-accent)]">
      {/* ref */}
      <td className={`${CELL} w-[140px]`}>
        <Said say={say} />
        {r.orderId ? (
          <>
            <Link href={`/orders/${r.orderId}`} className={NO}>{r.orderNo ?? r.ref}</Link>
            <span className={LABEL}>Order placed</span>
          </>
        ) : (
          <>
            <span className="font-medium text-purple">Checkout lead</span>
            <span className={`block ${SOFT}`}>{r.ref}</span>
            <span className={LABEL}>No order yet</span>
          </>
        )}
      </td>

      {/* when */}
      <td className={`${CELL} w-[150px]`}>
        <span className={LABEL}>Last seen</span>
        <span className={VALUE}>{fmtStamp(r.lastSeenAt)}</span>
        <span className={`block ${SOFT}`}>{fmtAgo(r.lastSeenAt)}</span>
        {r.messaged && <div className="mt-1.5"><Pill colour={SOLID.blue}>Auto-messaged</Pill></div>}
      </td>

      {/* who & what they left */}
      <td className={CELL}>
        <div className="flex items-center flex-wrap">
          {r.name ? <span className={NAME}>{r.name}</span> : <span className={SOFT}>No name typed</span>}
          {r.isGift && <Tag colour={SOLID.orchid}>GIFT</Tag>}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {phone ? (
            <span className="font-medium text-body inline-flex items-center gap-1.5">
              {phone}
              <CopyIcon text={phone} title="Copy phone" />
            </span>
          ) : (
            <span className="font-medium" style={{ color: SOLID.red }}>No phone typed</span>
          )}
          {r.email && <span className={SOFT}>· {r.email}</span>}
        </div>
        <div className="mt-2 grid grid-cols-[70px_1fr] gap-x-2 gap-y-[2px] rounded-[10px] border border-[var(--l-accent)] bg-[var(--s-accent)] px-2.5 py-2 text-[12.5px] leading-[1.45]">
          {lines.map((l) => (
            <span key={l.k} className="contents">
              <span className="font-medium text-[var(--t-accent)]">{l.k}</span>
              <span className={l.v ? "text-body" : "text-[var(--t-accent)]"}>{l.v ?? "—"}</span>
            </span>
          ))}
        </div>
        <div className="flex gap-[3px] mt-2">
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className="w-[18px] h-[6px] rounded-[3px]" style={{ background: i <= STAGE_INDEX[r.stage] ? SOLID.purple : "var(--s-accent)" }} />
          ))}
        </div>
        <span className={LABEL}>{STAGE_LABEL[r.stage]}</span>
      </td>

      {/* value */}
      <td className={`${CELL} w-[110px] whitespace-nowrap`}>
        <span className={LABEL}>{r.orderId ? "Order" : "Cart"}</span>
        <span className={VALUE}>{formatTaka(r.totalPaisa)}</span>
        <span className={`block ${SOFT}`}>{r.itemCount} item{r.itemCount === 1 ? "" : "s"}</span>
      </td>

      {/* why it stopped */}
      <td className={`${CELL} w-[200px]`}>
        <div className="flex flex-col items-start gap-1.5">
          {openRow ? <Pill colour={kind.colour}>{kind.label}</Pill> : <Pill colour={r.bucket === "RECOVERED" ? SOLID.green : SOLID.grey}>{r.bucket === "RECOVERED" ? "Recovered" : "Closed"}</Pill>}
          <span className="font-medium leading-snug" style={{ color: openRow ? SOLID.red : "var(--t-accent)" }}>{r.reason}</span>
          {r.lastOutcome ? (
            <span className={`text-[12px] ${SOFT} leading-snug`}>
              <span className="font-medium" style={{ color: OUTCOME[r.lastOutcome.outcome].colour }}>{OUTCOME[r.lastOutcome.outcome].label}</span>
              {" · "}{r.lastOutcome.actor} · {fmtStamp(r.lastOutcome.at)}
              {r.lastOutcome.note ? <> — {r.lastOutcome.note}</> : null}
            </span>
          ) : (
            openRow && <span className={`text-[12px] ${SOFT}`}>No follow-up yet</span>
          )}
        </div>
      </td>

      {/* action */}
      <td className={`${CELL} w-[176px]`}>
        <div className="flex flex-col gap-1.5">
          {phone && openRow && <ActButton kind="solid" colour={SOLID.green} href={`tel:${phone}`} external>Call</ActButton>}
          {wa && openRow && <ActButton kind="call" href={wa} external>{r.leadId ? "WhatsApp cart link" : "Send pay link"}</ActButton>}
          {r.orderId && <ActButton href={`/orders/${r.orderId}`}>Open order</ActButton>}
          {openRow && <ActButton onClick={() => setOpen((v) => !v)}>Handled</ActButton>}
          {open && (
            <div className="mt-1 rounded-[12px] border border-[var(--l-accent)] bg-white p-2.5 w-[240px]">
              <input className="ipt h-[36px] text-[12.5px] mb-2" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(OUTCOME) as ApiRecoveryOutcome[]).map((k) => (
                  <button key={k} type="button" disabled={busy} onClick={() => handle(k)} className="text-[11.5px] font-medium px-2.5 py-1.5 rounded-full text-white disabled:opacity-50" style={{ background: OUTCOME[k].colour }}>
                    {OUTCOME[k].label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

/*  the select column is gone — the checkbox on every row did nothing at all,
    and there was no bulk action for it to do (audit 11 Sep 2026)  */
const HEADS = ["Ref", "When", "Who & what they left", "Value", "Why it stopped", "Action"];
const HELP = "Everyone who started to buy and did not finish.";

export default function LostOrdersView() {
  const [data, setData] = useState<ApiLostList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seg, setSeg] = useState<Seg>("OPEN");
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await listLostOrders());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const all = useMemo(() => data?.rows ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<Seg, number> = { OPEN: 0, LEFT: 0, FAILED: 0, UNPAID: 0, RECOVERED: 0, CLOSED: 0 };
    for (const r of all) for (const [k] of SEGS) if (inSeg(r, k)) c[k]++;
    return c;
  }, [all]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((r) => inSeg(r, seg)).filter((r) => {
      if (!needle) return true;
      return (
        (r.name ?? "").toLowerCase().includes(needle) ||
        (r.phone ?? "").includes(needle) ||
        (r.orderNo ?? "").toLowerCase().includes(needle) ||
        (r.recipientName ?? "").toLowerCase().includes(needle) ||
        (r.address ?? "").toLowerCase().includes(needle)
      );
    });
  }, [all, seg, q]);

  const s = data?.stats;
  const v = (f: (x: NonNullable<typeof s>) => string) => (loading || !s ? "…" : f(s));
  const tiles: Tile[] = [
    { key: "OPEN", label: "Open now", value: v((x) => String(x.open)), hot: !!s && s.open > 0, sub: loading ? undefined : `${counts.LEFT} left · ${counts.FAILED} failed · ${counts.UNPAID} unpaid` },
    { key: "stake", label: "Value at stake", value: v((x) => formatTaka(x.atStakePaisa)), sub: "open rows" },
    { key: "RECOVERED", label: "Recovered · 30 days", value: v((x) => `${x.recovered30} · ${formatTaka(x.recovered30Paisa)}`), sub: "came back and paid" },
    { key: "messaged", label: "Auto-messaged · 30 days", value: v((x) => String(x.messaged30)), sub: "WhatsApp / SMS sent" },
  ];

  return (
    <div className={WRAP}>
      <Band
        title="Lost orders"
        help={HELP}
        columns={4}
        right={
          <Link href="/marketing/recovery" className="text-[12.5px] font-medium text-[var(--t-accent)] hover:text-white inline-flex items-center gap-1">
            Rules · Recovery settings <Icon name="chevronRight" size={14} />
          </Link>
        }
        tiles={tiles}
        active={seg === "OPEN" || seg === "RECOVERED" ? seg : undefined}
        onTile={(k) => (k === "OPEN" || k === "RECOVERED") && setSeg(k)}
      />

      <div className="flex gap-2.5 flex-wrap items-center mb-3">
        <Segs items={SEGS} value={seg} counts={loading ? undefined : counts} onChange={setSeg} />
        <Search value={q} onChange={setQ} placeholder="Name, phone, order no, address" />
        <Count n={rows.length} noun="row" loading={loading} />
      </div>

      {error && <ErrorBox error={error} onRetry={load} />}

      <div className={TABLE_WRAP}>
        <table className={TABLE}>
          <Head heads={HEADS} />
          <tbody>
            {rows.map((r) => (
              <Row key={r.key} r={r} onChanged={load} />
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <Empty text="Nothing here." />}
      </div>
    </div>
  );
}
