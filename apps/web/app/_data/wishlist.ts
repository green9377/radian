"use client";

import { useEffect, useState } from "react";

import type { Zone } from "../_store/useZoneStore";
import { getShopProductsBySlugs } from "./shop";
import { zoneFilter, type Product } from "./products";
import { toCardProduct } from "./productApi";

/*
  WISHLIST RESOLVER

  The store keeps slugs only; the products come from the shop so the price,
  the name and the picture are always today's.

  ⚠️ Until 7 Sep 2026 the slugs were looked up in the hand-written mock
  catalogue, so a real product saved from a card or the product page never
  appeared on /wishlist at all. The look-up is now `GET /shop/products-by-slugs`.

  Zone (owner approved): the wishlist is the shopper's own list, so nothing is
  hidden by zone. Each entry carries `deliverable` instead — the page dims an
  entry the current zone cannot receive and says so, rather than promising a
  delivery it cannot make.

  A slug the shop no longer publishes is dropped quietly — this is a list of
  wishes, not an order, so "no longer available" wording is not needed here.
*/

export interface WishlistEntry {
  product: Product;
  /** can the current zone receive it (`zoneFilter`) */
  deliverable: boolean;
}

export interface ResolvedWishlist {
  entries: WishlistEntry[];
  /** how many saved items the current zone cannot receive (for the notice) */
  undeliverableCount: number;
  isEmpty: boolean;
  /** the first fetch has not answered yet */
  loading: boolean;
}

export function resolveWishlist(slugs: string[], cards: Product[], zone: Zone | null): ResolvedWishlist {
  const bySlug = new Map(cards.map((p) => [p.slug, p]));
  const entries: WishlistEntry[] = [];
  for (const slug of slugs) {
    const product = bySlug.get(slug);
    if (!product) continue;
    entries.push({ product, deliverable: zoneFilter(product, zone) });
  }
  return {
    entries,
    undeliverableCount: entries.filter((e) => !e.deliverable).length,
    isEmpty: entries.length === 0,
    loading: false,
  };
}

/** the saved slugs, resolved against the live shop; refetches when the list changes */
export function useResolvedWishlist(slugs: string[], zone: Zone | null): ResolvedWishlist {
  const key = slugs.join(",");
  const [cards, setCards] = useState<{ key: string; list: Product[] } | null>(null);

  useEffect(() => {
    let dropped = false;
    const wanted = key ? key.split(",") : [];
    if (wanted.length === 0) {
      setCards({ key, list: [] });
      return;
    }
    getShopProductsBySlugs(wanted).then((r) => {
      if (!dropped) setCards({ key, list: (r ?? []).map(toCardProduct) });
    });
    return () => {
      dropped = true;
    };
  }, [key]);

  if (!cards || cards.key !== key) {
    return { entries: [], undeliverableCount: 0, isEmpty: false, loading: true };
  }
  return resolveWishlist(slugs, cards.list, zone);
}
