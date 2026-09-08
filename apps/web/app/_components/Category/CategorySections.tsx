"use client";

import { Fragment, type ReactNode } from "react";
import { useZoneStore } from "../../_store/useZoneStore";
import type { CategoryConfig } from "../../_data/categories";
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
import GiftFinder from "../GiftFinder/GiftFinder";
import CategoryFaq from "./CategoryFaq";
import AboutSection from "../About/AboutSection";

/*
  ══════════════════════════════════════════════════════════════
  The heart of the template: walk `config.sections` and render each block.
  A new category is a new config from the API — this file is not touched.

  The ORDER of sections is fixed in code — the admin only switches sections
  on/off and changes content. Fourteen sections in any order = countless
  combinations, impossible to QA.
  ══════════════════════════════════════════════════════════════
*/
export default function CategorySections({
  config,
  products,
  rails,
  apiSlug,
  apiSub,
  apiZone,
  filters,
  productsFailed,
  blocks,
  shopName,
}: {
  config: CategoryConfig;
  /** the first page of the grid, from the API */
  products: Product[];
  /** the two rails come pre-picked by the server — see below */
  rails?: { bestsellers: Product[]; readyToday: Product[] };
  apiSlug?: string;
  /** set on a sub-category page — the API scopes by parent + sub */
  apiSub?: string;
  apiZone?: "dhaka" | "bangladesh" | null;
  /** the filter this page is already showing — Load More must keep it */
  filters?: Record<string, string | undefined>;
  productsFailed?: boolean;
  /** every row the API returned, including sections the owner added */
  blocks?: ShopCategoryPage["sections"];
  /** Company settings → the shop's name; the banner's eyebrow on a root page */
  shopName: string;
}) {
  const { zone } = useZoneStore();

  return (
    <>
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
                  <div className="flex justify-center pt-[var(--section-y)] -mb-[calc(var(--section-y)-14px)] text-orchid">
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
            return <CategoryBanner key={key} config={config} zone={zone} shopName={shopName} />;

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
            const list =
              section.rule === "express" ? (rails?.readyToday ?? []) : (rails?.bestsellers ?? []);
            return <ProductRail key={key} section={section} products={list} zone={zone} />;
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
                apiSub={apiSub}
                apiZone={apiZone}
                apiFilters={filters}
                failed={productsFailed}
              />
            );

          /*  Better together = related PRODUCTS the owner paired with this
              category; Keep exploring (below) = other categories. Two rows,
              two purposes (owner, 6 Sep 2026).  */
          case "comboRail":
            return <ProductRail key={key} section={section} products={config.combos} zone={zone} />;

          case "deliveryBand":
            /*  scoped to this category: the products under the tabs are the
                ones on this page that can travel that fast  */
            return (
              <CategoryDelivery
                key={key}
                section={section}
                zone={zone}
                categorySlug={apiSlug}
                subSlug={apiSub}
              />
            );

          case "crossSellRail":
            return <TileRail key={key} section={section} tiles={config.crossSell} gold />;

          /*  The homepage's three-step wizard, searching this category only
              (owner, 5 Sep 2026): its answers land on this page's own
              address, and the grid below filters on the first render.  */
          case "giftFinder":
            return (
              <GiftFinder
                key={key}
                id="gift-finder"
                config={section.config ?? {}}
                basePath={apiSlug ? `/${apiSlug}${apiSub ? `/${apiSub}` : ""}` : "/products"}
                head={{
                  eyebrow: section.eyebrow,
                  title: section.heading,
                  subtitle: section.subheading,
                }}
              />
            );

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
