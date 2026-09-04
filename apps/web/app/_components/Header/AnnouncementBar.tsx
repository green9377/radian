"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Zone } from "./Header";
import { getShopBanners, zoneCode } from "../../_data/shop";
import { fetchSpeedClaims } from "../../_data/deliveryClaims";

/*
  The thin purple line above the header.

  LIVE since 30 Jul 2026 — same table as the hero and the promo strip, because
  it always had the same shape: a sentence, a zone, a season. It is the line the
  owner will want to change most often and for the shortest time ("free delivery
  this Eid"), which is exactly why it could not stay in code.

  The bold half and the rest are two fields rather than one string with markup
  in it. Markup in a text box is a trap: it reads fine until someone types a
  stray character and the header renders as tag soup.
*/

/*
  ⚠️ THE STANDING LINE NO LONGER NAMES A SPEED — 3 Aug 2026.

  It used to read "⚡ 2-Hour Delivery inside Dhaka · Same Day before 6 PM".
  That sentence sat above every page of the shop, and none of it was true: the
  admin's fastest delivery is a 3-hour express, and the 6 PM cut-off belongs to
  a slot the owner can move. It was the most-seen wrong sentence on the site.

  What is left here is only what holds without checking anything — where the
  shop delivers. The speed is filled in from the masters below, and if they
  cannot be read the bar simply says less.
*/
const FALLBACK: Record<"dhaka" | "bangladesh", { bold: string; rest: string }> = {
  dhaka: {
    bold: "🌸 Flowers & gifts delivered across Dhaka",
    rest: "Hand-arranged the same morning",
  },
  bangladesh: {
    bold: "🚚 Nationwide Delivery",
    rest: "across Bangladesh · Courier-safe gifts",
  },
};

export default function AnnouncementBar({ zone }: { zone: Zone | null }) {
  const fallback = FALLBACK[zone === "bangladesh" ? "bangladesh" : "dhaka"];
  const [line, setLine] = useState<{ bold: string; rest: string; href?: string | null }>(fallback);
  /*  The owner can switch the generated line off (Storefront → Homepage →
      Banners → Announcement line). A live banner still shows; with none live
      the bar is simply not drawn. Null until the API answers.  */
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setLine(fallback);
    setHidden(false);
    let alive = true;

    /*
      Two sources, and the owner's own banner wins.

      A banner written in the admin is a deliberate sentence for a season
      ("free delivery this Eid") and must not be overwritten by a generated
      one. Only when there is no banner does the bar describe the delivery
      service — and then it describes what the delivery masters actually say.
    */
    getShopBanners(zoneCode(zone)).then((res) => {
      if (!alive) return;
      const a = res?.banners.find((b) => b.placement === "ANNOUNCEMENT");
      if (a) {
        // the banner's own link, when it has one — the line becomes a link
        setLine({ bold: a.titleMain ?? "", rest: a.titleAccent ?? "", href: a.cta1Href });
        return;
      }
      if (res && res.announcementAuto === false) {
        setHidden(true);
        return;
      }
      // No live announcement is a legitimate state — between seasons there may
      // be nothing to say — but this strip is part of the header's shape, and
      // removing it makes everything below jump as the page loads. Describe
      // the service instead, in the shop's own current words.
      fetchSpeedClaims(zone).then((c) => {
        if (!alive || !c.fastestLabel) return;
        setLine({
          bold: `⚡ ${c.fastestLabel}`,
          rest:
            zone === "bangladesh"
              ? "· Courier-safe gifts across Bangladesh"
              : `inside Dhaka${c.listSentence ? ` · ${c.listSentence}` : ""}`,
        });
      });
    });
    return () => { alive = false; };
  }, [zone]);

  if (hidden) return null;

  const body = (
    <>
      <b className="font-semibold text-orchid-mid">{line.bold}</b>
      {line.rest ? ` ${line.rest}` : ""}
    </>
  );
  const cls =
    "block text-center py-2.5 text-[13.5px] tracking-[0.06em] font-light text-white bg-gradient-to-r from-purple-deep via-purple to-[#5E1580] w-full px-4";

  return line.href ? (
    <Link href={line.href} className={`${cls} hover:text-white`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
