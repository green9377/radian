"use client";

import { useEffect, useState } from "react";
import { getCardWording, type CardWording } from "../../_data/shop";

/*
  The delivery words on a product card, read once per page and shared by every
  card on it. A grid of twenty cards must not be twenty requests, and a card
  must not carry the words itself — that is how "Today, 2 hrs" survived a
  month on a shop whose fastest service was three hours.
*/

let cache: CardWording | null = null;
let pending: Promise<CardWording | null> | null = null;

/** null until the masters have answered — the card then says less, never more */
export function useCardWording(): CardWording | null {
  const [wording, setWording] = useState<CardWording | null>(cache);

  useEffect(() => {
    if (cache) {
      setWording(cache);
      return;
    }
    let alive = true;
    pending ??= getCardWording().then((w) => {
      cache = w;
      pending = null;
      return w;
    });
    pending.then((w) => {
      if (alive && w) setWording(w);
    });
    return () => {
      alive = false;
    };
  }, []);

  return wording;
}
