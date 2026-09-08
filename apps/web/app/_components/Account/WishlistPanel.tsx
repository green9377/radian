"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getWishlist, removeWish, type AccountWish } from "../../_data/accountApi";
import { formatTaka } from "../../_data/products";
import { useToken } from "../../_store/useAuthStore";
import TileImage from "../ui/TileImage";
import { Empty, Loading, Panel } from "./AccountShell";

/*
  /account/wishlist — saved on the ACCOUNT, not in one browser.

  ⚠️ It used to live in `localStorage`, so a list made on a phone did not
  exist on the laptop, and clearing the browser threw it away. `WishlistItem`
  is the customer's own row now; the heart on a product page writes to it the
  moment they are signed in.
*/

export default function WishlistPanel() {
  const token = useToken();
  const [rows, setRows] = useState<AccountWish[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getWishlist(token)
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load your wishlist."));
  }, [token]);

  async function drop(productId: string) {
    if (!token) return;
    setBusy(true);
    try {
      setRows(await removeWish(token, productId));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      icon="heart"
      title="Wishlist"
      sub={rows ? `${rows.length} saved · kept on your account` : "Kept on your account"}
    >
      {err && (
        <p className="mb-4 rounded-[13px] bg-[#FDECEE] border border-[#F5C2C7] px-4 py-3 text-[13px] text-[#8A1220]">
          {err}
        </p>
      )}

      {!rows && !err && <Loading />}

      {rows && rows.length === 0 && (
        <Empty
          title="Nothing saved yet"
          sub="Tap the heart on anything you like — it will be here on every device you sign in on."
          href="/fresh-flower"
          cta="Browse flowers"
        />
      )}

      {rows && rows.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {rows.map((w) => (
            <div
              key={w.productId}
              className="border-[1.5px] border-lavender-deep rounded-[16px] overflow-hidden"
            >
              <Link href={`/p/${w.slug}`} className="block">
                <TileImage src={w.imageUrl} alt={w.name} variant="card" className="h-[130px]" />
              </Link>
              <div className="p-3">
                <Link href={`/p/${w.slug}`} className="block text-[13px] font-bold text-purple">
                  {w.name}
                </Link>
                <span className="block font-display text-[16px] text-purple mt-1">
                  {formatTaka(w.pricePaisa)}
                </span>
                <div className="flex gap-2 mt-2.5">
                  <Link
                    href={`/p/${w.slug}`}
                    className="rounded-[11px] bg-purple text-white px-3.5 py-2 text-[12.5px] font-bold"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => drop(w.productId)}
                    className="rounded-[11px] border-[1.5px] border-lavender-deep bg-white px-3.5 py-2 text-[12.5px] font-bold text-body disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
