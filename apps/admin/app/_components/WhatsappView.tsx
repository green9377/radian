"use client";

import { useCallback, useEffect, useState } from "react";
import {
  WRAP, FinHeader, Card, Panel, Kpi, Table, Th, Td, Chip, Empty, Flash, Tabs, Banner, Bar,
  btnPrimary, btnPrimaryStyle, btnGhost, input, Lbl, taka, TONE, type Tone,
} from "./FinanceUI";
import {
  waTemplates, saveWaTemplate, deleteWaTemplate,
  waPreview, waBroadcasts, createBroadcast, getBroadcast, deleteBroadcast,
  markTargetSent, skipTarget, broadcastEffect, waLink, ago,
  type ApiWaTemplate, type ApiBroadcastRow, type ApiBroadcastDetail, type ApiAudienceFilter,
} from "../_data/api";

/*
  WHATSAPP — MKT-D18. Templates, lists, and a queue.

  No API, no approval, no per-message cost. The button opens WhatsApp with the
  message written out and a person presses Send — the same thing the occasion
  list already does, but with the message saved and reused, the list built from
  real filters, and a record of exactly who has been reached.

  It is slower than a bulk blast and it has one advantage the blast does not:
  somebody sees each message before it goes. The wrong list cannot reach three
  thousand people in four seconds.

  Every send writes an Outreach row, so the do-not-contact list applies here
  with no exception — a broadcast is a queue over outreach, not a second and
  less careful way to message people.
*/

const PURPOSES = ["PROMO", "OCCASION", "FOLLOW_UP", "CORPORATE", "WIN_BACK", "OTHER"];
const STATE_TONE: Record<string, Tone> = { DRAFT: "sky", SENDING: "amber", DONE: "emerald" };

export function WhatsappView() {
  const [tab, setTab] = useState<"SEND" | "TEMPLATES">("SEND");
  const [openId, setOpenId] = useState<string | null>(null);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Marketing"
        title="WhatsApp"
        sub="Write a message once, build a list of who should get it, then work down the queue. No API and no per-message cost — the button opens WhatsApp with the words already there and a person presses Send."
        emoji="💬"
        tone="emerald"
      />
      <Flash ok={ok} err={err} />

      {openId ? (
        <BroadcastQueue id={openId} onBack={() => setOpenId(null)} setOk={setOk} setErr={setErr} />
      ) : (
        <>
          <Tabs value={tab} onChange={setTab} items={[
            { key: "SEND", label: "Send lists", emoji: "📤", tone: "emerald" },
            { key: "TEMPLATES", label: "Messages", emoji: "✎", tone: "brand" },
          ]} />
          {tab === "SEND" && <Lists onOpen={setOpenId} setOk={setOk} setErr={setErr} />}
          {tab === "TEMPLATES" && <Templates setOk={setOk} setErr={setErr} />}
        </>
      )}
    </div>
  );
}

/* ---------------- messages ---------------- */

function Templates({ setOk, setErr }: { setOk: (s: string) => void; setErr: (s: string) => void }) {
  const [rows, setRows] = useState<ApiWaTemplate[]>([]);
  const [edit, setEdit] = useState<Partial<ApiWaTemplate> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await waTemplates()); } catch (e) { setErr((e as Error).message); }
  }, [setErr]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      await saveWaTemplate({ ...edit });
      setOk("Saved"); setEdit(null); await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <Banner tone="sky" emoji="✎" title="What goes in a message">
        Write it in your own words, in Bangla if that is how you speak to customers — a translated
        message reads like a machine and people can tell. Put <code>{"{customer}"}</code> where the
        name should go; <code>{"{shop}"}</code> and <code>{"{last_order}"}</code> also work.
      </Banner>

      <div className="mb-4">
        <button className={btnPrimary} style={btnPrimaryStyle}
          onClick={() => setEdit({ name: "", body: "", purpose: "PROMO", isActive: true })}>
          New message
        </button>
      </div>

      {edit && (
        <Card className="p-5 mb-5">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Lbl>What to call it</Lbl>
              <input className={input} value={edit.name ?? ""} placeholder="Eid greeting 2027"
                onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </div>
            <div>
              <Lbl>What it is for</Lbl>
              <select className={input} value={edit.purpose ?? "PROMO"}
                onChange={(e) => setEdit({ ...edit, purpose: e.target.value })}>
                {PURPOSES.map((p) => <option key={p} value={p}>{p.toLowerCase().replace("_", " ")}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Lbl>The message</Lbl>
            <textarea className={`${input} min-h-[130px]`} value={edit.body ?? ""}
              onChange={(e) => setEdit({ ...edit, body: e.target.value })}
              placeholder={"Assalamu alaikum {customer}, Radian theke bolchi…"} />
            <div className="text-[11.5px] text-body-soft mt-1">
              {(edit.body ?? "").length} characters
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button className={btnGhost} onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty emoji="✎" title="No messages saved yet"
            sub="Write the ones you send often — Eid, Valentine's, a thank-you after a first order — and they stop being retyped every time." />
        ) : (
          <Table head={<><Th>Name</Th><Th>Message</Th><Th>For</Th><Th right>Sent</Th><Th right></Th></>}>
            {rows.map((t) => (
              <tr key={t.id} className={t.isActive ? "" : "opacity-55"}>
                <Td><span className="font-semibold text-purple">{t.name}</span></Td>
                <Td><span className="text-[12.5px] text-body-soft">{t.body.slice(0, 70)}{t.body.length > 70 ? "…" : ""}</span></Td>
                <Td><Chip tone="brand">{t.purpose.toLowerCase().replace("_", " ")}</Chip></Td>
                <Td right>{t.usageCount}</Td>
                <Td right>
                  <div className="flex gap-1.5 justify-end">
                    <button className={btnGhost} onClick={() => setEdit(t)}>Edit</button>
                    <button className={btnGhost}
                      onClick={async () => { if (confirm(`Remove "${t.name}"?`)) { await deleteWaTemplate(t.id); setOk("Removed"); await load(); } }}>
                      Remove
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

/* ---------------- send lists ---------------- */

function Lists({
  onOpen, setOk, setErr,
}: { onOpen: (id: string) => void; setOk: (s: string) => void; setErr: (s: string) => void }) {
  const [rows, setRows] = useState<ApiBroadcastRow[]>([]);
  const [tpls, setTpls] = useState<ApiWaTemplate[]>([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState<ApiAudienceFilter & { name: string; templateId: string; body: string }>({
    name: "", templateId: "", body: "", notOrderedForDays: undefined, minOrders: undefined,
  });
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([waBroadcasts(), waTemplates()]);
      setRows(a); setTpls(b);
    } catch (e) { setErr((e as Error).message); }
  }, [setErr]);
  useEffect(() => { void load(); }, [load]);

  const check = async () => {
    try {
      const r = await waPreview({
        orderedWithinDays: f.orderedWithinDays, notOrderedForDays: f.notOrderedForDays,
        minOrders: f.minOrders, neverOrdered: f.neverOrdered,
      });
      setCount(r.count);
    } catch (e) { setErr((e as Error).message); }
  };

  const make = async () => {
    setBusy(true);
    try {
      const b = await createBroadcast({
        name: f.name, templateId: f.templateId || undefined, body: f.body || undefined,
        orderedWithinDays: f.orderedWithinDays, notOrderedForDays: f.notOrderedForDays,
        minOrders: f.minOrders, neverOrdered: f.neverOrdered,
      });
      setOk(`${b.name} — list built`);
      setShow(false); setCount(null);
      setF({ name: "", templateId: "", body: "" });
      await load();
      onOpen(b.id);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="mb-4">
        <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => setShow((v) => !v)}>
          {show ? "Close" : "New send list"}
        </button>
      </div>

      {show && (
        <Card className="p-5 mb-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Lbl>What to call this list</Lbl>
              <input className={input} value={f.name} placeholder="Eid greetings — regulars"
                onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div>
              <Lbl>Which message</Lbl>
              <select className={input} value={f.templateId}
                onChange={(e) => setF({ ...f, templateId: e.target.value })}>
                <option value="">Write one below</option>
                {tpls.filter((t) => t.isActive).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          {!f.templateId && (
            <div className="mt-4">
              <Lbl>The message</Lbl>
              <textarea className={`${input} min-h-[100px]`} value={f.body}
                onChange={(e) => setF({ ...f, body: e.target.value })}
                placeholder={"Assalamu alaikum {customer}…"} />
            </div>
          )}

          <div className="mt-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-body-soft mb-2">
              Who should get it
            </div>
            <div className="grid md:grid-cols-4 gap-3">
              <div><Lbl>Ordered in the last (days)</Lbl>
                <input className={input} value={f.orderedWithinDays ?? ""}
                  onChange={(e) => setF({ ...f, orderedWithinDays: Number(e.target.value) || undefined })} /></div>
              <div><Lbl>Has not ordered for (days)</Lbl>
                <input className={input} value={f.notOrderedForDays ?? ""}
                  onChange={(e) => setF({ ...f, notOrderedForDays: Number(e.target.value) || undefined })} /></div>
              <div><Lbl>At least this many orders</Lbl>
                <input className={input} value={f.minOrders ?? ""}
                  onChange={(e) => setF({ ...f, minOrders: Number(e.target.value) || undefined })} /></div>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer pb-2.5">
                <input type="checkbox" checked={!!f.neverOrdered}
                  onChange={(e) => setF({ ...f, neverOrdered: e.target.checked })} />
                <span>Never ordered</span>
              </label>
            </div>
            <p className="text-[11.5px] text-body-soft mt-2 mb-0">
              Anybody on the do-not-contact list is removed automatically and cannot be filtered
              back in.
            </p>
          </div>

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <button className={btnGhost} onClick={check}>How many is that?</button>
            {count !== null && (
              <span className="text-[13px] font-semibold" style={{ color: TONE.brand.text }}>
                {count} {count === 1 ? "person" : "people"}
              </span>
            )}
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={make}
              disabled={busy || !f.name.trim() || (!f.templateId && !f.body.trim())}>
              {busy ? "Building…" : "Build the list"}
            </button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty emoji="📤" title="No lists yet"
            sub="A list is a message plus the people who should get it. Build one, then work down the queue at your own pace — it remembers where you stopped." />
        ) : (
          <Table head={<><Th>List</Th><Th>Message</Th><Th>Progress</Th><Th right>People</Th><Th right></Th></>}>
            {rows.map((b) => (
              <tr key={b.id}>
                <Td>
                  <span className="font-semibold text-purple">{b.name}</span>
                  <div className="text-[11px] text-body-soft">{b.no} · {ago(b.createdAt)}</div>
                </Td>
                <Td><span className="text-[12px] text-body-soft">{b.template?.name ?? "written in"}</span></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Chip tone={STATE_TONE[b.state]}>{b.state.toLowerCase()}</Chip>
                  </div>
                  <div className="mt-1 w-[120px]">
                    <Bar pct={b._count.targets ? ((b.sent + b.skipped) / b._count.targets) * 100 : 0}
                      tone="emerald" height={5} />
                  </div>
                  <div className="text-[10.5px] text-body-soft mt-0.5">
                    {b.sent} sent · {b.skipped} skipped · {b.pending} left
                  </div>
                </Td>
                <Td right>{b._count.targets}</Td>
                <Td right>
                  <div className="flex gap-1.5 justify-end">
                    <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => onOpen(b.id)}>
                      {b.pending > 0 ? "Send" : "Open"}
                    </button>
                    <button className={btnGhost}
                      onClick={async () => { if (confirm(`Remove "${b.name}"?`)) { await deleteBroadcast(b.id); setOk("Removed"); await load(); } }}>
                      Remove
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

/* ---------------- the queue ---------------- */

function BroadcastQueue({
  id, onBack, setOk, setErr,
}: { id: string; onBack: () => void; setOk: (s: string) => void; setErr: (s: string) => void }) {
  const [b, setB] = useState<ApiBroadcastDetail | null>(null);
  const [effect, setEffect] = useState<{ sent: number; ordered: number; revenuePaisa: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, e] = await Promise.all([getBroadcast(id), broadcastEffect(id)]);
      setB(d); setEffect(e);
    } catch (e) { setErr((e as Error).message); }
  }, [id, setErr]);
  useEffect(() => { void load(); }, [load]);

  if (!b) return <Empty title="Loading…" />;

  const next = b.targets.find((t) => t.state === "PENDING");

  const send = async (targetId: string, phone: string, message: string) => {
    window.open(waLink(phone, message), "_blank", "noopener");
    try { await markTargetSent(targetId); await load(); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button className={btnGhost} onClick={onBack}>← All lists</button>
        <span className="font-display text-[18px] text-purple">{b.name}</span>
        <Chip tone={STATE_TONE[b.state]}>{b.state.toLowerCase()}</Chip>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="Left to send" value={String(b.counts.pending)} emoji="📤"
          tone={b.counts.pending > 0 ? "amber" : "emerald"} />
        <Kpi label="Sent" value={String(b.counts.sent)} emoji="✓" tone="emerald" />
        <Kpi label="Ordered afterwards" value={String(effect?.ordered ?? 0)} emoji="🛍" tone="emerald"
          hint={effect && effect.sent > 0 ? `${Math.round((effect.ordered / effect.sent) * 100)}% of those reached` : ""} />
        <Kpi label="Revenue that followed" value={taka(effect?.revenuePaisa ?? 0)} emoji="৳" tone="emerald" />
      </div>

      {next ? (
        <Card className="p-5 mb-5" tone="emerald" style={{ background: "#f6fdfa" }}>
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-body-soft mb-2">
            Next — {b.counts.pending} left
          </div>
          <div className="grid lg:grid-cols-[1fr_1.3fr] gap-5">
            <div>
              <div className="font-display text-[20px] text-purple">{next.customer.name}</div>
              <div className="text-[13px] text-body-soft mt-0.5">{next.customer.phone}</div>
              <div className="text-[12px] text-body-soft mt-2">
                {next.customer.ordersCount} order{next.customer.ordersCount === 1 ? "" : "s"}
                {next.customer.lastOrderAt ? ` · last ${ago(next.customer.lastOrderAt)}` : " · never ordered"}
              </div>
              <div className="flex gap-2 mt-4 flex-wrap">
                <button className={btnPrimary} style={btnPrimaryStyle}
                  onClick={() => void send(next.id, next.customer.phone, next.message)}>
                  Open WhatsApp & mark sent
                </button>
                <button className={btnGhost}
                  onClick={async () => { await skipTarget(next.id, "skipped"); await load(); }}>
                  Skip
                </button>
              </div>
              <p className="text-[11.5px] text-body-soft mt-3 mb-0">
                WhatsApp opens in a new tab with the message written out. You still press Send there
                — nothing leaves without a person looking at it.
              </p>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-body-soft mb-1.5">
                What they will get
              </div>
              <div className="rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed whitespace-pre-wrap"
                style={{ background: "#dcf8c6", color: "#111" }}>
                {next.message}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Banner tone="emerald" emoji="✓" title="Everybody on this list has been reached">
          {b.counts.sent} sent, {b.counts.skipped} skipped. The result is counted in the outreach
          report along with every other contact.
        </Banner>
      )}

      <Card className="overflow-hidden">
        <Table head={<><Th>Customer</Th><Th>State</Th><Th>When</Th><Th right></Th></>}>
          {b.targets.map((t) => (
            <tr key={t.id} className={t.state === "PENDING" ? "" : "opacity-70"}>
              <Td>
                <span className="font-semibold text-purple">{t.customer.name}</span>
                <div className="text-[11px] text-body-soft">{t.customer.phone}</div>
              </Td>
              <Td>
                <Chip tone={t.state === "SENT" ? "emerald" : t.state === "SKIPPED" ? "slate" : "sky"}>
                  {t.state.toLowerCase()}
                </Chip>
                {t.note && <div className="text-[11px] text-body-soft mt-0.5">{t.note}</div>}
              </Td>
              <Td>{t.sentAt ? ago(t.sentAt) : "—"}</Td>
              <Td right>
                {t.state === "PENDING" && (
                  <button className={btnGhost}
                    onClick={() => void send(t.id, t.customer.phone, t.message)}>
                    Send
                  </button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
