"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SectionHead from "../ui/SectionHead";
import { getShopCard, getGoogleRating, type ShopCard } from "../../_data/shop";

/*
  GBE part 2 of 3 — Visit Radian Flower & Gift Shop.
  Physical store = trust signal (MoldFlowers-inspired).
  Appears on every page: Reviews → VisitStore → Footer.
  Address/phone are placeholders until the real store details are final.
  Store photo: gradient placeholder until real photo shoot.
*/

function Ic({ name }: { name: string }) {
  const cls = "w-[18px] h-[18px] stroke-current fill-none stroke-[1.8]";
  if (name === "pin")
    return (
      <svg className={cls} viewBox="0 0 24 24">
        <path d="M12 21s-7-5.3-7-11a7 7 0 0 1 14 0c0 5.7-7 11-7 11z" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="2.6" />
      </svg>
    );
  if (name === "clock")
    return (
      <svg className={cls} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  // phone
  return (
    <svg className={cls} viewBox="0 0 24 24">
      <path
        d="M6.8 3.5h2.9l1.4 3.9-2 1.5a12.5 12.5 0 0 0 5.9 5.9l1.5-2 3.9 1.4v2.9a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.8 5.7a2 2 0 0 1 2-2.2z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="w-4 h-4 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
      <path d="M4 12h16m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const LINES = [
  {
    icon: "pin",
    title: "House 12, Road 5, Dhanmondi",
    sub: "Dhaka 1205, Bangladesh",
  },
  {
    icon: "clock",
    title: "Open every day, 9 AM – 10 PM",
    sub: "Including Fridays and holidays",
  },
  {
    icon: "phone",
    title: "+880 1X XXX XXXXX",
    sub: "Call or WhatsApp anytime",
  },
];

export default function VisitStore() {
  const [card, setCard] = useState<ShopCard | null>(null);
  /** the same figure the Reviews screen sets — it was typed here by hand */
  const [rating, setRating] = useState<number | null>(null);

  /*
    LIVE since 31 Jul 2026. Address, phone, map link, photo and the opening
    hours all come from the admin.

    The open/closed pill is worked out ON THE SERVER, in Bangladesh time — the
    visitor's clock is theirs, not the shop's, and a container runs six hours
    behind Dhaka. See `hours.ts`.
  */
  useEffect(() => {
    let alive = true;
    getShopCard().then((c) => { if (alive && c) setCard(c); });
    getGoogleRating().then((r) => { if (alive && r) setRating(r.rating); });
    return () => { alive = false; };
  }, []);

  const lines = card
    ? [
        { icon: "pin", title: card.address ?? LINES[0].title, sub: card.cityLine ?? LINES[0].sub },
        { icon: "clock", title: card.hours.line, sub: card.hours.note ?? "Including Fridays and holidays" },
        { icon: "phone", title: card.phone ?? LINES[2].title, sub: card.whatsapp && card.whatsapp !== card.phone ? `WhatsApp ${card.whatsapp}` : "Call or WhatsApp anytime" },
      ]
    : LINES;

  return (
    <section className="bg-lavender py-[46px]" id="store">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_.9fr] gap-8 lg:gap-12 items-center">
          {/* Store visual — layered composition (photo drops in after the shoot) */}
          <div className="relative h-[340px] lg:h-[420px]">
            {/* Main photo area — asymmetric premium corners */}
            <div
              className="absolute inset-0 rounded-tl-[150px] rounded-tr-[28px] rounded-b-[28px] overflow-hidden shadow-lift"
              style={
                card?.imageUrl
                  ? { backgroundImage: `url(${card.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                  : { background: "linear-gradient(160deg,#F3E2FA 0%,#E3C4F3 55%,#D5A8EC 100%)" }
              }
            >
              {/* Depth layers so the placeholder feels designed, not empty */}
              <div
                className="absolute w-[300px] h-[300px] rounded-full opacity-60"
                style={{
                  background: "radial-gradient(circle,#F9E9FD 0%,transparent 70%)",
                  top: -60,
                  right: -60,
                }}
              />
              <div
                className="absolute w-[220px] h-[220px] rounded-[50%_50%_50%_0] -rotate-45 opacity-30"
                style={{ background: "#cf43ea", bottom: -90, left: -70 }}
              />
            </div>

            {/* Open-now pill */}
            <div className="absolute top-6 right-5 z-10 flex items-center gap-2 bg-white/96 backdrop-blur-sm rounded-full px-4 py-2 shadow-lift whitespace-nowrap">
              {/* The dot only pulses when the shop is actually open. A green
                  light on a closed shop is the exact lie this table exists to
                  stop. */}
              <span className="relative flex w-2 h-2">
                {card?.hours.isOpenNow !== false && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60" />
                )}
                <span className={"relative inline-flex rounded-full w-2 h-2 " + (card && !card.hours.isOpenNow ? "bg-body-soft" : "bg-green-500")} />
              </span>
              <span className="text-[12.5px] font-semibold text-purple">
                {card ? card.hours.pill : "Open now · till 10 PM"}
              </span>
            </div>

            {/* Floating card — bottom left */}
            {/* Cleared in the admin → the card goes, rather than sitting empty
                over the photograph. Same rule as the hero's floating cards. */}
            {(card?.chipTitle || card?.chipSub) && (
              <div className="absolute bottom-8 -left-4 z-10 flex items-center gap-3 bg-white/96 backdrop-blur-sm rounded-[18px] px-4 py-3 shadow-lift whitespace-nowrap">
                <div className="w-10 h-10 rounded-full bg-orchid-soft grid place-items-center text-orchid shrink-0">
                  <Ic name="pin" />
                </div>
                <div>
                  {card.chipTitle && <b className="block text-[13.5px] text-purple font-semibold">{card.chipTitle}</b>}
                  {card.chipSub && <span className="text-[12px] text-body-soft">{card.chipSub}</span>}
                </div>
              </div>
            )}

            {/* Rating chip — bottom right */}
            {/* no rating set, no claim — dropped rather than left at 4.9 */}
            {rating !== null && (
              <div className="absolute -bottom-3 right-8 z-10 flex items-center gap-2 bg-purple text-white rounded-full px-4 py-2 shadow-lift whitespace-nowrap">
                <span className="text-rosegold-light text-[13px]">★ {rating.toFixed(1)}</span>
                <span className="text-[12px] text-white/85">Loved on Google</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            <SectionHead
              sectionKey="home.store"
              eyebrow="We're real, come say hello"
              title="Visit Radian Flower & Gift Shop"
              subtitle="Walk in, smell the flowers, watch us arrange your gift by hand."
              align="left"
              className="mb-[22px]"
            />

            {lines.map((line, i) => (
              <div
                key={line.icon}
                className={`flex gap-[15px] items-start py-[13px] ${
                  i < LINES.length - 1 ? "border-b border-lavender-deep" : ""
                }`}
              >
                <div className="w-[42px] h-[42px] rounded-full bg-white text-purple grid place-items-center shrink-0">
                  <Ic name={line.icon} />
                </div>
                <div>
                  <b className="block text-[14.5px] text-purple font-semibold">
                    {line.title}
                  </b>
                  <span className="text-[13.5px] text-body-soft">{line.sub}</span>
                </div>
              </div>
            ))}

            {/* CTAs */}
            {/* Both buttons pointed at "#" — they looked live and did nothing.
                A button is now only rendered once there is somewhere for it to
                go, because a dead button costs more trust than a missing one. */}
            {/* one row, always (owner, 5 Sep 2026) — three buttons sized to share the column */}
            <div className="flex gap-2.5 mt-6 flex-nowrap">
              {card?.mapUrl && (
                <a
                  href={card.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-[13px] bg-purple text-white rounded-full font-semibold text-[14.5px] transition-all duration-300 hover:bg-purple-deep hover:-translate-y-[2px] whitespace-nowrap shadow-[0_12px_30px_rgba(71,0,102,0.25)]"
                >
                  Get directions <ArrowIcon />
                </a>
              )}
              {/* WhatsApp in the middle (owner, 5 Sep 2026) — the number from the
                  shop card (Setup → Company), opened in WhatsApp directly. A
                  local 01… number is written the way wa.me wants it: 880… */}
              {card?.whatsapp && (
                <a
                  href={`https://wa.me/${card.whatsapp.replace(/[^\d]/g, "").replace(/^0/, "880")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-[13px] rounded-full bg-[#25D366] text-white font-semibold text-[14.5px] transition-all duration-300 hover:bg-[#1ebe5b] hover:-translate-y-[2px] whitespace-nowrap shadow-[0_12px_30px_rgba(37,211,102,0.3)]"
                >
                  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7c.1.2 1.9 2.9 4.6 4 1.7.7 2.3.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>
                  WhatsApp us
                </a>
              )}
              {card?.phone && (
                <a
                  href={`tel:${card.phone.replace(/\s/g, "")}`}
                  className="inline-flex items-center gap-2 px-6 py-[12px] border-[1.5px] border-purple rounded-full text-purple font-semibold text-[14.5px] transition-all duration-300 hover:bg-purple hover:text-white hover:shadow-lift whitespace-nowrap"
                >
                  Call the studio
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
