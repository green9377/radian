"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { buildReorderItems } from "../../_data/reorder";
import type { Order } from "../../_data/order";
import { useCartStore } from "../../_store/useCartStore";
import Icon from "../Pdp/PdpIcons";

/*
  Reorder — puts the order's items back in the cart and goes to /cart.
  Sizes and bundles are matched by name; add-ons are left out (reorder.ts).
  Products the shop no longer sells are skipped; if none are left, the
  button says so instead of opening an empty cart.
*/
export default function ReorderButton({
  order,
  variant = "pill",
}: {
  order: Order;
  variant?: "pill" | "solid";
}) {
  const add = useCartStore((s) => s.add);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);

  async function reorder() {
    setBusy(true);
    try {
      const items = await buildReorderItems(order);
      if (items.length === 0) {
        setGone(true);
        return;
      }
      for (const item of items) add(item);
      router.push("/cart");
    } finally {
      setBusy(false);
    }
  }

  if (gone) {
    return <span className="text-[12.5px] text-body-soft">These items are no longer available</span>;
  }

  if (variant === "solid") {
    return (
      <button
        type="button"
        onClick={reorder}
        disabled={busy}
        className="inline-flex items-center gap-2 h-[46px] px-5 rounded-[14px] bg-purple text-white font-semibold text-[13.5px] hover:bg-purple-deep transition-colors disabled:opacity-60"
      >
        <Icon name="cart" className="w-[17px] h-[17px]" />
        {busy ? "Adding…" : "Reorder"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={reorder}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-full bg-orchid-soft text-orchid px-3.5 py-1.5 text-[12.5px] font-semibold hover:bg-orchid hover:text-white transition-colors disabled:opacity-60"
    >
      <Icon name="cart" className="w-[15px] h-[15px]" />
      Reorder
    </button>
  );
}
