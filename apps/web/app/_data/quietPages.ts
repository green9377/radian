/*
  The quiet pages (owner, 8 Sep 2026): checkout, cart, wishlist, track,
  login and everything under /account. They carry none of the three closing
  sections — the Google reviews rail, the Visit-the-store block and the
  footer menu — because a shopper on them is doing something, not browsing.
  Each page leaves the first two out itself; the footer reads this list.
*/
const QUIET = ["/checkout", "/cart", "/wishlist", "/track", "/account"];

export const isQuietPage = (pathname: string | null | undefined) =>
  !!pathname && QUIET.some((p) => pathname === p || pathname.startsWith(`${p}/`));
