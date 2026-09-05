"use client";

import { Fragment, type ReactNode } from "react";
import { useZoneStore } from "../../_store/useZoneStore";
import type { CategoryConfig } from "../../_data/categories";
import { categoryProducts } from "../../_data/categories";
import type { Product } from "../../_data/products";
import type { ShopCategoryPage } from "../../_data/shop";
import ShopIcon from "../ui/ShopIcon";
import CustomSection from "./CustomSection";

import CategoryBanner from "./CategoryBanner";
import SubCategoryRail from "./SubCategoryRail";
import ProductRail from "./ProductRail";
import AttributeGrid from "./AttributeGrid";
import OccasionGrid from "./OccasionGrid";
import ColourGrid from "./ColourGrid";
import BudgetRail from "./BudgetRail";
import CategoryProductGrid from "./CategoryProductGrid";
import TileRail from "./TileRail";
import CategoryDelivery from "./CategoryDelivery";
import CategoryGiftFinder from "./CategoryGiftFinder";
import CategoryFaq from "./CategoryFaq";
import AboutSection from "../About/AboutSection";
import GiftFinderModal from "./GiftFinderModal";

/*
  ══════════════════════════════════════════════════════════════
  এটাই পুরো template-এর হৃদয়।

  config.sections array ঘুরে ঘুরে block render করে।
  নতুন category = নতুন config (app/_data/categories.ts)।
  এই file-এ হাত পড়বে না।

  Section-এর ORDER code-এ fixed — admin শুধু enabled + content বদলায়।
  কারণ: 13টা section যেকোনো order-এ = অগণিত combination, QA অসম্ভব।
  ══════════════════════════════════════════════════════════════
*/
export default function CategorySections({
  config,
  products: fromApi,
  rails,
  apiSlug,
  apiZone,
  filters,
  productsFailed,
  blocks,
}: {
  config: CategoryConfig;
  /** the API's products. Absent = this is the offline fallback, use the mock. */
  products?: Product[];
  /** the two rails come pre-picked by the server — see below */
  rails?: { bestsellers: Product[]; readyToday: Product[] };
  apiSlug?: string;
  apiZone?: "dhaka" | "bangladesh" | null;
  /** the filter this page is already showing — Load More must keep it */
  filters?: Record<string, string | undefined>;
  productsFailed?: boolean;
  /** every row the API returned, including sections the owner added */
  blocks?: ShopCategoryPage["sections"];
}) {
  const { zone } = useZoneStore();

  /*
    31 Jul 2026 — products now arrive from the server, already filtered for the
    zone the cookie named. The mock array stays as the path for the offline
    fallback ONLY, which is why this is a fallback and not a default: a page
    rendered from the API must never quietly fill itself from the mock.
  */
  const products = fromApi ?? categoryProducts(config, zone);

  return (
    <>
      {/* Gift Finder modal — page-এ একবার। CTA থেকে খোলে, উত্তর দিলে
          নিচের All Products grid filter হয়ে যায়। */}
      <GiftFinderModal />

      {config.sections.map((section, i) => {
        if (!section.enabled) return null;

        // productRail একই page-এ দুবার আসে — index দিয়ে unique key
        const key = `${section.key}-${i}`;

        /*
          Sections the owner added, placed after the built-in one they name.
          Rendered here rather than appended at the bottom, because "after the
          best sellers" is a real editorial decision and dumping every added
          block at the end would make it impossible.
        */
        const added = section.slot
          ? (blocks ?? []).filter((b) => b.blockType && b.config.after === section.slot)
          : [];

        const withAdded = (node: ReactNode) => (
          <Fragment key={key}>
            {section.icon || section.iconUrl || section.bgImageUrl ? (
              <div
                style={
                  section.bgImageUrl
                    ? { background: `url(${section.bgImageUrl}) center/cover` }
                    : undefined
                }
              >
                {(section.icon || section.iconUrl) && (
                  <div className="flex justify-center pt-[52px] -mb-[38px] text-orchid">
                    <ShopIcon name={section.icon ?? undefined} url={section.iconUrl ?? undefined} className="w-8 h-8" />
                  </div>
                )}
                {node}
              </div>
            ) : (
              node
            )}
            {added.map((b) => (
              <CustomSection key={b.key} row={b} zone={zone} />
            ))}
          </Fragment>
        );

        const node = (() => {
          switch (section.key) {
          case "banner":
            return <CategoryBanner key={key} config={config} zone={zone} />;

          case "subCategoryRail":
            return <SubCategoryRail key={key} section={section} tiles={config.subCategories} />;

          /*
            Two rails, one component. The server picked them by the same rules
            the mock used (`bestseller` and `express`), but against the whole
            catalogue instead of the 24 products this page happens to hold —
            otherwise "Most ordered" would mean "most ordered, of the first
            page of this category", which is not the same claim.
          */
          case "productRail": {
            const fromServer =
              rails && section.rule === "bestseller"
                ? rails.bestsellers
                : rails && section.rule === "express"
                  ? rails.readyToday
                  : null;
            return (
              <ProductRail
                key={key}
                section={section}
                products={fromServer ?? products}
                zone={zone}
                /* the server already applied the rule — or the owner's own
                   list, which no rule describes. See ProductRail. */
                preselected={fromServer !== null}
              />
            );
          }

          case "attributeGrid":
            return <AttributeGrid key={key} section={section} tiles={config.attributes} />;

          case "occasionGrid":
            return <OccasionGrid key={key} section={section} tiles={config.occasions} />;

          case "colourGrid":
            return <ColourGrid key={key} section={section} tiles={config.colours} />;

          case "budgetRail":
            return <BudgetRail key={key} section={section} tiles={config.budgets} />;

          case "productGrid":
            return (
              <CategoryProductGrid
                key={key}
                section={section}
                config={config}
                products={products}
                totalProducts={config.totalProducts}
                zone={zone}
                apiSlug={apiSlug}
                apiZone={apiZone}
                apiFilters={filters}
                failed={productsFailed}
              />
            );

          case "comboRail":
            return <TileRail key={key} section={section} tiles={config.combos} />;

          case "deliveryBand":
            return <CategoryDelivery key={key} section={section} zone={zone} />;

          case "crossSellRail":
            return <TileRail key={key} section={section} tiles={config.crossSell} gold />;

          case "giftFinder":
            return <CategoryGiftFinder key={key} section={section} />;

          case "faq":
            return <CategoryFaq key={key} section={section} faqs={config.faqs} />;

          /*  The story at the bottom (owner, 5 Sep 2026): the homepage's About
              Radian card, with this category's own words — SEO text a
              shopper reads last and Google reads whole.  */
          case "story":
            return <AboutSection key={key} config={section.config ?? {}} id="story" variant="article" />;

            default:
              return null;
          }
        })();

        return node ? withAdded(node) : null;
      })}
    </>
  );
}
