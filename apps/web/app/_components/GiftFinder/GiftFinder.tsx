"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getGiftFinder, type GiftFinderStep } from "../../_data/shop";
import SectionHead from "../ui/SectionHead";

/*
  Gift Finder — 3-step wizard (Who → Occasion → Budget).
  Static section (same for both zones, per approved board).
  On finish it currently shows the chosen combination; in the real site
  this will link to a filtered product listing (wired when the
  /products listing page exists).
*/

/*
  The three questions come from the admin (31 Jul 2026):

    who / occasion — the two SYSTEM tag groups, which are seeded and
      undeletable, and are already the answer to "who is it for" and "what for".
    budget         — the collections, in their own order. The wizard's third
      question used to be the budget rail typed out a second time.

  Nothing is written twice: rename a tag and the question changes here too.

  ⚠️ The old list is kept as the fallback for the moment before the answer
  arrives, and it is also the record of the questions the design intended.
*/

const FALLBACK_STEPS: GiftFinderStep[] = [
  {
    param: "recipients", title: "Recipients",
    options: [
      { value: "her", label: "Her", imageUrl: null },
      { value: "him", label: "Him", imageUrl: null },
      { value: "parents", label: "Parents", imageUrl: null },
      { value: "friend", label: "Friend", imageUrl: null },
    ],
  },
  {
    param: "occasions", title: "Occasions",
    options: [
      { value: "birthday", label: "Birthday", imageUrl: null },
      { value: "anniversary", label: "Anniversary", imageUrl: null },
      { value: "love-romance", label: "Love & Romance", imageUrl: null },
      { value: "just-because", label: "Just Because", imageUrl: null },
    ],
  },
  {
    param: "budget", title: "Budget",
    options: [
      { value: "under-1000", label: "Under ৳1,000", imageUrl: null },
      { value: "1000-2000", label: "৳1,000 – ৳2,000", imageUrl: null },
      { value: "premium", label: "Premium", imageUrl: null },
    ],
  },
];

const QUESTIONS: Record<string, string> = {
  occasions: "What's the occasion?",
  recipients: "Who is the gift for?",
  budget: "What's your budget?",
};

export default function GiftFinder() {
  const [steps, setSteps] = useState<GiftFinderStep[] | null>(null);
  const [step, setStep] = useState(1);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    let alive = true;
    getGiftFinder().then((s) => {
      if (!alive || !s || s.length === 0) return;
      setSteps(s);
      setStep(1);
      setChoices({});
    });
    return () => { alive = false; };
  }, []);

  const live = steps ?? FALLBACK_STEPS;
  const total = live.length;
  const current = live[step - 1];
  const picked = current ? choices[current.param] : undefined;

  function pick(value: string) {
    setChoices((c) => ({ ...c, [current.param]: value }));
    setShowResult(false);
  }

  function goNext() {
    if (!picked) return;
    if (step < total) {
      setStep(step + 1);
      setShowResult(false);
    } else {
      setShowResult(true);
    }
  }

  function goBack() {
    if (step > 1) {
      setStep(step - 1);
      setShowResult(false);
    }
  }

  return (
    <section className="py-[46px]" id="giftfinder">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Section head */}
        <SectionHead
          sectionKey="home.giftfinder"
          eyebrow="Still not sure what to send?"
          title="Find the Perfect Gift in 3 Easy Steps"
          subtitle={"Answer one simple question at a time — we'll match the perfect gift for you."}
        />

        {/* Wizard card */}
        <div
          className="border border-lavender-deep rounded-[28px] shadow-soft px-6 py-8 md:px-10 md:py-8 max-w-[700px] mx-auto text-center"
          style={{
            background: "linear-gradient(140deg,#f7f1fb 0%,#f9e9fd 100%)",
          }}
        >
          {/* Progress */}
          <div className="flex items-center gap-4 mb-[22px]">
            <span className="text-[12.5px] font-semibold tracking-[0.08em] uppercase text-purple whitespace-nowrap">
              Step {step} of {total}
            </span>
            <div className="flex-1 h-[6px] rounded-full bg-white overflow-hidden">
              <span
                className="block h-full rounded-full transition-all duration-300"
                style={{
                  width: `${(step / total) * 100}%`,
                  background: "linear-gradient(90deg,#cf43ea,#470066)",
                }}
              />
            </div>
          </div>

          {/* Question */}
          <h3 className="font-display text-[21px] font-medium text-purple mb-[18px]">
            {QUESTIONS[current.param] ?? current.title}
          </h3>

          {/* Options */}
          <div className="flex gap-[11px] flex-wrap justify-center">
            {current.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => pick(opt.value)}
                className={`flex flex-col items-center gap-[7px] rounded-[18px] px-5 py-4 min-w-[106px] shadow-soft transition-all duration-200 cursor-pointer border-2 hover:-translate-y-[3px] hover:shadow-lift ${
                  picked === opt.value
                    ? "border-orchid bg-orchid-soft"
                    : "border-transparent bg-white"
                }`}
              >
                {/* the tag's own picture when it has one — better than an emoji,
                    and it is a picture the owner already uploads. A soft circle
                    otherwise, so a set with no images still looks arranged. */}
                <span
                  className="w-[34px] h-[34px] rounded-full bg-cover bg-center shrink-0"
                  style={opt.imageUrl
                    ? { backgroundImage: `url(${opt.imageUrl})` }
                    : { background: "linear-gradient(150deg,#F3E2FA,#D5A8EC)" }}
                />
                <b className="text-[13px] font-semibold text-purple whitespace-nowrap">
                  {opt.label}
                </b>
              </button>
            ))}
          </div>

          {/* Result */}
          {showResult && (
            <div className="mt-[22px] px-5 py-4 bg-white rounded-[18px] flex items-center justify-between gap-4 flex-wrap">
              <span className="text-[14px] text-purple">
                🌸 <b>{live.map((st) => st.options.find((o) => o.value === choices[st.param])?.label).filter(Boolean).join(" · ")}</b>
              </span>
              {/* A real link, not a message. The answers travel as query
                  parameters; the product listing reads them once the catalogue
                  is connected, and until then this still lands on the products
                  page rather than nowhere. */}
              <Link
                href={`/products?${new URLSearchParams(choices).toString()}`}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-purple text-white rounded-full font-medium text-[14px] hover:bg-purple-deep transition-all whitespace-nowrap"
              >
                See the gifts →
              </Link>
            </div>
          )}

          {/* Nav */}
          <div className="flex items-center justify-between gap-4 mt-6">
            <button
              onClick={goBack}
              className={`text-[14px] font-semibold text-body-soft hover:text-orchid transition-colors px-[6px] py-[10px] cursor-pointer ${
                step === 1 ? "invisible" : ""
              }`}
            >
              ← Back
            </button>
            <button
              onClick={goNext}
              disabled={!picked}
              className="inline-flex items-center gap-2 px-[38px] py-[13px] bg-purple text-white rounded-full font-medium text-[15px] transition-all duration-300 hover:bg-purple-deep hover:-translate-y-[2px] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 cursor-pointer shadow-[0_12px_30px_rgba(71,0,102,0.25)]"
            >
              {step === total ? "Show My Gift 🌸" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
