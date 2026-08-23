"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, ErrBar, Modal, Field, DataTable } from "./ItemUI";
import {
  listChannelRows, createChannel, updateChannelRow, deleteChannel,
  type ApiChannelRow,
} from "../_data/api";

/*
  SALES CHANNELS — where an order came in through. Owned by Sales (DEC-SAL-001);
  Marketing only reads it. A channel with orders behind it is switched OFF, never
  deleted — deleting would orphan history.

  Redesigned 19 Aug (owner): house master style, add via dialog, no prose. The
  active list FEEDS the New-order form's channel dropdown; the storefront books
  every web order under the `website` channel by slug.
*/

const ROW = "grid grid-cols-[minmax(0,1fr)_120px_80px_80px_150px] items-center gap-2 px-4";

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function ChannelsView() {
  const [rows, setRows] = useState<ApiChannelRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [dlg, setDlg] = useState<{ name: string; slug: string } | null>(null);

  const load = useCallback(async () => {
    try { setRows(await listChannelRows()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const dup = !!dlg && !!dlg.name.trim() && rows.some(
    (r) => r.name.toLowerCase() === dlg.name.trim().toLowerCase() ||
      r.slug === (dlg.slug.trim() || slugify(dlg.name)),
  );

  const add = async () => {
    if (!dlg || !dlg.name.trim() || dup) return;
    setBusy(true); setErr(""); setOk("");
    try {
      const c = await createChannel({ name: dlg.name.trim(), slug: dlg.slug.trim() || slugify(dlg.name) });
      setOk(`${c.name} added`);
      setDlg(null);
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const toggle = async (c: ApiChannelRow) => {
    try { await updateChannelRow(c.id, { isActive: !c.isActive }); await load(); }
    catch (e) { setErr((e as Error).message); }
  };

  const remove = async (c: ApiChannelRow) => {
    const used = c._count?.orders ?? 0;
    if (used > 0) {
      setErr(`${c.name} has ${used} order(s) behind it — switch it off instead.`);
      return;
    }
    if (!confirm(`Remove ${c.name}?`)) return;
    try { await deleteChannel(c.id); setOk(`${c.name} removed`); await load(); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Orders · channels"
        title="Sales channels"
        right={
          <button onClick={() => setDlg({ name: "", slug: "" })}
            className="text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2"
            style={{ background: ACCENT }}>
            <Icon name="plus" size={15} /> Add channel
          </button>
        }
      />
      {err && <ErrBar text={err} onClose={() => setErr("")} />}
      {ok && (
        <div className="rounded-[12px] px-4 py-3 mb-4 text-[13px] font-medium" style={{ background: "#e8f7ef", color: "#0e7a3d" }}>{ok}</div>
      )}

      <DataTable
        head={<div className={ROW + " py-2.5"}><span>Channel</span><span>Code</span><span>Orders</span><span>State</span><span className="text-right">Action</span></div>}
      >
        {rows.map((c) => (
          <div key={c.id} className={ROW + " py-2.5 hover:bg-lavender/15"}>
            <span className="text-[13.5px] font-semibold text-purple truncate">{c.name}</span>
            <span className="text-[12.5px] font-mono text-body-soft truncate">{c.slug}</span>
            <span className="text-[12.5px] font-medium text-body">{c._count?.orders ?? 0}</span>
            <span>
              {c.isActive
                ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#e8f7ef", color: "#0e7a3d" }}>on</span>
                : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#f1eef4", color: "#8a7b96" }}>off</span>}
            </span>
            {/*  DEC-CHN-001 — the website is the shop itself, not a channel
                 anybody set up. A channel answers "where did this hand-written
                 sale come from" — Foodpanda, WhatsApp, a walk-in. The website
                 needs no answer: every order it takes is online by definition.
                 So its row carries no buttons; deleting it once left the demo
                 unable to take a single order.  */}
            {c.slug === "website" ? (
              <span className="flex items-center justify-end gap-1.5 text-body-soft" title="The shop's own website — every online order is filed under it">
                <Icon name="shield" size={14} />
                <span className="text-[12px] font-semibold">Built in</span>
              </span>
            ) : (
              <span className="flex items-center justify-end gap-1">
                <button onClick={() => void toggle(c)}
                  className="text-[12px] font-medium px-2.5 py-1 rounded-[8px] border border-lavender-deep text-purple hover:border-orchid">
                  {c.isActive ? "Switch off" : "Switch on"}
                </button>
                <button onClick={() => void remove(c)}
                  className="text-body-soft hover:text-[#c0392b] px-1.5 py-1" title="Remove"><Icon name="trash" size={15} /></button>
              </span>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="text-center py-12 text-[13.5px] text-purple font-semibold">No channels yet — press Add channel</div>
        )}
      </DataTable>

      {dlg && (
        <Modal
          title="Add channel"
          onClose={() => setDlg(null)}
          onSave={add}
          canSave={!!dlg.name.trim() && !dup}
          busy={busy}
        >
          <Field label="Channel name" required>
            <input autoFocus className="ipt w-full" placeholder="e.g. foodpanda"
              value={dlg.name} onChange={(e) => setDlg({ ...dlg, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && dlg.name.trim() && !dup) add(); }} />
            {dup && (
              <span className="block text-[12.5px] font-semibold text-[#c0392b] mt-1">
                That channel already exists.
              </span>
            )}
          </Field>
          <Field label="Short code">
            <input className="ipt w-full font-mono text-[13px]" placeholder={slugify(dlg.name) || "made from the name"}
              value={dlg.slug} onChange={(e) => setDlg({ ...dlg, slug: e.target.value })} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
