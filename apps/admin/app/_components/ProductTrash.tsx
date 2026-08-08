"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { listTrash, restoreProduct, purgeProduct, formatTaka, genBg, type ApiProduct } from "../_data/api";

/*
  Deleted products.
  Radian never hard-deletes — `remove()` only stamps `deletedAt`. Until now the
  API had a restore() endpoint with no way to reach it, so a product deleted by
  mistake was gone for good from the admin's point of view. This screen is that
  missing door.
*/
const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";
type TrashItem = ApiProduct & { deletedAt: string };

export default function ProductTrash() {
  const [rows, setRows] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  /*  every outcome is said out loud — the owner's complaint was exactly
      "delete holo ki holo na, kichui janay na" (6 Aug 2026)  */
  const [flash, setFlash] = useState<{ ok: string[]; refused: string[] } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await listTrash();
      setRows(r.items);
      setErr("");
    } catch {
      setErr("Could not reach the API. Start it with: docker compose up -d postgres api");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function restore(p: TrashItem) {
    if (!confirm(`Bring "${p.name}" back to the catalog?`)) return;
    setBusy(p.id);
    try {
      await restoreProduct(p.id);
      setRows((x) => x.filter((y) => y.id !== p.id));
    } catch (e) {
      alert("Restore failed: " + (e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  }

  /*  6 Aug 2026 — the owner asked for a way to actually empty this list; it
      held 74 rows of test junk with no exit. The SERVER holds the rule, not
      this button: anything an order ever sold is refused with a plain
      sentence and stays recoverable.

      ⚠️ The first version demanded a typed word to confirm, and reported
      failure only through alert(). The owner's verdict: typing is
      "biroktikor", and he could not tell whether anything happened at all.
      Now: a plain confirm, and EVERY outcome lands in a banner — what got
      deleted, what the server refused and why. Feedback is not optional on
      a destructive action.  */
  async function purgeMany(list: TrashItem[]) {
    if (!list.length) return;
    const label = list.length === 1 ? `"${list[0].name}"` : `${list.length} products`;
    if (!confirm(`Permanently delete ${label}? This cannot be undone.\n\nAnything an order ever sold will be refused by the server and kept recoverable.`)) return;
    setBusy("bulk");
    const okIds = new Set<string>();
    const ok: string[] = [];
    const refused: string[] = [];
    for (const p of list) {
      try {
        await purgeProduct(p.id);
        okIds.add(p.id);
        ok.push(p.name);
      } catch (e) {
        refused.push(e instanceof Error ? e.message : `${p.name}: could not delete`);
      }
    }
    setRows((x) => x.filter((y) => !okIds.has(y.id)));
    setSel(new Set());
    setFlash({ ok, refused });
    setBusy(null);
  }

  const shown = rows.filter(
    (p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.sku ?? "").toLowerCase().includes(q.toLowerCase()),
  );
  const daysSince = (d: string) => Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000));

  return (
    <div className={WRAP}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-orchid mb-1.5">
        <span className="w-[7px] h-[7px] rounded-full bg-orchid" /> Product Management · recovery
      </div>
      <h1 className="font-display text-[30px] text-purple m-0 mb-1">Deleted products</h1>
      <p className="text-body-soft text-[14px] mt-0 mb-5 max-w-[720px]">
        A removed product is only hidden — anything here can be put straight
        back, with its price, stock and order history intact. Delete forever
        works only on products no order has ever sold; anything with sales
        history is protected and stays recoverable.
      </p>

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <div className="relative max-w-[300px] w-full">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-soft">
            <Icon name="search" size={18} />
          </span>
          <input
            className="ipt ipt-icon h-[44px]"
            placeholder="Search deleted product or SKU…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button onClick={load} className="text-[12.5px] font-semibold px-4 py-2.5 rounded-[11px] bg-white border border-lavender-deep text-purple hover:border-orchid">
          Refresh
        </button>
        <span className="text-[13px] text-body-soft ml-auto">
          {loading ? "loading…" : `${shown.length} deleted`}
        </span>
      </div>

      {err && (
        <div className="flex gap-2.5 rounded-[14px] border-[1.5px] border-[#f0c88a] bg-[#fff8ec] px-4 py-3 mb-4 text-[12.5px] text-[#7a4b09]">
          <span className="text-[#b45309] shrink-0"><Icon name="bolt" size={18} /></span>
          <div>{err}</div>
        </div>
      )}

      {/* the answer to "did it delete or not" — every purge reports here */}
      {flash && (
        <div className="rounded-[14px] border border-lavender-deep bg-white px-4 py-3 mb-4 text-[13px] space-y-1">
          {flash.ok.length > 0 && (
            <div className="text-[#0f7d55] font-medium">
              ✓ Permanently deleted: {flash.ok.length === 1 ? flash.ok[0] : `${flash.ok.length} products`}
            </div>
          )}
          {flash.refused.map((r, i) => (
            <div key={i} className="text-[#a3261f]">✕ {r}</div>
          ))}
          {flash.ok.length === 0 && flash.refused.length === 0 && (
            <div className="text-body-soft">Nothing was deleted.</div>
          )}
          <button onClick={() => setFlash(null)} className="text-[12px] text-orchid hover:underline">Dismiss</button>
        </div>
      )}

      {/* bulk bar — same shape as All products */}
      {sel.size > 0 && (
        <div className="bg-orchid-soft border border-orchid-mid rounded-[12px] px-4 py-2.5 mb-3 flex items-center gap-3 flex-wrap">
          <b className="text-[13px] text-purple">{sel.size} selected</b>
          <button
            onClick={() => purgeMany(shown.filter((p) => sel.has(p.id)))}
            disabled={busy === "bulk"}
            className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] bg-white border border-[#e0a1a1] text-[#c0392b] hover:bg-[#fdecea] disabled:opacity-40"
          >
            {busy === "bulk" ? "Deleting…" : "Delete forever"}
          </button>
          <button onClick={() => setSel(new Set())} className="text-[12.5px] font-medium text-orchid ml-auto">Clear</button>
        </div>
      )}

      {!loading && !err && shown.length === 0 && (
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft px-5 py-16 text-center">
          <div className="font-display text-[18px] text-purple mb-1">Nothing has been deleted</div>
          <div className="text-[13px] text-body-soft">Good — the catalog is clean.</div>
        </div>
      )}

      {shown.length > 0 && (
        <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="text-body-soft text-[11px] uppercase tracking-[0.05em] bg-lavender/60">
                <th className="px-4 py-3 w-[40px]">
                  <input
                    type="checkbox"
                    checked={shown.length > 0 && shown.every((p) => sel.has(p.id))}
                    onChange={(e) =>
                      setSel(e.target.checked ? new Set(shown.map((p) => p.id)) : new Set())
                    }
                    title="Select all"
                  />
                </th>
                <th className="text-left font-medium px-4 py-3">Product</th>
                <th className="text-left font-medium px-4 py-3">Category</th>
                <th className="text-left font-medium px-4 py-3">Price</th>
                <th className="text-left font-medium px-4 py-3">Stock left</th>
                <th className="text-left font-medium px-4 py-3">Deleted</th>
                <th className="text-right font-medium px-4 py-3 w-[140px]" />
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="border-t border-lavender-deep hover:bg-lavender/60">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={sel.has(p.id)}
                      onChange={(e) =>
                        setSel((s) => {
                          const n = new Set(s);
                          e.target.checked ? n.add(p.id) : n.delete(p.id);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-[38px] h-[38px] rounded-[10px] shrink-0 opacity-60" style={{ background: genBg(p.slug) }} />
                      <div className="min-w-0">
                        <div className="font-medium text-purple truncate">{p.name}</div>
                        <div className="text-[13px] text-body-soft font-mono">{p.sku ?? "no SKU"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-body-soft">{p.category?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-purple font-medium">{formatTaka(p.offerPricePaisa)}</td>
                  <td className="px-4 py-3 text-body-soft">{p.stockQty}</td>
                  <td className="px-4 py-3">
                    <span className="text-[13px] text-body-soft">
                      {daysSince(p.deletedAt) === 0 ? "today" : `${daysSince(p.deletedAt)} days ago`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => restore(p)}
                      disabled={busy === p.id}
                      className="bg-purple hover:bg-purple-deep text-white text-[12.5px] font-semibold px-3.5 py-2 rounded-[10px] disabled:opacity-40 inline-flex items-center gap-1.5"
                    >
                      <Icon name="check" size={15} /> {busy === p.id ? "Working…" : "Restore"}
                    </button>
                    <button
                      onClick={() => purgeMany([p])}
                      disabled={busy === p.id || busy === "bulk"}
                      title="Permanently delete — refused if any order ever sold it"
                      className="ml-1.5 border border-[#e0a1a1] text-[#c0392b] hover:bg-[#fdecea] text-[12.5px] font-semibold px-3 py-2 rounded-[10px] disabled:opacity-40 inline-flex items-center gap-1.5"
                    >
                      <Icon name="trash" size={14} /> Delete forever
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-body-soft text-[12px] mt-4">
        Deleted products keep their order history, so restoring one never breaks
        an old order. See them in <Link href="/products/list" className="text-orchid hover:underline">All products</Link> once restored.
      </p>
    </div>
  );
}
