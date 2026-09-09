/*
  Where the footer is drawn — owner, 9 Sep 2026.

  > *"amder nicher footer jen na dekhay asob page. footer just home, catagory,
  >  product ar blog section — apatot ar bahire r kothaw dorkar nai."*

  ⚠️ THIS USED TO BE A LIST OF PAGES TO SKIP, and it was the wrong way round.
  Every new page was born WITH a footer and somebody had to remember to add it
  here — so /order-success, /pay and /review all carried a full site menu under
  a customer who was in the middle of something. A list of what KEEPS the
  footer cannot go stale in that direction: a new page has none until somebody
  decides it should.

  The four that keep it are the four somebody browses:

    /                the home page
    /<category>      a category — Fresh Flower, Cakes, Occasions…
    /p/<slug>        a product
    /journal…        the blog

  ⚠️ A CATEGORY IS A BARE SLUG (`/fresh-flower`), and so are the shop's own
  standing pages (`/about`, `/terms`, `/faq`). One segment alone cannot tell
  them apart, so the standing pages are named below. A slug NOT in that list is
  taken to be a category — which is the safe direction: the worst case is a
  footer on a page that has none today, never a missing footer on the pages the
  owner named.
*/

/** One-segment paths that are NOT categories, so they get no footer. */
const NOT_A_CATEGORY = new Set([
  "about",
  "account",
  "cart",
  "checkout",
  "collections",
  "contact",
  "delivery-info",
  "faq",
  "occasions",
  "order-success",
  "pay",
  "preview",
  "privacy-policy",
  "products",
  "refund-policy",
  "review",
  "reviews",
  "search",
  "terms",
  "track",
  "wishlist",
]);

/** Does this page carry the footer? */
export function hasFooter(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === "/") return true;

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return true;

  const [first] = parts;
  if (first === "p") return true; // a product
  if (first === "journal") return true; // the blog and its articles

  // a single bare slug that is not one of the shop's own standing pages
  return parts.length === 1 && !NOT_A_CATEGORY.has(first);
}

/*
  ⚠️ `isQuietPage` LIVED HERE AND IS GONE. It listed the pages that skip the
  footer, and `hasFooter` above answers that question the other way round now.
  Nothing else read it — the closing sections (the Google reviews rail, the
  Visit-the-store block) are left out by each page itself, as its old comment
  said. The file keeps its name because that is the import path, not because
  "quiet" is still the idea.
*/
