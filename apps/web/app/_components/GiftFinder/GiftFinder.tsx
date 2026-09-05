"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getGiftFinder, type GiftFinderStep } from "../../_data/shop";
import SectionHead from "../ui/SectionHead";
import { mediaVariant } from "../../_data/media";

/*
  Gift Finder — the three-step wizard, in the owner's reference composition
  (5 Sep 2026): a purple panel on the left with the invitation, the steps in
  the middle (numbered rail · question · choice cards · Skip / Next), and a
  slim caption column on the right.

  The steps and their choices are the admin's already: the two SYSTEM tag
  groups (who / occasion) and the featured collections (budget) — rename a tag
  and the choice changes here. Every word around them is the section's own
  settings (Storefront → Homepage → Layout → Gift Finder): the panel's title,
  text, handwritten line and picture, each step's question and small line,
  the three buttons and the side caption. Nothing is typed in here, and the
  section is not drawn until the steps arrive.
*/

const asMap = (v: unknown): Record<string, string> =>
  v && typeof v === "object" ? (v as Record<string, string>) : {};

function Check() {
  return (
    <svg className="w-[13px] h-[13px] stroke-white fill-none stroke-[2.6]" viewBox="0 0 24 24">
      <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Sprig({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 200" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M60 195c0-60 6-110 30-150" />
      <path d="M62 150c-18-4-32-18-36-38 18 2 32 16 36 38zM70 118c14-10 20-26 18-44-14 8-22 24-18 44zM66 90c-14-6-24-18-26-34 14 4 24 16 26 34zM76 62c8-12 10-26 6-40-10 8-14 22-6 40z" />
      <circle cx="94" cy="26" r="8" /><path d="M94 12v4M94 36v4M80 26h4M104 26h4" />
    </svg>
  );
}

/* soft pastel tiles behind the choice icons, in turn — the reference gives
   every choice its own tint */
const TINTS = ["#f7e4fb", "#e3eefb", "#fde5ee", "#ece4fb", "#e3f5ea", "#fdefdd"];

export default function GiftFinder({ config = {} }: { config?: Record<string, unknown> }) {
  const questions = asMap(config.questions);
  const hints = asMap(config.hints);
  const nextLabel = String(config.nextLabel || "Next Step →");
  const doneLabel = String(config.doneLabel || "Show My Gifts →");
  const skipLabel = String(config.skipLabel ?? "");
  const panelTitle = String(config.panelTitle ?? "");
  const panelText = String(config.panelText ?? "");
  const panelScript = String(config.panelScript ?? "");
  const panelImageUrl = String(config.panelImageUrl ?? "");
  const sideCaption = String(config.sideCaption ?? "");

  const [steps, setSteps] = useState<GiftFinderStep[] | null>(null);
  const [step, setStep] = useState(1);
  const [choices, setChoices] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    getGiftFinder().then((s) => {
      if (!alive || !s) return;
      setSteps(s);
      setStep(1);
      setChoices({});
    });
    return () => { alive = false; };
  }, []);

  if (!steps || steps.length === 0) return null;

  const total = steps.length;
  const current = steps[step - 1];
  const picked = choices[current.param];
  const last = step === total;
  const resultHref = `/products?${new URLSearchParams(
    Object.fromEntries(Object.entries(choices).filter(([, v]) => v)),
  ).toString()}`;

  const pick = (value: string) =>
    setChoices((c) => ({ ...c, [current.param]: c[current.param] === value ? "" : value }));
  const goNext = () => { if (!last) setStep(step + 1); };
  const skip = () => {
    setChoices((c) => ({ ...c, [current.param]: "" }));
    if (!last) setStep(step + 1);
  };
  const goTo = (n: number) => { if (n <= step) setStep(n); };

  const hasPanel = Boolean(panelTitle || panelText || panelScript || panelImageUrl);

  return (
    <section className="py-[var(--section-y)]" id="giftfinder">
      <div className="max-w-[var(--page-w)] mx-auto px-6">
        <SectionHead
          sectionKey="home.giftfinder"
          eyebrow="Let us guide you"
          title="Find the Perfect Gift in 3 Simple Steps"
          subtitle={"A few quick details, and we'll handpick the best gifts for your special moment."}
        />

        <div
          className="rounded-[28px] shadow-soft overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(0,3.2fr)_minmax(0,7.6fr)_minmax(0,1.1fr)]"
          style={{ background: "linear-gradient(140deg,#fbf8fd 0%,#f7f1fb 100%)" }}
        >
          {/* ---- The purple panel ---- */}
          {hasPanel && (
            <div
              className="relative overflow-hidden text-white px-8 py-8 lg:px-9 lg:py-9 min-h-[260px] flex flex-col"
              style={{ background: "radial-gradient(90% 70% at 100% 100%, rgba(207,67,234,.35), rgba(207,67,234,0) 70%), linear-gradient(160deg,#2b0040 0%,#470066 55%,#5b1084 100%)" }}
            >
              {/* two soft discs, like the reference's petals */}
              <span className="absolute -left-24 -top-24 w-72 h-72 rounded-full pointer-events-none" style={{ background: "rgba(255,255,255,.06)" }} />
              <span className="absolute -left-16 top-1/2 w-56 h-56 rounded-full pointer-events-none" style={{ background: "rgba(207,67,234,.16)" }} />

              <div className="relative z-[1] flex items-center gap-3 text-[12px] tracking-[0.22em] uppercase font-semibold text-orchid-mid">
                <span className="w-8 h-px bg-orchid-mid/80" />
                Step {step} of {total}
              </div>
              {panelTitle && (
                <h3 className="relative z-[1] font-display text-[28px] lg:text-[32px] font-medium leading-[1.12] mt-5 max-w-[13ch]">{panelTitle}</h3>
              )}
              {panelText && (
                <p className="relative z-[1] text-[14.5px] text-white/80 leading-[1.6] mt-4 max-w-[28ch]">{panelText}</p>
              )}
              <div className="relative z-[1] mt-auto pt-8 flex items-end justify-between gap-4">
                {panelScript && (
                  <span className="font-display italic text-[22px] leading-[1.15] text-orchid-mid max-w-[14ch]">{panelScript} <span className="not-italic">♡</span></span>
                )}
              </div>
              {panelImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={panelImageUrl} alt="" className="absolute right-0 bottom-0 w-[62%] max-h-[70%] object-contain object-right-bottom pointer-events-none" />
              )}
            </div>
          )}

          {/* ---- The steps ---- */}
          <div className={`px-7 py-7 lg:px-11 lg:py-8 flex flex-col ${hasPanel ? "" : "lg:col-span-2"}`}>
            {/* the rail */}
            <div className="flex items-center max-w-[640px] w-full mx-auto">
              {steps.map((s, i) => {
                const n = i + 1;
                const done = n < step, on = n === step;
                return (
                  <div key={s.param} className={`flex items-center ${i < total - 1 ? "flex-1" : ""}`}>
                    <button
                      type="button"
                      onClick={() => goTo(n)}
                      className="relative flex flex-col items-center cursor-pointer"
                      aria-current={on ? "step" : undefined}
                    >
                      <span
                        className={`w-9 h-9 rounded-full grid place-items-center text-[14px] font-bold transition-all ${
                          on ? "bg-purple text-white shadow-[0_8px_20px_rgba(71,0,102,.3)]" : done ? "bg-orchid text-white" : "bg-lavender-deep text-body-soft"
                        }`}
                      >
                        {done ? <Check /> : n}
                      </span>
                      <span className={`absolute top-11 text-[14px] whitespace-nowrap ${on ? "font-semibold text-purple" : "text-body-soft"}`}>{s.title}</span>
                    </button>
                    {i < total - 1 && <span className={`flex-1 h-[3px] mx-3 rounded-full ${done ? "bg-orchid" : "bg-lavender-deep"}`} />}
                  </div>
                );
              })}
            </div>

            {/* the question */}
            <h3 className="font-display text-[26px] lg:text-[30px] font-medium text-purple mt-14">
              {questions[current.param] ?? current.title}
            </h3>
            {hints[current.param] && (
              <p className="text-[16px] text-body-soft mt-1.5">{hints[current.param]}</p>
            )}

            {/* the choices */}
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3 mt-6">
              {current.options.map((opt, i) => {
                const on = picked === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => pick(opt.value)}
                    className={`relative flex flex-col items-center gap-2.5 rounded-[18px] px-3 pt-5 pb-4 bg-white border-2 transition-all duration-200 cursor-pointer hover:-translate-y-[3px] hover:shadow-lift ${
                      on ? "border-orchid shadow-lift" : "border-lavender-deep shadow-soft"
                    }`}
                  >
                    {on && (
                      <span className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-purple grid place-items-center"><Check /></span>
                    )}
                    <span
                      className="w-[52px] h-[52px] rounded-full grid place-items-center bg-cover bg-center font-display text-[20px] text-purple ring-4 ring-white shadow-soft"
                      style={opt.imageUrl ? { backgroundImage: `url(${mediaVariant(opt.imageUrl, "thumb")})` } : { background: TINTS[i % TINTS.length] }}
                    >
                      {!opt.imageUrl && opt.label.slice(0, 1).toUpperCase()}
                    </span>
                    <b className="text-[15px] font-semibold text-purple whitespace-nowrap overflow-hidden text-ellipsis max-w-full">{opt.label}</b>
                  </button>
                );
              })}
            </div>

            {/* the buttons */}
            <div className="mt-auto pt-6">
              <div className="border-t border-lavender-deep pt-5 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {step > 1 && (
                    <button type="button" onClick={() => setStep(step - 1)} className="text-[15px] font-semibold text-body-soft hover:text-purple px-2 py-3 cursor-pointer">← Back</button>
                  )}
                  {skipLabel && !last && (
                    <button type="button" onClick={skip} className="h-[48px] px-6 rounded-full bg-lavender text-purple font-semibold text-[14.5px] hover:bg-lavender-deep transition-colors cursor-pointer">{skipLabel}</button>
                  )}
                </div>
                {last ? (
                  <Link
                    href={resultHref}
                    className="inline-flex items-center h-[52px] px-9 bg-purple text-white rounded-full font-semibold text-[15.5px] shadow-[0_14px_30px_rgba(71,0,102,0.25)] hover:bg-purple-deep hover:-translate-y-[2px] transition-all whitespace-nowrap"
                  >
                    {doneLabel}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={!picked}
                    className="inline-flex items-center h-[52px] px-9 bg-purple text-white rounded-full font-semibold text-[15.5px] shadow-[0_14px_30px_rgba(71,0,102,0.25)] hover:bg-purple-deep hover:-translate-y-[2px] transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 cursor-pointer"
                  >
                    {nextLabel}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ---- The caption column ---- */}
          {sideCaption && (
            <div className="hidden lg:flex flex-col items-center justify-between border-l border-lavender-deep/70 py-8 text-purple">
              <Sprig className="w-[90px] h-[150px] text-orchid-mid/60" />
              <div className="text-[12px] tracking-[0.28em] uppercase text-body-soft leading-[2] max-w-[8ch] text-center">{sideCaption}</div>
              <span className="text-[22px] text-orchid-mid">♡</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
