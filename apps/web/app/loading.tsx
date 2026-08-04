/*
  Global route loading — server component fetch/transition-এর সময়।
  Spinner নয়, lavender skeleton block (রেফারেন্স স্পেক: geometry-matching
  skeleton, no spinners)।
*/
export default function Loading() {
  return (
    <main className="bg-[#F6F4FA]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
        <div className="animate-pulse space-y-5">
          {/* title */}
          <div className="h-8 w-2/3 sm:w-1/3 rounded-full bg-lavender-deep" />
          <div className="h-4 w-1/2 sm:w-1/4 rounded-full bg-lavender-deep/70" />

          {/* hero block */}
          <div className="h-40 rounded-[24px] bg-lavender-deep/60 mt-6" />

          {/* card grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[22px] border-[1.5px] border-lavender-deep bg-white p-4"
              >
                <div className="h-40 rounded-[16px] bg-lavender-deep/60" />
                <div className="h-4 w-3/4 rounded-full bg-lavender-deep/70 mt-4" />
                <div className="h-4 w-1/3 rounded-full bg-lavender-deep/60 mt-2.5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
