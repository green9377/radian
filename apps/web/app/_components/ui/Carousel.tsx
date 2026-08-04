"use client";

import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";

/*
  Reusable horizontal snap carousel with prev/next arrows.
  Arrows auto-hide at the ends. Used by Categories, Occasions, Reviews etc.
*/

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      className="w-[18px] h-[18px] stroke-current fill-none stroke-[2]"
      viewBox="0 0 24 24"
    >
      {dir === "left" ? (
        <path d="M15 5 8 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

export default function Carousel({
  children,
  gapClass = "gap-[22px]",
  resetKey,
  autoPlayMs,
}: {
  children: ReactNode;
  gapClass?: string;
  /** change this value to reset scroll position (e.g. on tab switch) */
  resetKey?: string | number;
  /** auto-advance one card every N ms; pauses while hovering/touching */
  autoPlayMs?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);
  const [paused, setPaused] = useState(false);

  // Auto-play: slide to the next card, loop back to the start at the end
  useEffect(() => {
    if (!autoPlayMs) return;
    const t = setInterval(() => {
      if (paused) return;
      const el = trackRef.current;
      if (!el) return;
      const child = el.children[0] as HTMLElement | undefined;
      const step = child ? child.getBoundingClientRect().width + 22 : el.clientWidth * 0.7;
      if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 8) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: step, behavior: "smooth" });
      }
    }, autoPlayMs);
    return () => clearInterval(t);
  }, [autoPlayMs, paused]);

  const updateButtons = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  useEffect(() => {
    trackRef.current?.scrollTo({ left: 0 });
    updateButtons();
    window.addEventListener("resize", updateButtons);
    return () => window.removeEventListener("resize", updateButtons);
  }, [resetKey, updateButtons]);

  const scroll = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  const btn =
    "absolute top-1/2 -translate-y-[60%] z-[5] w-11 h-11 rounded-full bg-white text-purple grid place-items-center shadow-lift border border-lavender-deep transition-opacity duration-200 hover:bg-purple hover:text-white cursor-pointer";

  return (
    <div
      className="relative"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setTimeout(() => setPaused(false), 4000)}
    >
      <button
        aria-label="Scroll left"
        onClick={() => scroll(-1)}
        className={`${btn} -left-4 ${canPrev ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <Chevron dir="left" />
      </button>

      <div
        ref={trackRef}
        onScroll={updateButtons}
        className={`flex ${gapClass} overflow-x-auto snap-x snap-mandatory scroll-smooth px-1 pt-[6px] pb-[18px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
      >
        {children}
      </div>

      <button
        aria-label="Scroll right"
        onClick={() => scroll(1)}
        className={`${btn} -right-4 ${canNext ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <Chevron dir="right" />
      </button>
    </div>
  );
}
