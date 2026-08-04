"use client";

import { useEffect } from "react";
import Link from "next/link";

/*
  Global error boundary — কোনো route render/runtime-এ throw করলে।
  Next-এর নিয়মে "use client" + { error, reset }।
  Footer layout-এ; এখানে GBE নেই (error state কম distraction ভালো)।
*/
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // backend এলে এখান থেকে error reporting যাবে
    console.error(error);
  }, [error]);

  return (
    <main className="bg-[#F6F4FA] min-h-[70vh] grid place-items-center px-4">
      <div className="w-full max-w-[440px] bg-white border-[1.5px] border-lavender-deep rounded-[26px] shadow-soft p-8 text-center">
        <span className="w-14 h-14 rounded-[50%_50%_50%_0] -rotate-45 bg-[#FBECEC] grid place-items-center mx-auto">
          <svg
            className="rotate-45 w-6 h-6 stroke-[#B42318] fill-none stroke-[1.8]"
            viewBox="0 0 24 24"
          >
            <path d="M12 8v5" strokeLinecap="round" />
            <circle cx="12" cy="16.5" r="0.6" fill="#B42318" stroke="none" />
            <path
              d="M10.3 4.3 3 17a2 2 0 0 0 1.7 3h14.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <h1 className="font-display text-[24px] text-purple font-semibold mt-5">
          Something went wrong
        </h1>
        <p className="text-[13.5px] text-body mt-2">
          A hiccup on our end — nothing you did. Try again, and if it keeps
          happening, our team is one message away.
        </p>

        <div className="flex flex-wrap justify-center gap-2.5 mt-6">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center h-[48px] px-6 bg-purple text-white rounded-[15px] font-semibold text-[14px] hover:bg-purple-deep transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center h-[48px] px-6 bg-white border-[1.5px] border-lavender-deep text-purple rounded-[15px] font-semibold text-[14px] hover:border-orchid-mid transition-colors"
          >
            Back to home
          </Link>
        </div>

        <Link
          href="/contact"
          className="inline-block mt-5 text-[12.5px] font-semibold text-orchid hover:text-purple transition-colors"
        >
          Contact support
        </Link>
      </div>
    </main>
  );
}
