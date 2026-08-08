"use client";

import { useEffect, useState } from "react";
import { useZoneStore } from "./_store/useZoneStore";
import { getShopLayout, zoneCode, type LayoutBlock } from "./_data/shop";
import CustomSection from "./_components/ui/CustomSection";
import HeroSection from "./_components/Hero/HeroSection";
import TrustStrip from "./_components/TrustStrip/TrustStrip";
import CategorySection from "./_components/Categories/CategorySection";
import OccasionSection from "./_components/Occasions/OccasionSection";
import BestSellers from "./_components/BestSellers/BestSellers";
import PromoBanner from "./_components/Promo/PromoBanner";
import DeliverySection from "./_components/Delivery/DeliverySection";
import BudgetSection from "./_components/Budget/BudgetSection";
import GiftFinder from "./_components/GiftFinder/GiftFinder";
import Reviews from "./_components/GBE/Reviews";
import BlogSection from "./_components/Blog/BlogSection";
import VisitStore from "./_components/GBE/VisitStore";

/*
  The homepage renders whatever the admin says, in whatever order it says.

  DEFAULT_ORDER is the arrangement the design was approved in, and it is what
  renders until the API answers. Not a placeholder: on a client-rendered page
  there is a real moment before the response arrives, and a homepage that
  assembles itself out of order in front of the visitor is worse than one that
  briefly shows the standard arrangement.
*/
const DEFAULT_ORDER: LayoutBlock[] = [
  "hero", "trust", "categories", "occasions", "bestsellers", "promo",
  "delivery", "budget", "giftfinder", "reviews", "blog", "store",
].map((key) => ({ key, blockType: null, title: null, subtitle: null, config: {} }));

export default function Home() {
  const { zone } = useZoneStore();
  const [order, setOrder] = useState<LayoutBlock[]>(DEFAULT_ORDER);

  useEffect(() => {
    let alive = true;
    getShopLayout(zoneCode(zone)).then((blocks) => {
      // An empty answer means every section is switched off — possible, but far
      // more likely to be a fault than an intention, and a blank homepage is not
      // something to render on a guess.
      if (!alive || !blocks || blocks.length === 0) return;
      setOrder(blocks);
    });
    return () => { alive = false; };
  }, [zone]);

  /* Each section keeps its own props. A map rather than a switch so that adding
     one is a single line, and forgetting to add it here is a missing section
     rather than a crash. */
  const SECTIONS: Record<string, React.ReactNode> = {
    hero: <HeroSection zone={zone} />,
    trust: <TrustStrip zone={zone} />,
    categories: <CategorySection zone={zone} />,
    occasions: <OccasionSection />,
    bestsellers: <BestSellers zone={zone} />,
    promo: <PromoBanner zone={zone} />,
    delivery: <DeliverySection zone={zone} />,
    budget: <BudgetSection zone={zone} />,
    giftfinder: <GiftFinder />,
    reviews: <Reviews />,
    blog: <BlogSection />,
    store: <VisitStore />,
  };

  return (
    // headings come from the provider in the root layout — every page, not
    // just this one
    <main>
        {order.map((b) => (
          <div key={b.key}>
            {b.blockType ? <CustomSection block={b} zone={zone} /> : (SECTIONS[b.key] ?? null)}
          </div>
        ))}
    </main>
  );
}
