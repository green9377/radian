"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { listTrash, restoreProduct, formatTaka, genBg, type ApiProduct } from "../_data/api";

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
      <p className="text-body-soft text-[14px] mt-0 mb-5 max-w-[640px]">
        Nothing is ever really deleted at Radian — a removed product is only
        hidden. Anything here can be put straight back, with its price, stock and
        order history intact.
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
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => restore(p)}
                      disabled={busy === p.id}
                      className="bg-purple hover:bg-purple-deep text-white text-[12.5px] font-semibold px-3.5 py-2 rounded-[10px] disabled:opacity-40 inline-flex items-center gap-1.5"
                    >
                      <Icon name="check" size={15} /> {busy === p.id ? "Restoring…" : "Restore"}
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
