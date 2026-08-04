"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { buildReorderItems, canReorder } from "../../_data/reorder";
import type { Order } from "../../_data/order";
import { useCartStore } from "../../_store/useCartStore";
import Icon from "../Pdp/PdpIcons";

/*
  Reorder — order-এর item cart-এ ফিরিয়ে /cart-এ নিয়ে যায়।
  size/bundle map হয়; add-on বাদ (reorder.ts §)।
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

  if (!canReorder(order)) return null;

  function reorder() {
    setBusy(true);
    for (const item of buildReorderItems(order)) add(item);
    router.push("/cart");
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
