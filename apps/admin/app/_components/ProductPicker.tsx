"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { listProducts, formatTaka, type ApiProduct } from "../_data/api";

/*
  Visual product picker — ⇄ SWAPPED: এখন :4000 /products থেকে।
  onAdd(slug) interface অপরিবর্তিত (edit form-ও একই)। Used by New order + Order edit.
*/

export default function ProductPicker({ onAdd, zone }: { onAdd: (slug: string, product: ApiProduct) => void; zone?: "dhaka" | "bangladesh" }) {
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<ApiProduct[]>([]);
  useEffect(() => {
    listProducts()
      .then((r) => setProducts(r.items))
      .catch(() => {});
  }, []);

  const list = products
    .filter((p) => (zone === "bangladesh" ? p.zone === "NATIONWIDE" : true) && p.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 40);

  return (
    <div>
      <label className="text-[13px] text-body-soft font-medium mb-1 block">Add a product</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-soft">
          <Icon name="search" size={17} />
        </span>
        <input className="ipt h-[42px] ipt-icon" placeholder="Search products by name…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-2 border border-lavender-deep rounded-[12px] max-h-[248px] overflow-auto bg-white">
        {list.map((p) => (
          <button
            key={p.slug}
            type="button"
            onClick={() => onAdd(p.slug, p)}
            className="w-full flex items-center gap-3 px-3 py-2 text-left border-b border-lavender-deep last:border-0 hover:bg-lavender/60 transition-colors"
          >
            {/*  Same rule as the product list: the real photo, or the words.
                A generated colour reads as a picture and hides the gap.  */}
            {p.images?.[0]?.url ? (
              <div
                className="w-[40px] h-[40px] rounded-[9px] shrink-0 border border-lavender-deep"
                style={{ background: `url(${p.images[0].url}) center/cover no-repeat` }}
              />
            ) : (
              <div className="w-[40px] h-[40px] rounded-[9px] shrink-0 border border-dashed border-lavender-deep bg-white grid place-items-center text-[8px] leading-[1.1] text-body-soft text-center px-1">
                No image
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-purple truncate">{p.name}</div>
              <div className="text-[13px] text-body-soft">
                {formatTaka(p.offerPricePaisa)}
                {p.productType === "CRAFTED" ? " · crafted (advance)" : " · readymade"}
              </div>
            </div>
            <span className="text-[12px] text-purple font-medium inline-flex items-center gap-1 shrink-0">
              <Icon name="plus" size={14} /> Add
            </span>
          </button>
        ))}
        {list.length === 0 && <div className="px-3 py-4 text-[13px] text-body-soft">No products match “{q}”.</div>}
      </div>
    </div>
  );
}
