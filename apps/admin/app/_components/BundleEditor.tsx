"use client";

import { useEffect, useRef, useState } from "react";

import Icon from "./Icon";
import ProductPicker from "./ProductPicker";
import {
  formatTaka,
  getBundleList,
  saveBundleList,
  type ApiBundleList,
  type ApiProduct,
} from "../_data/api";

/*
  ═══════════════════════════════════════════════════════════════════════════
  BUNDLE EDITOR — এক product = একটাই তালিকা, একটাই ছাড়।  DEC-PRD-018

  মালিক, ২ আগস্ট ২০২৬:
  > *"just main product নিলে কোনো discount নেই, আর সাথে extra কোনো bundle
  >  থেকে product select করলেই সে discount পাবে — এটা আমার concept।"*

  ⚠️ এটা "প্যাকেজ" নয়, **তালিকা**। মালিক ৩-৪টা জিনিস রাখেন; গ্রাহক তার
  থেকে যা খুশি নেয়, বাকিগুলো skip করে। একটাও নিলেই ছাড় বসে — main product
  সহ মোট দামের উপর।

  ⚠️ আগের নকশায় প্রতিটা জিনিসের পাশে আলাদা ছাড়ের ঘর ছিল। মালিক সেটাই তুলে
  দিতে বলেছেন: *"protita product a individually discount ditachi... ata ami
  chai na"*. তিনটে আলাদা ছাড় দিয়ে "সব মিলিয়ে কত" বলা যায় না, আর সেটাই
  তিনি বলতে চান।

  ONE COMPONENT, TWO PLACES. A category's default list and one product's own
  are the same screen: the difference is a single id.

  ⚠️ NO PRICE FIELD, AND ITS ABSENCE IS THE FEATURE. The owner sets a
  DISCOUNT; every price is read from the added products themselves. All the
  arithmetic below arrives computed from the server — doing it again in the
  browser would give two answers to one question, and the one the owner reads
  while deciding would be the one nobody else uses.
  ═══════════════════════════════════════════════════════════════════════════
*/

type Owner = { categoryId: string; productId?: never } | { productId: string; categoryId?: never };

const EMPTY: ApiBundleList = {
  id: null,
  label: null,
  discountType: "NONE",
  discountValue: 0,
  items: [],
  basePaisa: 0,
  itemsPaisa: 0,
  beforePaisa: 0,
  afterPaisa: 0,
  savePaisa: 0,
};

export default function BundleEditor({
  owner,
  /** the product being edited — it must not be able to bundle itself */
  selfProductId,
  /** shown when a product has no list of its own and inherits its category's */
  inheritedFrom,
}: {
  owner: Owner;
  selfProductId?: string;
  inheritedFrom?: string;
}) {
  const [list, setList] = useState<ApiBundleList>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = owner.productId ?? owner.categoryId;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getBundleList(owner)
      .then((r) => alive && setList(r))
      .catch(() => alive && setList(EMPTY))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /*
    Saved on a short delay, not on every keystroke — typing a name would
    otherwise be fourteen requests. The server's recomputed figures come back
    in the response, so changing the discount updates the sum below it without
    a reload.
  */
  function save(next: ApiBundleList, delay = 450) {
    setList(next);
    setErr(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveBundleList({
        ...owner,
        addsProductIds: next.items.map((i) => i.id),
        label: next.label,
        discountType: next.discountType,
        discountValue: next.discountValue,
      })
        .then((saved) => setList(saved))
        .catch((e: Error) => setErr(e.message));
    }, delay);
  }

  function add(_slug: string, p: ApiProduct) {
    setErr(null);
    if (p.id === selfProductId) {
      setErr("A product cannot bundle itself.");
      return;
    }
    if (list.items.some((i) => i.id === p.id)) {
      setErr(`${p.name} is already on this list.`);
      return;
    }
    setPicking(false);
    save(
      {
        ...list,
        items: [
          ...list.items,
          {
            id: p.id,
            name: p.name,
            slug: p.slug,
            imageUrl: null,
            alonePaisa: p.offerPricePaisa,
            hiddenReason: null,
          },
        ],
      },
      0,
    );
  }

  if (loading) return <div className="text-[13px] text-body-soft">Loading…</div>;

  return (
    <div>
      {inheritedFrom && list.items.length === 0 && (
        <div className="flex items-start gap-2.5 bg-lavender/60 rounded-[11px] px-3 py-2.5 mb-3.5 text-[13px] text-body">
          <span className="text-purple shrink-0 mt-[1px]">
            <Icon name="layers" size={16} />
          </span>
          <span>
            This product shows <b className="font-semibold text-purple">{inheritedFrom}</b>&rsquo;s
            list. Add something below only if this product needs a different one — whatever you add
            here <b className="font-semibold text-purple">replaces</b> the category&rsquo;s, it does
            not add to it.
          </span>
        </div>
      )}

      {/* ── কী কী যোগ করা যাবে ── */}
      {list.items.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-3">
          {list.items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-2.5 bg-white border border-lavender-deep rounded-[10px] px-2.5 py-2"
            >
              {it.imageUrl ? (
                <span
                  className="w-[30px] h-[30px] rounded-[8px] shrink-0 border border-lavender-deep"
                  style={{ background: `url(${it.imageUrl}) center/cover no-repeat` }}
                />
              ) : (
                <span className="w-[30px] h-[30px] rounded-[8px] shrink-0 border border-dashed border-lavender-deep" />
              )}
              <span className="flex-1 min-w-0 text-[13.5px] text-purple font-medium truncate">
                {it.name}
              </span>
              {/*  ⚠️ যে জিনিসটা website-এ আসবে না সেটা এখানেই বলা হয়। নাহলে
                  মালিক তালিকা বানিয়ে page-এ কিছু না দেখে ধরে নেন ভাঙা।  */}
              {it.hiddenReason && (
                <span className="text-[11.5px] text-[#b45309] shrink-0">
                  {it.hiddenReason === "draft" ? "draft — hidden" : "out of stock — hidden"}
                </span>
              )}
              <span className="text-[13px] text-body-soft shrink-0">
                {formatTaka(it.alonePaisa)}
              </span>
              <button
                type="button"
                title="Take this one off the list"
                onClick={() => save({ ...list, items: list.items.filter((x) => x.id !== it.id) }, 0)}
                className="w-[28px] h-[28px] grid place-items-center rounded-[7px] text-body-soft hover:text-[#c0392b] shrink-0"
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {err && <div className="text-[13px] text-[#c0392b] mb-2.5">{err}</div>}

      {picking ? (
        <div className="border border-lavender-deep rounded-[12px] p-3 mb-3">
          <ProductPicker onAdd={add} />
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="mt-2.5 text-[13px] text-body-soft hover:text-purple"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setErr(null);
            setPicking(true);
          }}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-purple border border-lavender-deep bg-white rounded-[10px] px-3 py-2 hover:border-orchid transition-colors mb-3"
        >
          <Icon name="plus" size={15} /> Add a product
        </button>
      )}

      {/*
        ⚠️ ছাড়ের ঘরটা এখানে **নেই**, আর এটাই মালিকের নির্দেশ (২ আগস্ট):
        *"variant page a akhono discount button ache ja amder dorkar nai.
        amra price tab a sob kaj korbo."*

        এই card-এর একটাই কাজ: **কোন কোন জিনিস** যোগ করা যাবে। কত ছাড়,
        মোট কত, লাভ কত — সব Pricing tab-এ, এক জায়গায়। দাম-সংক্রান্ত
        সিদ্ধান্ত দুই পর্দায় ছড়ানো থাকলে মালিক কোনোদিন পুরো ছবিটা দেখতেন
        না, আর সেটাই তিনি ধরেছেন।
      */}
      {/*  THE PREVIEW — the old debt ("tells but doesn't show"). The server has
          always sent the computed sum (basePaisa … savePaisa) and this screen
          threw it away, leaving a sentence pointing at another tab. Now the
          owner sees the exact arithmetic the customer will see: main + the
          whole list, and what taking it all saves. The discount is still SET
          on the Pricing tab (owner, 2 Aug — money decisions live in one
          place); here it is only shown.  */}
      {list.items.length > 0 && (
        <div className="rounded-[12px] border border-lavender-deep bg-lavender/40 px-4 py-3 mt-1">
          <div className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-body-soft mb-2">
            What the customer sees
          </div>
          <div className="space-y-1 text-[13px]">
            <div className="flex justify-between gap-3">
              <span className="text-body-soft">Main product</span>
              <span className="font-medium text-body">{formatTaka(list.basePaisa)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-body-soft">
                All {list.items.length} bundle item{list.items.length > 1 ? "s" : ""}
              </span>
              <span className="font-medium text-body">+ {formatTaka(list.itemsPaisa)}</span>
            </div>
            <div className="flex justify-between gap-3 pt-1 border-t border-lavender-deep">
              <span className="text-body-soft">Everything together</span>
              <span className="font-medium text-body">{formatTaka(list.beforePaisa)}</span>
            </div>
            {list.savePaisa > 0 ? (
              <div className="flex justify-between gap-3">
                <span className="font-semibold text-[#0f7d55]">
                  Bundle price — customer saves {formatTaka(list.savePaisa)}
                </span>
                <span className="font-display font-semibold text-[15px] text-purple">
                  {formatTaka(list.afterPaisa)}
                </span>
              </div>
            ) : (
              <div className="text-[12px] text-body-soft pt-0.5">
                No bundle discount set yet — set it on the{" "}
                <b className="font-semibold text-purple">Pricing</b> tab and this preview
                updates itself.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
