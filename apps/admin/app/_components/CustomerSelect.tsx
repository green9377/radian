"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { listCustomers, formatTaka, type ApiCustomer } from "../_data/api";

/*
  Customer dropdown — ⇄ SWAPPED: searchable list from :4000 /customers.
  Pick one or "Create new customer". Used by the New order form.
*/

export default function CustomerSelect({
  selected,
  onSelect,
  onCreateNew,
}: {
  selected: ApiCustomer | null;
  onSelect: (c: ApiCustomer) => void;
  onCreateNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  useEffect(() => {
    listCustomers()
      .then((r) => setCustomers(r.items))
      .catch(() => {});
  }, []);

  const list = customers.filter((c) => {
    const ql = q.trim().toLowerCase();
    if (!ql) return true;
    const qd = ql.replace(/\D/g, "");
    const cd = c.phone.replace(/\D/g, "");
    return c.name.toLowerCase().includes(ql) || (qd.length >= 2 && cd.includes(qd));
  });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="ipt h-[44px] w-full flex items-center justify-between text-left"
      >
        <span className={selected ? "text-purple font-medium truncate" : "text-body-soft"}>
          {selected ? `${selected.name} (${selected.phone})` : "Select customer"}
        </span>
        <Icon name="chevronLeft" size={16} className={"shrink-0 text-body-soft transition-transform " + (open ? "rotate-90" : "-rotate-90")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 left-0 right-0 bg-white border border-lavender-deep rounded-[12px] shadow-lift overflow-hidden">
            <div className="p-2 border-b border-lavender-deep">
              <input autoFocus className="ipt h-[38px]" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="max-h-[240px] overflow-auto">
              {list.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelect(c);
                    setOpen(false);
                    setQ("");
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-lavender/60 border-b border-lavender-deep last:border-0"
                >
                  <div className="text-[13px] text-purple font-medium truncate">
                    {c.name} <span className="text-body-soft font-normal">({c.phone})</span>
                  </div>
                  <div className="text-[13px] text-body-soft">
                    {c.ordersCount} orders · LTV {formatTaka(c.ltvPaisa)}
                  </div>
                </button>
              ))}
              {list.length === 0 && <div className="px-3 py-3 text-[13px] text-body-soft">No customer matches “{q}”.</div>}
            </div>
            <button
              type="button"
              onClick={() => {
                onCreateNew();
                setOpen(false);
                setQ("");
              }}
              className="w-full text-left px-3 py-2.5 border-t border-lavender-deep text-purple font-medium text-[13px] inline-flex items-center gap-1.5 hover:bg-lavender/60"
            >
              <Icon name="plus" size={14} /> Create new customer
            </button>
          </div>
        </>
      )}
    </div>
  );
}
