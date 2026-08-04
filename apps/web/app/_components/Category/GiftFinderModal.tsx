"use client";

import { useEffect, useState } from "react";
import type { Occasion, Recipient } from "../../_data/products";
import { useGiftFinderStore } from "../../_store/useGiftFinderStore";

/*
  Gift Finder — 3-step modal (Who → Occasion → Budget).

  কেন modal, আলাদা page নয়:
  user category page-এ browse করছে। তাকে অন্য page-এ পাঠালে context হারায়
  আর drop-off বাড়ে। Modal বন্ধ হলে সে যেখানে ছিল সেখানেই থাকে —
  শুধু নিচের product grid তার উত্তর অনুযায়ী filter হয়ে যায়।
*/

const RECIPIENTS: { value: Recipient; label: string; sub: string }[] = [
  { value: "her", label: "Her", sub: "Wife, girlfriend, sister" },
  { value: "him", label: "Him", sub: "Husband, boyfriend, brother" },
  { value: "parents", label: "Parents", sub: "Ma, Baba, in-laws" },
  { value: "friend", label: "A Friend", sub: "Best friend, bestie" },
  { value: "colleague", label: "A Colleague", sub: "Boss, client, team" },
];

const OCCASIONS: { value: Occasion; label: string; sub: string }[] = [
  { value: "birthday", label: "Birthday", sub: "Bright & joyful" },
  { value: "anniversary", label: "Anniversary", sub: "Romantic classics" },
  { value: "love", label: "Love & Romance", sub: "Say it properly" },
  { value: "congratulations", label: "Congratulations", sub: "A win worth marking" },
  { value: "get-well", label: "Get Well Soon", sub: "Gentle & calming" },
  { value: "sorry", label: "I'm Sorry", sub: "Make it right" },
  { value: "corporate", label: "Corporate", sub: "Client & team gifting" },
  { value: "just-because", label: "Just Because", sub: "No reason needed" },
];

const BUDGETS: { label: string; minPaisa: number; maxPaisa: number }[] = [
  { label: "Under ৳1,500", minPaisa: 0, maxPaisa: 150000 },
  { label: "৳1,500 – ৳3,000", minPaisa: 150000, maxPaisa: 300000 },
  { label: "৳3,000 – ৳6,000", minPaisa: 300000, maxPaisa: 600000 },
  { label: "৳6,000 +", minPaisa: 600000, maxPaisa: Number.MAX_SAFE_INTEGER },
];

type Step = 1 | 2 | 3;

export default function GiftFinderModal() {
  const { open, openCount } = useGiftFinderStore();
  if (!open) return null;
  // openCount = key → প্রতিবার খুললে wizard নতুন করে mount হয়, step 1 থেকে শুরু
  return <Wizard key={openCount} />;
}

function Wizard() {
  const { closeFinder, setResult } = useGiftFinderStore();

  const [step, setStep] = useState<Step>(1);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [occasion, setOccasion] = useState<Occasion | null>(null);

  // Esc দিয়ে বন্ধ + background scroll lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFinder();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [closeFinder]);

  function finish(budget: (typeof BUDGETS)[number]) {
    if (!recipient || !occasion) return;
    setResult({
      recipient,
      occasion,
      minPaisa: budget.minPaisa,
      maxPaisa: budget.maxPaisa,
      budgetLabel: budget.label,
    });
    // filter করা grid-এ নামিয়ে দাও
    requestAnimationFrame(() => {
      document.getElementById("all-products")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const question =
    step === 1 ? "Who is this gift for?" : step === 2 ? "What's the occasion?" : "What's your budget?";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[rgba(50,0,73,0.5)] backdrop-blur-[3px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeFinder();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Gift Finder"
        className="w-full max-w-[620px] max-h-[88vh] overflow-y-auto bg-white rounded-[28px] p-7 sm:p-10 shadow-lift scrollbar-none"
      >
        {/* progress */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-[3px] flex-1 rounded-sm transition-all duration-300 ${
                n <= step ? "bg-orchid" : "bg-lavender-deep"
              }`}
            />
          ))}
          <button
            onClick={closeFinder}
            aria-label="Close"
            className="ml-3 w-8 h-8 grid place-items-center rounded-full text-body-soft hover:bg-lavender hover:text-purple transition-colors cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-orchid mb-2">
          Step {step} of 3
        </div>
        <h2 className="font-display text-[clamp(22px,3vw,30px)] font-medium text-purple mb-[26px]">
          {question}
        </h2>

        {/* STEP 1 — recipient */}
        {step === 1 && (
          <div className="grid sm:grid-cols-2 gap-3">
            {RECIPIENTS.map((r) => (
              <button
                key={r.value}
                onClick={() => {
                  setRecipient(r.value);
                  setStep(2);
                }}
                className="text-left p-4 rounded-[18px] border-[1.5px] border-lavender-deep bg-white transition-all duration-200 hover:border-orchid hover:bg-orchid-soft cursor-pointer"
              >
                <b className="block text-[16px] font-semibold text-purple">{r.label}</b>
                <span className="text-[12.5px] text-body-soft">{r.sub}</span>
              </button>
            ))}
          </div>
        )}

        {/* STEP 2 — occasion */}
        {step === 2 && (
          <div className="grid sm:grid-cols-2 gap-3">
            {OCCASIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => {
                  setOccasion(o.value);
                  setStep(3);
                }}
                className="text-left p-4 rounded-[18px] border-[1.5px] border-lavender-deep bg-white transition-all duration-200 hover:border-orchid hover:bg-orchid-soft cursor-pointer"
              >
                <b className="block text-[16px] font-semibold text-purple">{o.label}</b>
                <span className="text-[12.5px] text-body-soft">{o.sub}</span>
              </button>
            ))}
          </div>
        )}

        {/* STEP 3 — budget */}
        {step === 3 && (
          <div className="grid sm:grid-cols-2 gap-3">
            {BUDGETS.map((b) => (
              <button
                key={b.label}
                onClick={() => finish(b)}
                className="p-5 rounded-[18px] border-[1.5px] border-lavender-deep bg-white transition-all duration-200 hover:border-orchid hover:bg-orchid-soft cursor-pointer"
              >
                <b className="font-display text-[19px] font-medium text-purple whitespace-nowrap">
                  {b.label}
                </b>
              </button>
            ))}
          </div>
        )}

        {step > 1 && (
          <button
            onClick={() => setStep((step - 1) as Step)}
            className="mt-6 text-[13.5px] font-semibold text-body-soft hover:text-purple transition-colors cursor-pointer"
          >
            ← Back
          </button>
        )}
      </div>
    </div>
  );
}
