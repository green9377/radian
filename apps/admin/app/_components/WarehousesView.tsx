"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { WRAP, ACCENT, ItemPageHead, ErrBar, OkBar, DemoBar, Modal, Field, DataTable, msg } from "./ItemUI";
import {
  loadInvWarehousesSafe, createInvWarehouse, updateInvWarehouse, deleteInvWarehouse,
  getInvSettings, type ApiWarehouse,
} from "../_data/api";

/*
  Warehouses — DEC-INV-017 (10 Aug 2026).
  Architecture + reasoning: RADIAN_INVENTORY_MODULE_ARCHITECTURE.md.

  Why this screen exists: the owner's first purchase never reached stock because
  the shop had no warehouse — and there was no screen to make one. He was blamed
  for not doing something the system never let him do.

  The rules live in the API (a screen must never be the only guard). Here we only
  make them readable BEFORE he presses: a store holding goods says so on its own
  row, so "why can't I close this" is answered without a failed attempt.
*/

const ROW = "grid grid-cols-[minmax(160px,1.4fr)_110px_minmax(140px,1fr)_120px_150px] gap-3 items-center px-4 py-3";

const blank = { code: "", name: "", address: "" };

export default function WarehousesView() {
  const [rows, setRows] = useState<ApiWarehouse[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState(blank);
  const [edit, setEdit] = useState<ApiWarehouse | null>(null);

  /* which store the shop leans on — shown as a badge so closing one is not a
     surprise refusal (the API refuses too; this only explains it first) */
  const [defaults, setDefaults] = useState<Record<string, string[]>>({});

  async function load() {
    setLoading(true);
    try {
      const w = await loadInvWarehousesSafe();
      setRows(w.rows);
      setIsDemo(w.isDemo);
      try {
        const s = await getInvSettings();
        const map: Record<string, string[]> = {};
        const mark = (id: string | null | undefined, label: string) => {
          if (!id) return;
          map[id] = [...(map[id] ?? []), label];
        };
        mark(s.defaultSaleWarehouseId, "sales leave from here");
        mark(s.defaultReceiveWarehouseId, "purchases land here");
        mark(s.defaultAssemblyComponentWarehouseId, "assembly takes from here");
        mark(s.defaultAssemblyFinishedWarehouseId, "finished goods go here");
        setDefaults(map);
      } catch { setDefaults({}); }
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true); setErr(null);
    try { await fn(); setOk(done); await load(); }
    catch (e) { setErr(msg(e, "That did not work.")); }
    finally { setBusy(false); }
  }

  const active = rows.filter((r) => r.isActive);

  return (
    <div className={WRAP}>
      <ItemPageHead
        eyebrow="Operations · Inventory"
        title="Warehouses"
        right={
          <button onClick={() => { setDraft(blank); setAddOpen(true); }}
            className="text-white text-[13px] font-medium px-4 py-2.5 rounded-[10px] inline-flex items-center gap-2"
            style={{ background: ACCENT }}>
            <Icon name="plus" size={13} /> New warehouse
          </button>
        }
      />
      {isDemo && <DemoBar what="sample warehouses (actions need the API)" onRetry={load} />}
      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      {ok && <OkBar text={ok} onClose={() => setOk(null)} />}

      <DataTable head={
        <div className={ROW + " text-[11.5px] font-semibold uppercase tracking-[0.05em] text-white/95"}>
          <span>Name</span><span>Short code</span><span>Address</span><span>Status</span><span />
        </div>
      }>
        {loading && <div className="px-4 py-6 text-[13px] text-body-soft">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] text-body-soft">
            No warehouse yet — the first received purchase creates one automatically.
          </div>
        )}
        {rows.map((w) => (
          <div key={w.id} className={ROW}>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-body truncate">{w.name}</span>
              {(defaults[w.id] ?? []).length > 0 && (
                <span className="block text-[12px] text-body-soft">{defaults[w.id].join(" · ")}</span>
              )}
            </span>
            <span className="text-[12px] font-semibold px-2 py-1 rounded-[7px] justify-self-start"
              style={{ background: "#f5eafb", color: "#470066" }}>{w.code}</span>
            <span className="text-[13px] text-body-soft min-w-0 truncate">{w.address || "—"}</span>
            <span className="text-[11px] font-semibold px-2 py-1 rounded-full justify-self-start"
              style={w.isActive
                ? { background: "#e7f5f1", color: "#0e8f74" }
                : { background: "#f1eef4", color: "#7b6b88" }}>
              {w.isActive ? "Open" : "Closed"}
            </span>
            <span className="flex gap-2 justify-self-end">
              <button onClick={() => setEdit(w)}
                className="text-[12px] font-medium px-2.5 py-1.5 rounded-[8px] border border-lavender-deep text-purple hover:border-orchid">
                Edit
              </button>
              {w.isActive ? (
                <button disabled={busy || active.length < 2}
                  title={active.length < 2 ? "The shop must keep at least one open store" : undefined}
                  onClick={() => act(() => updateInvWarehouse(w.id, { isActive: false }), `${w.name} closed.`)}
                  className="text-[12px] font-medium px-2.5 py-1.5 rounded-[8px] border border-lavender-deep text-body-soft hover:border-orchid disabled:opacity-40">
                  Close
                </button>
              ) : (
                <button disabled={busy}
                  onClick={() => act(() => updateInvWarehouse(w.id, { isActive: true }), `${w.name} reopened.`)}
                  className="text-[12px] font-medium px-2.5 py-1.5 rounded-[8px] border border-lavender-deep text-purple hover:border-orchid disabled:opacity-40">
                  Reopen
                </button>
              )}
            </span>
          </div>
        ))}
      </DataTable>

      <p className="text-[12.5px] text-body-soft mt-3">
        Which store sales leave from, and which one purchases land in — set on{" "}
        <a href="/inventory/settings" className="underline font-medium" style={{ color: ACCENT }}>Settings</a>.
      </p>

      {/* ---------------- new ---------------- */}
      {addOpen && (
        <Modal title="New warehouse" onClose={() => setAddOpen(false)}
          saveLabel="Create" busy={busy}
          canSave={!!draft.code.trim() && draft.name.trim().length >= 2}
          onSave={() => act(
            async () => { await createInvWarehouse({ ...draft, address: draft.address || undefined }); setAddOpen(false); },
            `${draft.name.trim()} created.`,
          )}>
          <Field label="Name" required>
            <input className="ipt" value={draft.name} autoFocus
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Shop, Storeroom, Uttara branch…" />
          </Field>
          <Field label="Short code" required>
            <input className="ipt" value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} placeholder="STORE — set once, never changes" />
          </Field>
          <Field label="Address">
            <input className="ipt" value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Shantinagar, Dhaka" />
          </Field>
        </Modal>
      )}

      {/* ---------------- edit ---------------- */}
      {edit && (
        <Modal title={`Edit ${edit.code}`} onClose={() => setEdit(null)}
          busy={busy} canSave={edit.name.trim().length >= 2}
          onSave={() => act(
            async () => { await updateInvWarehouse(edit.id, { name: edit.name.trim(), address: edit.address ?? null }); setEdit(null); },
            "Saved.",
          )}>
          <Field label="Name" required>
            <input className="ipt" value={edit.name} autoFocus
              onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </Field>
          <Field label="Address">
            <input className="ipt" value={edit.address ?? ""}
              onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
          </Field>
          <p className="text-[12.5px] text-body-soft mt-1 mb-3">
            The short code <b className="text-body">{edit.code}</b> cannot change — old stock
            records point at it.
          </p>
          {/* Destructive, so kept away from Save. Refused by the API once the store
              has any history — closing keeps the old records readable. */}
          <button disabled={busy}
            onClick={() => act(
              async () => { await deleteInvWarehouse(edit.id); setEdit(null); },
              `${edit.name} deleted.`,
            )}
            className="text-[12.5px] font-medium underline disabled:opacity-40"
            style={{ color: "#c0392b" }}>
            Delete this warehouse
          </button>
          <span className="block text-[12px] text-body-soft mt-1">
            Only possible while it has never held stock. After that, close it instead.
          </span>
        </Modal>
      )}
    </div>
  );
}
