"use client";

import { setDemoMode } from "../_data/demoMode";
import { demoReset } from "../_data/demoStore";

/*
  Data-source bar shown on every Customer screen. Makes it obvious whether you are
  looking at sample customers or the real database, and lets you switch either way.
*/
export default function DemoBanner({
  isDemo,
  onReload,
}: {
  isDemo: boolean;
  onReload: () => void;
}) {
  const switchTo = (demo: boolean) => {
    setDemoMode(demo);
    onReload();
  };

  if (isDemo) {
    return (
      <div className="flex items-center gap-3 bg-[#2e1a38] border border-[#432a50] text-purple rounded-[12px] px-4 py-2.5 mb-4 text-[12.5px] flex-wrap">
        <span className="text-[10px] font-bold tracking-[0.06em] uppercase bg-purple text-white px-2 py-1 rounded-full shrink-0">
          Demo data
        </span>
        <span className="flex-1 min-w-[220px]">
          22 sample customers with recipients, occasions, segments and duplicates — so you can try every screen.
        </span>
        <button
          onClick={() => {
            if (confirm("Reset the demo data back to the original 22 customers?")) {
              demoReset();
              onReload();
            }
          }}
          className="border border-purple/30 bg-white hover:border-orchid text-purple font-medium px-3 py-1.5 rounded-[9px] shrink-0"
        >
          Reset demo
        </button>
        <button
          onClick={() => switchTo(false)}
          className="border border-purple/30 bg-white hover:border-orchid text-purple font-medium px-3 py-1.5 rounded-[9px] shrink-0"
        >
          Use live data
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-lavender/50 border border-lavender-deep text-body-soft rounded-[12px] px-4 py-2 mb-4 text-[12px] flex-wrap">
      <span className="text-[10px] font-bold tracking-[0.06em] uppercase bg-[#0e7a3d] text-white px-2 py-0.5 rounded-full shrink-0">
        Live
      </span>
      <span className="flex-1 min-w-[200px]">Real customers from the API (:4000).</span>
      <button onClick={() => switchTo(true)} className="underline font-medium shrink-0 hover:text-purple">
        Show demo data
      </button>
    </div>
  );
}
