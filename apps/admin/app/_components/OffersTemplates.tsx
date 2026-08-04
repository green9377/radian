"use client";

import Link from "next/link";
import Icon from "./Icon";
import { TEMPLATES } from "../_data/offers";

/* Offers & Promotions · Templates / Playbook (MOCK, §9) — Hormozi-style launchers. */

const WRAP = "px-6 md:px-8 xl:px-10 2xl:px-12 pt-7 pb-16 w-full";

export default function OffersTemplates() {
  return (
    <div className={WRAP}>
      <div className="mb-5">
        <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid"><span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />Offers & Promotions · playbook</div>
        <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Templates &amp; Playbook</h1>
        <p className="text-body-soft text-[13.5px] m-0 max-w-[720px]">Proven offer recipes — inspired by Alex Hormozi's $100M Offers and global eCommerce best practice. Pick one, tweak the numbers, launch. Every template opens the same Offer builder pre-filled.</p>
      </div>

      {/* Grand Slam highlight */}
      <div className="bg-gradient-to-br from-purple to-[#6a1b8f] text-white rounded-[20px] p-6 mb-5 shadow-lift flex items-center justify-between gap-6 flex-wrap">
        <div className="max-w-[560px]">
          <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-white/70"><Icon name="sparkle" size={14} /> Grand Slam Offer</div>
          <div className="font-display text-[22px] mt-2 mb-1.5">Make an offer so good people feel stupid saying no</div>
          <p className="text-[13px] text-white/80 m-0">Core discount + bonus value-stack + guarantee + honest urgency + a magnetic name. The builder shows total stacked value vs price, so the deal feels irresistible — powered by Radian's 2-hour delivery (kills the wait).</p>
        </div>
        <Link href="/marketing/offers/tpl-grandslam" className="bg-white text-purple text-[14px] font-semibold px-6 py-3 rounded-[12px] inline-flex items-center gap-2 shrink-0"><Icon name="plus" size={17} /> Build Grand Slam</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {TEMPLATES.map((t, i) => (
          <div key={i} className="bg-white border border-lavender-deep rounded-[18px] p-5 shadow-soft flex flex-col">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-[38px] h-[38px] rounded-[11px] bg-lavender flex items-center justify-center text-orchid"><Icon name={t.icon} size={20} /></span>
              <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-body-soft bg-lavender px-2.5 py-1 rounded-full">{t.family}</span>
            </div>
            <div className="font-display text-[16.5px] text-purple leading-tight">{t.name}</div>
            <p className="text-[13px] text-body-soft mt-1.5 mb-3 leading-relaxed flex-1">{t.desc}</p>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-body-soft">{t.hint}</span>
              <Link href={`/marketing/offers/tpl-${t.key}`} className="text-[12.5px] font-semibold text-orchid inline-flex items-center gap-1 hover:text-purple">Use template <Icon name="plus" size={14} /></Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
