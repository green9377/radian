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

/*
  Orders -> Lost orders (owner, 9 Sep 2026; design/lost-orders-v1.html).

  One list of everyone who started to buy and did not finish:
    LEFT       typed something at checkout and left — whatever they typed is on the row
    FAILED     pressed Place Order, the gateway failed
    CANCELLED  pressed Place Order, then Cancel on the gateway
    UNPAID     opened the gateway and closed the tab
  The API decides all of that; this screen draws it and writes ONE thing —
  what staff did about a row (the Handled button).

  Same grid as All orders: the purple band, the segmented filter, eight cells,
  labelled buttons. Nothing tinted, no loose prose.
*/

const SOLID = { orchid: "#cf43ea", indigo: "#4f46e5", green: "#0e8a44", amber: "#d97706", red: "#d92d20", blue: "#1d7fd6", purple: "#470066", grey: "#8d7f98" };

const KIND: Record<ApiLostKind, { label: string; colour: string }> = {
  LEFT: { label: "Left at checkout", colour: SOLID.amber },
  FAILED: { label: "Payment failed", colour: SOLID.red },
  CANCELLED: { label: "Payment cancelled", colour: SOLID.red },
  UNPAID: { label: "Unpaid · closed tab", colour: SOLID.amber },
};
const OUTCOME: Record<ApiRecoveryOutcome, { label: string; colour: string }> = {
  CALLED: { label: "Called", colour: SOLID.blue },
  NO_ANSWER: { label: "No answer", colour: SOLID.grey },
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
  ["FAILED", "Payment failed / cancelled"],
  ["UNPAID", "Unpaid · closed tab"],
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

function Pill({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full text-white leading-none whitespace-nowrap" style={{ background: colour }}>
      {children}
    </span>
  );
}
function Tag({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-bold tracking-[0.06em] px-1.5 py-[2px] rounded-[5px] text-white leading-none" style={{ background: colour }}>
      {children}
    </span>
  );
}

function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  const ago = min < 60 ? `${min} min ago` : min < 24 * 60 ? `${Math.round(min / 60)} h ago` : "";
  return `${date} · ${time}${ago ? ` (${ago})` : ""}`;
}

/* the words a person typed, in the order they matter on a phone call */
const DRAFT_SKIP = new Set(["name", "phone", "email", "isGift", "recipientName", "recipientPhone", "address", "clientKey"]);
function draftLines(r: ApiLostRow): { k: string; v: string }[] {
  const out: { k: string; v: string }[] = [];
  if (r.isGift) out.push({ k: "gift for", v: [r.recipientName, r.recipientPhone].filter(Boolean).join(" · ") || "—" });
  if (r.address) out.push({ k: "address", v: r.address });
  if (r.draft) {
    for (const [k, v] of Object.entries(r.draft)) {
      if (DRAFT_SKIP.has(k)) continue;
      if (v === null || v === undefined || v === "" || v === false) continue;
      if (typeof v === "object") continue;
      out.push({ k: k.replace(/([A-Z])/g, " $1").toLowerCase(), v: String(v) });
    }
  }
  return out;
}

const CELL = "px-3 py-3 align-top border-b border-r border-[#dfd3ea] last:border-r-0";
const ACT = "h-[34px] rounded-[9px] px-3 inline-flex items-center gap-2 text-[12.5px] font-semibold whitespace-nowrap";

function copy(text: string) {
  try {
    void navigator.clipboard.writeText(text);
  } catch {
    /* blocked — nothing to do */
  }
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
  const lines = draftLines(r);

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
    <tr className="hover:bg-[#fcfaff]">
      <td className={`${CELL} w-[34px]`}>
        <Said say={say} />
        <input type="checkbox" className="w-4 h-4 accent-purple mt-0.5" aria-label={`Select ${r.ref}`} />
      </td>

      {/* ref */}
      <td className={`${CELL} w-[118px]`}>
        {r.orderId ? (
          <Link href={`/orders/${r.orderId}`} className="font-bold text-[15px] text-purple whitespace-nowrap hover:underline">{r.ref}</Link>
        ) : (
          <span className="font-bold text-[15px] text-purple">Checkout</span>
        )}
        <span className="block text-[11.5px] font-medium text-[#7b6b87] mt-1">{r.orderId ? "order placed" : "no order yet"}</span>
      </td>

      {/* when */}
      <td className={`${CELL} w-[172px]`}>
        <span className="block text-[11px] font-semibold text-[#7b6b87]">Last seen</span>
        <b className="block text-[12.5px] font-semibold text-body">{fmtStamp(r.lastSeenAt)}</b>
        {r.messaged && <span className="inline-block mt-1.5"><Tag colour={SOLID.blue}>AUTO-MESSAGED</Tag></span>}
      </td>

      {/* who & what they left */}
      <td className={CELL}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-[15px] leading-tight text-purple">{r.name || "— no name —"}</span>
          {r.isGift && <Tag colour={SOLID.orchid}>GIFT</Tag>}
        </div>
        {phone ? (
          <div className="flex items-center gap-1.5 mt-1 text-[14px] font-semibold text-purple">
            {phone}
            <button type="button" title="Copy phone" className="text-body-soft hover:text-purple" onClick={() => copy(phone)}>
              <Icon name="copy" size={11} />
            </button>
          </div>
        ) : (
          <div className="mt-1 text-[12.5px] font-semibold" style={{ color: SOLID.red }}>no phone typed</div>
        )}
        {r.email && <div className="text-[12.5px] font-medium text-body-soft">{r.email}</div>}
        {(lines.length > 0 || r.cartSummary.length > 0) && (
          <div className="mt-1.5 rounded-[10px] border border-[#dfd3ea] bg-[#faf7fc] px-2.5 py-2 text-[12.5px] leading-[1.5]">
            {lines.map((l, i) => (
              <span key={i}>
                {i > 0 && " · "}
                <span className="font-medium text-[#7b6b87]">{l.k}</span> <b className="font-semibold text-body">{l.v}</b>
              </span>
            ))}
            {r.cartSummary.length > 0 && (
              <span>
                {lines.length > 0 && " · "}
                <span className="font-medium text-[#7b6b87]">cart</span>{" "}
                <b className="font-semibold text-body">
                  {r.cartSummary.map((c) => `${c.name ?? "item"}${c.qty && c.qty > 1 ? ` ×${c.qty}` : ""}`).join(", ")}
                </b>
              </span>
            )}
          </div>
        )}
        <div className="flex gap-[3px] mt-1.5" title={STAGE_LABEL[r.stage]}>
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className="w-[18px] h-[6px] rounded-[3px]" style={{ background: i <= STAGE_INDEX[r.stage] ? SOLID.purple : "#e7dff0" }} />
          ))}
        </div>
      </td>

      {/* value */}
      <td className={`${CELL} w-[120px] whitespace-nowrap`}>
        <span className="inline-block w-[40px] text-[11px] font-semibold text-[#7b6b87]">{r.orderId ? "Order" : "Cart"}</span>
        <b className="font-semibold text-[15px] text-body">{formatTaka(r.totalPaisa)}</b>
        <span className="block text-[12px] font-medium text-[#7b6b87] mt-0.5">{r.itemCount} item{r.itemCount === 1 ? "" : "s"}</span>
      </td>

      {/* why it stopped */}
      <td className={`${CELL} w-[190px]`}>
        <div className="flex flex-col items-start gap-1.5">
          {r.bucket === "OPEN" ? <Pill colour={kind.colour}>{kind.label}</Pill> : <Pill colour={r.bucket === "RECOVERED" ? SOLID.green : SOLID.grey}>{r.bucket === "RECOVERED" ? "Recovered" : "Closed"}</Pill>}
          <span className="text-[12.5px] font-semibold leading-snug" style={{ color: r.bucket === "OPEN" ? SOLID.red : "#7b6b87" }}>{r.reason}</span>
          {r.lastOutcome && (
            <span className="text-[12px] font-medium text-body-soft leading-snug">
              <b className="font-semibold" style={{ color: OUTCOME[r.lastOutcome.outcome].colour }}>{OUTCOME[r.lastOutcome.outcome].label}</b>
              {" · "}{r.lastOutcome.actor} · {fmtStamp(r.lastOutcome.at)}
              {r.lastOutcome.note ? <> — {r.lastOutcome.note}</> : null}
            </span>
          )}
        </div>
      </td>

      {/* action */}
      <td className={`${CELL} w-[176px]`}>
        <div className="flex flex-col gap-1.5">
          {phone && (
            <a href={`tel:${phone}`} className={`${ACT} text-white`} style={{ background: SOLID.green }}>
              <Icon name="phone" size={14} /> Call
            </a>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className={`${ACT} bg-white border-[1.5px]`} style={{ color: SOLID.green, borderColor: SOLID.green }}>
              <Icon name="phone" size={14} /> {r.leadId ? "WhatsApp cart link" : "Send pay link"}
            </a>
          )}
          {r.orderId && (
            <Link href={`/orders/${r.orderId}`} className={`${ACT} bg-white border-[1.5px] border-purple text-purple`}>
              <Icon name="eye" size={14} /> Open order
            </Link>
          )}
          {r.bucket === "OPEN" && (
            <button type="button" onClick={() => setOpen((v) => !v)} className={`${ACT} bg-white border-[1.5px] border-[#dfd3ea] text-purple`}>
              <Icon name="check" size={14} /> Handled
            </button>
          )}
          {open && (
            <div className="mt-1 rounded-[12px] border-[1.5px] border-[#dfd3ea] bg-white p-2.5 w-[240px]">
              <input className="ipt h-[36px] text-[12.5px] mb-2" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(OUTCOME) as ApiRecoveryOutcome[]).map((k) => (
                  <button key={k} type="button" disabled={busy} onClick={() => handle(k)} className="text-[11.5px] font-bold px-2.5 py-1.5 rounded-full text-white disabled:opacity-50" style={{ background: OUTCOME[k].colour }}>
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

function Band({ loading, s }: { loading: boolean; s: ApiLostList["stats"] | null }) {
  const v = (f: (x: ApiLostList["stats"]) => string) => (loading || !s ? "…" : f(s));
  const tiles = [
    { label: "Open now", value: v((x) => String(x.open)), hot: !!s && s.open > 0 },
    { label: "Value at stake", value: v((x) => formatTaka(x.atStakePaisa)) },
    { label: "Recovered · 30 days", value: v((x) => `${x.recovered30} · ${formatTaka(x.recovered30Paisa)}`) },
    { label: "Auto-messaged · 30 days", value: v((x) => String(x.messaged30)) },
  ];
  return (
    <div className="rounded-[20px] px-6 pt-5 pb-6 mb-4 text-white" style={{ background: "linear-gradient(135deg,#320049 0%,#5a0a80 100%)" }}>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="font-display font-semibold text-[24px] leading-none m-0 inline-flex items-center gap-2.5 text-white">
          Lost orders
          <span
            className="w-5 h-5 rounded-full border border-white/40 text-[11px] font-semibold grid place-items-center font-ui cursor-help"
            title="Everyone who started to buy and did not finish: typed something at checkout and left, pressed Place Order and the payment failed or was cancelled, or opened the gateway and closed the tab. Whatever they typed is on the row. Recovered = came back and ordered, or paid on a later attempt, or marked Ordered by staff."
          >
            i
          </span>
        </h1>
        <Link href="/marketing/recovery" className="text-[12.5px] font-semibold text-[#d9c5e6] hover:text-white inline-flex items-center gap-1">
          Rules · Recovery settings <Icon name="chevronRight" size={14} />
        </Link>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="block rounded-[14px] px-4 py-3.5 border border-white/15 bg-white/[0.08]">
            <span className="block text-[11.5px] font-medium text-[#d9c5e6]">{t.label}</span>
            <span className="block font-semibold text-[24px] leading-none mt-2" style={{ color: t.hot ? "#ffb4ad" : "#fff" }}>{t.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const HEADS = ["", "Ref", "When", "Who & what they left", "Value", "Why it stopped", "Action"];

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

  return (
    <div className={WRAP}>
      <Band loading={loading} s={data?.stats ?? null} />

      <div className="flex gap-2.5 flex-wrap items-center mb-3">
        <div className="inline-flex bg-white border-[1.5px] border-[#dfd3ea] rounded-[12px] p-1 gap-0.5 flex-wrap">
          {SEGS.map(([val, label]) => {
            const on = seg === val;
            return (
              <button key={val} type="button" onClick={() => setSeg(val)} className={`px-3.5 py-2 rounded-[9px] text-[13px] font-semibold inline-flex items-center gap-1.5 ${on ? "bg-purple text-white" : "text-body-soft hover:text-purple"}`}>
                {label}
                {!loading && val !== "RECOVERED" && val !== "CLOSED" && (
                  <em className={`not-italic text-[11px] px-1.5 py-[1px] rounded-full ${on ? "bg-white/20" : "bg-lavender-deep"}`}>{counts[val]}</em>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 min-w-[240px]">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft">
            <Icon name="search" size={17} />
          </span>
          <input className="ipt ipt-icon h-[42px] font-medium" placeholder="Name, phone, order no, address" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="text-[13px] font-semibold text-body-soft">{loading ? "…" : `${rows.length} row${rows.length === 1 ? "" : "s"}`}</span>
      </div>

      {error && <ErrorBox error={error} onRetry={load} />}

      <div className="bg-white border-[1.5px] border-[#dfd3ea] rounded-[14px] overflow-x-auto">
        <table className="w-full border-collapse text-[13px] min-w-[1080px]">
          <thead>
            <tr>
              {HEADS.map((h, i) => (
                <th key={h || "select"} className="text-left bg-lavender text-purple font-semibold text-[12px] tracking-[0.04em] uppercase px-3 py-2.5 border-b-[1.5px] border-r border-[#dfd3ea] last:border-r-0">
                  {i === 0 ? <input type="checkbox" className="w-4 h-4 accent-purple" aria-label="Select all" /> : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.key} r={r} onChanged={load} />
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <div className="px-4 py-12 text-center">
            <span className="w-11 h-11 rounded-full grid place-items-center mx-auto mb-2 bg-lavender text-purple">
              <Icon name="check" size={20} />
            </span>
            <p className="text-[13.5px] font-medium text-body-soft m-0">Nothing here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
