"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AnnouncementBar from "./AnnouncementBar";
import LocationGate from "./LocationGate";
import SearchBar from "./SearchBar";
import NavIcons from "./NavIcons";
import CategoryNav from "./CategoryNav";
import MorePanel from "./MorePanel";
import { useZoneStore, type Zone } from "../../_store/useZoneStore";
import { useCartCount } from "../../_store/useCartStore";
import { useWishlistCount } from "../../_store/useWishlistStore";
import ShopLogo from "../ui/ShopLogo";

export type { Zone };

function Logo({ small }: { small?: boolean }) {
  return (
    <Link href="/" className="flex items-center shrink-0">
      <ShopLogo tone="dark" size={small ? 18 : 24} />
    </Link>
  );
}

function LocationPill({
  zone,
  onClick,
  compact,
}: {
  zone: Zone | null;
  onClick: () => void;
  compact?: boolean;
}) {
  const label =
    zone === "dhaka" ? "Inside Dhaka" : zone === "bangladesh" ? "All Bangladesh" : "Select area";

  return (
    <button
      onClick={onClick}
      className={`flex items-center bg-lavender border-[1.5px] border-lavender-deep rounded-full text-purple hover:border-orchid transition-colors shrink-0 ${
        compact ? "gap-1.5 px-3 py-1" : "gap-2.5 px-4 py-1.5"
      }`}
    >
      <svg
        className={`stroke-current fill-none stroke-[1.8] shrink-0 ${compact ? "w-4 h-4" : "w-[18px] h-[18px]"}`}
        viewBox="0 0 24 24"
      >
        <path d="M12 21s-7-5.3-7-11a7 7 0 0 1 14 0c0 5.7-7 11-7 11z" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="flex flex-col items-start leading-tight text-left">
        <span className={`uppercase tracking-[0.1em] text-body-soft font-semibold ${compact ? "text-[9px]" : "text-[10px]"}`}>
          Deliver to
        </span>
        <span className={`font-semibold whitespace-nowrap ${compact ? "text-[12.5px]" : "text-sm"}`}>
          {label}
        </span>
      </span>
      <svg
        className="w-3.5 h-3.5 stroke-current fill-none stroke-[1.8] shrink-0"
        viewBox="0 0 24 24"
      >
        <path d="M6 9.5 12 15l6-5.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export default function Header() {
  const { zone, setZone } = useZoneStore();
  const [gateOpen, setGateOpen] = useState(false); // manual open (location switcher)
  const [hydrated, setHydrated] = useState(false);
  const [showMore, setShowMore] = useState(false);

  /* Cart badge — hydrate না হওয়া পর্যন্ত 0 ফেরত দেয়, তাই badge লুকানো
     থাকে আর server/client render মিলে যায় (zone-এর মতোই সমস্যা)। */
  const cartCount = useCartCount();
  const wishlistCount = useWishlistCount();

  /*
    Persist fix: zustand rehydrates localStorage AFTER first render,
    so `!zone` was true for a moment even for returning visitors and
    the gate flashed open. Only decide after hydration finishes.
  */
  useEffect(() => {
    const unsub = useZoneStore.persist.onFinishHydration(() =>
      setHydrated(true)
    );
    if (useZoneStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  // Hard block for new visitors (no saved zone), or manually opened
  const showGate = gateOpen || (hydrated && !zone);

  function handleZonePick(z: Zone) {
    setZone(z);
    setGateOpen(false);
  }

  return (
    <>
      {showGate && <LocationGate onPick={handleZonePick} />}
      <MorePanel open={showMore} onClose={() => setShowMore(false)} />

      <header className="sticky top-0 z-50 bg-white/94 backdrop-blur-[14px] border-b border-lavender-deep">
        {/* Announcement bar — always full browser width */}
        <AnnouncementBar zone={zone} />

        <div className="px-4 sm:px-6 lg:px-10">

          {/* ---- Mobile: row 1 — logo + icons at the corners ---- */}
          <div className="flex items-center justify-between py-2 lg:hidden">
            <Logo small />
            <NavIcons cartCount={cartCount} wishlistCount={wishlistCount} onMoreClick={() => setShowMore(true)} />
          </div>

          {/* ---- Mobile: row 2 — deliver-to + search ---- */}
          <div className="flex items-center gap-2 pb-2.5 lg:hidden">
            <LocationPill zone={zone} onClick={() => setGateOpen(true)} compact />
            <SearchBar />
          </div>

          {/* ---- Desktop: single row — logo/location · search · icons ---- */}
          <div className="hidden lg:flex items-center gap-5 py-3">
            <div className="flex items-center gap-5 flex-1 min-w-0">
              <Logo />
              <LocationPill zone={zone} onClick={() => setGateOpen(true)} />
            </div>
            <div className="flex-1 flex justify-center">
              <SearchBar />
            </div>
            <div className="flex-1 flex justify-end min-w-0">
              <NavIcons cartCount={cartCount} wishlistCount={wishlistCount} onMoreClick={() => setShowMore(true)} />
            </div>
          </div>

          <CategoryNav zone={zone} />
        </div>
      </header>
    </>
  );
}
