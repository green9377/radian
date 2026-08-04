"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
  Header search box — সব page-এ (layout → Header)।
  submit করলে /search?q=-এ নিয়ে যায়; আসল matching /search page করে।
  এক source of truth: box কেবল navigate করে, নিজে filter করে না।
*/

export default function SearchBar() {
  const router = useRouter();
  const [term, setTerm] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = term.trim();
    if (!t) return;
    router.push(`/search?q=${encodeURIComponent(t)}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      role="search"
      className="w-full flex items-center gap-2.5 bg-lavender rounded-full px-5 py-[11px] max-w-[460px]"
    >
      <button
        type="submit"
        aria-label="Search"
        className="shrink-0 grid place-items-center cursor-pointer"
      >
        <svg
          className="w-[17px] h-[17px] stroke-body-soft fill-none stroke-[1.8]"
          viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <input
        type="text"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search flowers, cakes and gifts"
        aria-label="Search products"
        className="bg-transparent border-none outline-none font-ui text-[16px] lg:text-[14.5px] text-body placeholder:text-body-soft w-full"
      />
    </form>
  );
}
