"use client";

import Link from "next/link";

import { useAuthHydrated, useAuthStore } from "../../_store/useAuthStore";

interface Props {
  cartCount: number;
  wishlistCount: number;
  onMoreClick: () => void;
}

export default function NavIcons({ cartCount, wishlistCount, onMoreClick }: Props) {
  const hydrated = useAuthHydrated();
  const customer = useAuthStore((s) => s.customer);
  const loggedIn = hydrated && customer !== null;

  return (
    <div className="flex items-center gap-1 ml-auto">

      {/* Track Order */}
      <Link href="/track" className="icon-btn group">
        <svg className="icon-svg" viewBox="0 0 24 24">
          <path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 4v14M15 6v14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <em>Track Order</em>
      </Link>

      {/* Wishlist */}
      <Link href="/wishlist" className="icon-btn group relative">
        <svg className="icon-svg" viewBox="0 0 24 24">
          <path d="M12 20.3S4 15 4 9.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8 2.9c0 5.4-8 10.7-8 10.7z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {wishlistCount > 0 && (
          <span className="absolute top-0 right-1.5 min-w-[17px] h-[17px] rounded-[9px] bg-orchid text-white text-[10px] font-semibold grid place-items-center px-1">
            {wishlistCount}
          </span>
        )}
        <em>Wishlist</em>
      </Link>

      {/* Cart */}
      <Link href="/cart" className="icon-btn group relative">
        <svg className="icon-svg" viewBox="0 0 24 24">
          <rect x="4" y="9" width="16" height="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5.5 13v7h13v-7M12 9v11M12 9C9 9 7.2 7.6 7.6 5.8 8 4.2 10.4 4 12 6.6 13.6 4 16 4.2 16.4 5.8 16.8 7.6 15 9 12 9z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {cartCount > 0 && (
          <span className="absolute top-0 right-1.5 min-w-[17px] h-[17px] rounded-[9px] bg-orchid text-white text-[10px] font-semibold grid place-items-center px-1">
            {cartCount}
          </span>
        )}
        <em>Cart</em>
      </Link>

      {/* Account — the dashboard when logged in, otherwise login. Order of the row: Track · Wishlist · Cart · Log in · More (owner, 4 Sep 2026) */}
      <Link
        href={loggedIn ? "/account" : "/account/login"}
        className="icon-btn group"
      >
        <svg className="icon-svg" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="3.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <em>{loggedIn ? "Account" : "Log in"}</em>
      </Link>

      {/* More */}
      <button onClick={onMoreClick} className="icon-btn group" aria-label="More options">
        <svg className="icon-svg" viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <em>More</em>
      </button>
    </div>
  );
}
