"use client";

import { useEffect, useState } from "react";
import type { Zone } from "./Header";
import {
  EMPTY_CLAIMS,
  fetchSpeedClaims,
  type SpeedClaims,
} from "../../_data/deliveryClaims";

interface Props {
  onPick: (zone: Zone) => void;
}

export default function LocationGate({ onPick }: Props) {
  // Hard-block modal: lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /*  Dhaka's list, because this card is the Dhaka choice. The visitor has no
      zone yet — that is the whole point of this screen — so it cannot be
      derived from one.  */
  const [claims, setClaims] = useState<SpeedClaims>(EMPTY_CLAIMS);
  useEffect(() => {
    let alive = true;
    fetchSpeedClaims("dhaka").then((c) => {
      if (alive) setClaims(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-5 bg-[rgba(50,0,73,0.6)] backdrop-blur-[6px]">
      <div className="bg-white rounded-[28px] p-6 sm:p-10 max-w-[460px] w-full shadow-lift text-center">

        {/* Logo mark */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="w-3 h-3 bg-orchid rounded-[50%_50%_50%_0] rotate-[-45deg] block" />
          <span className="font-ui font-semibold text-xl tracking-[0.3em] text-purple">RADIAN</span>
        </div>

        <h3 className="font-display text-2xl text-purple font-medium mb-2">
          Where should we deliver?
        </h3>
        <p className="text-sm text-body-soft mb-6">
          Select your location to see accurate products, pricing and delivery times.
        </p>

        {/* Inside Dhaka */}
        <button
          onClick={() => onPick("dhaka")}
          className="w-full flex items-center gap-3 sm:gap-4 border-[1.5px] border-lavender-deep rounded-[18px] p-3 sm:p-4 mb-3 hover:border-orchid hover:bg-orchid-soft transition-all text-left"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-lavender flex items-center justify-center text-purple shrink-0">
            <svg className="w-5 h-5 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
              <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="flex-1">
            <b className="block text-[15.5px] text-purple font-semibold whitespace-nowrap">Inside Dhaka</b>
            {/*  ⚠️ The shop's own list of what it runs, not three names typed
                 here. This said "2-hour, same day & midnight" on a shop whose
                 fastest service is a three-hour express — and it is the very
                 first sentence a visitor reads, on the screen that asks them
                 where they are.  */}
            <span className="text-[12.5px] text-body-soft">
              {claims.listSentence
                ? `${claims.listSentence} delivery`
                : "Fast delivery across Dhaka"}
            </span>
          </div>
          <span className="hidden sm:inline text-[10.5px] font-semibold tracking-[0.08em] uppercase bg-purple text-white rounded-full px-3 py-1.5 shrink-0">
            Fastest
          </span>
        </button>

        {/* All Bangladesh */}
        <button
          onClick={() => onPick("bangladesh")}
          className="w-full flex items-center gap-3 sm:gap-4 border-[1.5px] border-lavender-deep rounded-[18px] p-3 sm:p-4 hover:border-orchid hover:bg-orchid-soft transition-all text-left"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-lavender flex items-center justify-center text-purple shrink-0">
            <svg className="w-5 h-5 stroke-current fill-none stroke-[1.8]" viewBox="0 0 24 24">
              <path d="M2 6h12v11H2zM14 10h4l3 3.4V17h-7" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="6.5" cy="17.7" r="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="17.5" cy="17.7" r="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <b className="block text-[15.5px] text-purple font-semibold">All Bangladesh</b>
            <span className="text-[12.5px] text-body-soft">Nationwide courier, 1–3 days</span>
          </div>
        </button>
      </div>
    </div>
  );
}
