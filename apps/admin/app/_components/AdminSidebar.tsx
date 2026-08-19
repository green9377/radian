"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NO_SESSION_PATHS, useAuth } from "./AuthGate";
import { getMyAccess, WEB_BASE } from "../_data/api";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Icon from "./Icon";
import NotificationsBell from "./NotificationsBell";

/*
  Admin nav — active link via usePathname.

  A module with a sub-menu: clicking ANYWHERE on the row opens it and goes to the
  module; clicking the row again closes the menu and leaves you where you are
  (sobuj, 21 Jul — the old build only reacted to the tiny arrow). Entering a module by
  any other route auto-expands it, and a manual close stays closed because the effect
  only fires when the path itself changes.
*/
/** A sub-menu entry. It may itself carry a sub-menu — Marketing is one module
    with four sub-modules under it, and each of those has its own screens
    (owner, 28 Jul 2026), so the nav goes three deep, not two. */
type Sub = { label: string; href: string; match?: (p: string) => boolean; subs?: Sub[]; roles?: Role[] };
/** who may even SEE this entry. Missing = everybody signed in.
    The server enforces the same rule — this only stops staff from
    clicking into a wall. */
export type Role = "OWNER" | "MANAGER" | "STAFF";
type Item = { label: string; href?: string; icon: string; subs?: Sub[]; roles?: Role[] };
/*  accent + emblem — each department wears its own colour (owner, 18 Aug 2026:
    the six groups looked identical, so entering the panel read as one long
    frightening wall). The colour appears on the header chip, the header text
    and a thin rail beside the group's rows — enough to tell departments apart
    at a glance, never enough to shout.  */
type Group = { title: string; accent: string; emblem: string; items: Item[] };

const exact = (h: string) => (p: string) => p === h;

/*  Does this sub own the current path? A sub with a `match` uses it (Overview
    is /products but only owns /products exactly); everything else owns its
    href and anything beneath it.  */
const subOwns = (s: Sub, p: string) =>
  s.match ? s.match(p) : p === s.href || p.startsWith(s.href + "/");

/*  Which module is the page standing in? A SUB match wins over a bare href
    prefix — "Variants & options" lives at /products/variants but belongs to
    Catalog, so on that path Catalog (whose sub owns it) must beat Products
    (whose /products href merely prefixes it). 6 Aug 2026.  */
const pickActive = (items: Item[], p: string): Item | undefined =>
  items.find((it) => it.subs?.some((s) => subOwns(s, p))) ??
  items.find((it) => !!it.href && (p === it.href || p.startsWith(it.href + "/")));

/*  ═══════════════════════════════════════════════════════════════════════
    HOW THIS PANEL IS ARRANGED — owner, 18 August 2026 (replaces the 17 Aug
    Website/Shop/Internal arrangement, which the owner found hard to read:
    "Website" vs "Shop" vs "Internal" describe where a thing BELONGS, and he
    thinks in terms of what he is DOING).

    Groups now follow the rhythm of a working day, most-touched first:

      TODAY'S WORK    what arrives and must be handled: orders, delivery,
                      messages, returns, the counter
      WHAT YOU SELL   the shop window and the catalogue behind it
      STOCK & BUYING  goods in: inventory, purchases, suppliers, items, assembly
      MONEY           the books, and the questions that cross modules
      GROWTH          bringing people in and knowing who they are
      SETUP           set once, changed rarely — the far end on purpose

    The three rules from the previous arrangement still hold, unchanged:

    1. A MODULE MAY APPEAR IN TWO PLACES; ITS DATA MAY NOT. Returns now has
       ONE top-level row (the whole book). The website door and the counter
       door live inside Orders and POS as filtered links (?channel=) —
       DEC-RTN-016, one table, one total.
    2. A MODULE'S DAILY SCREENS AND ITS SETUP SCREENS CAN LIVE APART.
       Delivery's board is in TODAY'S WORK; Methods & slots stay in SETUP.
    3. A REPORT LIVES WHERE ITS DECISION LIVES.

    ⚠️ NOT ONE href CHANGED. Access keys derive from hrefs (ADM-RULE-001), so
    every tick and bookmark survives. After editing this array, regenerate the
    registry: node apps/api/src/administration/registry.gen.mjs
    ═══════════════════════════════════════════════════════════════════════ */
const GROUPS: Group[] = [
  {
    title: "Today's work", accent: "#f0a8b8", emblem: "clock",
    items: [
      /*  Orders — the website's output (owner, 17 Aug 2026: "order holo online
          ba website releted"). A counter sale is NOT here; it is under Shop,
          in POS. Both still land in the one Order table (DEC-POS-001) — this
          is a menu, not a second ledger.  */
      {
        label: "Orders", href: "/orders", icon: "bag",
        subs: [
          { label: "Overview", href: "/orders", match: exact("/orders") },
          { label: "All orders", href: "/orders/list" },
          { label: "Needs action", href: "/orders/action" },
          { label: "Payments", href: "/orders/payments" },
          // where an order came in through (DEC-SAL-001). The API has existed
          // since Sales; there was never a screen, which is why foodpanda and
          // Sugary had nowhere to be recorded.
          { label: "Sales channels", href: "/orders/channels" },
          { label: "Returns", href: "/returns?channel=online" }, // → the online door, DEC-RTN-016
          { label: "Recovery", href: "/orders/recovery" },
          { label: "Scheduled", href: "/orders/scheduled" },
          { label: "Cancelled", href: "/orders/cancelled" },
          { label: "Reports", href: "/orders/reports" },
        ],
      },
      /*  DELIVERY — the work half. Board, proof, carrier settlement and the
          cost report; every one of them a thing that happens today.

          "Cost & performance" stays HERE and not in Intelligence on purpose
          (rule 3): reading it sends you straight to Methods & slots to change
          a zone. A report and the decision it drives belong in one room.
          Intelligence answers the questions that cross modules; this one does
          not leave Delivery.

          ⚠️ KEEP THE href. It is tempting to drop it the way Catalog does,
          since the first child points at the same /delivery — but that is
          exactly backwards here. With the href, the parent keys as "delivery"
          and the board keys as "delivery.overview" (subKey's same-href rule),
          which is what the access registry has always held. Without it, the
          parent would slug "delivery" from its LABEL and the board would slug
          "delivery" from its href — two rows, one key.  */
      {
        label: "Delivery", href: "/delivery", icon: "truck",
        subs: [
          { label: "Fulfilment board", href: "/delivery", match: (p) => p === "/delivery" || p.startsWith("/delivery/board") },
          { label: "Proof photos", href: "/delivery/proof" },
          { label: "Settle a carrier", href: "/delivery/settle" },
          { label: "Cost & performance", href: "/delivery/performance" },
        ],
      },
      // Inbox — every customer conversation, whatever channel it arrived on.
      { label: "Inbox", href: "/inbox", icon: "mail" },
      /*  RETURNS & REFUNDS — the WHOLE book, and the only row that carries the
          totals (RADIAN_RETURNS_MODULE_ARCHITECTURE.md, DEC-RTN-005..016).
          The website and the counter each have a narrowed door above; this is
          where they meet and where every figure is added up. Staff-initiated
          only; refund ≤ collected; restock via Inventory.

          "Reasons & settings" is NOT here — it is set once and lives in
          Configuration, by the same rule that split Delivery.

          ⚠️ /returns/[id] is dynamic — new/settings are reserved static names.  */
      {
        label: "Returns & Refunds", href: "/returns", icon: "returnArrow",
        subs: [
          { label: "Overview (all returns)", href: "/returns", match: exact("/returns") },
          { label: "New return", href: "/returns/new" },
        ],
      },
      // POS = the physical-store counter (RADIAN_POS_MODULE_ARCHITECTURE.md, 23 Jul).
      // Separate module, but a completed sale lands in the unified Order ledger
      // (channel=POS, DEC-POS-001).
      // ⚠️ /pos/[static] only — no dynamic segment yet. /pos = Overview.
      {
        label: "POS", href: "/pos", icon: "register",
        subs: [
          { label: "Overview", href: "/pos", match: exact("/pos") },
          { label: "Sell (counter)", href: "/pos/sell" },
          { label: "Today / Shift", href: "/pos/shift" },
          { label: "Sales history", href: "/pos/sales" },
          { label: "Day-close", href: "/pos/day-close" },
          { label: "Due board", href: "/pos/due" },
          { label: "Returns", href: "/returns?channel=counter" }, // the counter door, DEC-RTN-016
          { label: "Settings", href: "/pos/settings" },
        ],
      },
    ],
  },
  {
    title: "What you sell", accent: "#e07be0", emblem: "star",
    items: [
      /*  Products = what goes ON those pages. It sits in Website and not in
          some master-data drawer because a product IS a page in the shop:
          editing one changes what a customer sees within the minute.

          6 Aug 2026 (owner): "Variants & options" moved to Catalog (it is a
          store-facing classification master, like Categories/Tags/Brands),
          and "Daily capacity" moved to Assembly (it is a back-of-house
          production limit). URLs unchanged, so access ticks survive.

          ⚠️ The physical master BEHIND a product — Items (flowers, ribbon,
          paper) — is deliberately NOT here. A customer never sees an item;
          it lives in Internal beside Inventory and Assembly, which is the
          only place it is ever used.  */
      {
        label: "Products", href: "/products", icon: "flower",
        subs: [
          { label: "Overview", href: "/products", match: exact("/products") },
          { label: "All products", href: "/products/list" },
          { label: "Stock", href: "/products/stock" },
          { label: "Margin", href: "/products/margin" },
          { label: "Health", href: "/products/health" },
          { label: "Catalog funnel", href: "/products/funnel" },
          { label: "Add-ons", href: "/products/addons" },
          { label: "Upgrades", href: "/products/upgrades" },
          { label: "Bulk actions", href: "/products/bulk" },
          { label: "Trash", href: "/products/trash" },
        ],
      },
      /*  Storefront leads the group: it is the thing the rest of this section
          is about. Everything below it feeds what these pages display.

          ⚠️ ONE LEVEL, NOT TWO — and this is the second correction, so it is
          worth writing down properly.

          First it was ten entries sitting at the top of the panel. The owner
          asked for one module with the rest inside it, so they were grouped
          into Pages / Blocks / Words / Shop details. That fixed the top of the
          panel and broke everything under it: reaching Banners went from one
          click to three, and every click needed a decision — "is a banner a
          Block or a Page?" — that only the person who invented the grouping
          could answer.

          The grouping still exists where it costs nothing: on the Overview
          screen, where all four are visible at once and nothing is hidden
          behind a word. In the nav, a plain list is easier than a tidy tree.
          Tidiness that costs clicks is not tidiness.  */
      {
        label: "Storefront", href: "/storefront", icon: "store",
        subs: [
          { label: "Overview", href: "/storefront", match: exact("/storefront") },

          /*  ── PAGES ───────────────────────────────────────────────────────
              Everything a page needs is now INSIDE the page — owner, 31 Jul.

              Banners, the trust strip, the budget cards and every section's
              wording used to be four more rows here. They belong to the
              homepage and to nothing else, so they are edited inside the
              homepage: open a section, and its editor is right there. The
              standalone screens still exist at their old addresses for anyone
              who arrives by link or bookmark; they are simply not a place he
              has to KNOW about any more.  */
          { label: "Homepage", href: "/storefront/layout" },
          { label: "Category pages", href: "/storefront/category-page" },

          /*  ── EVERY PAGE ──────────────────────────────────────────────────
              These are not part of one page. Reviews, the shop card and the
              footer render at the bottom of EVERY page, and the journal is its
              own section of the site. Filing them inside the homepage would be
              filing them under one of the many pages they appear on.  */
          { label: "Reviews", href: "/storefront/reviews" },
          { label: "Journal", href: "/storefront/journal" },
          /*  Terms, Refund Policy, Privacy, FAQ — the storefront reads these
              from the Content module (৪ আগস্ট); this is where they are written.
              bKash/SSLCommerz merchant review asks to SEE these pages live.  */
          { label: "Pages & FAQs", href: "/storefront/pages" },
          { label: "Visit the shop", href: "/storefront/hours" },
          { label: "Footer & menus", href: "/storefront/footer" },
        ],
      },
      /*  Catalog = the classification masters under one roof (owner, 6 Aug
          2026: "choto choto 3 ta jinis main module e bose ache — ek module
          kore sub-module bosao"). Website, because these ARE the shop's
          navigation: a category is a menu entry a customer clicks.

          THE URLS DO NOT MOVE — /categories, /tags and /brands keep every
          deep link and every existing access tick; only the menu groups them.

          ⚠️ NO href on the parent, deliberately. Access keys derive from
          hrefs (moduleKey/subKey below): give this row /categories and its
          key collides with the Categories screen's own key, which is the
          key every existing tick points at. href-less, the row derives
          "catalog" from its label and simply opens the branch on click —
          the three children keep their exact old keys and old ticks.  */
      {
        label: "Catalog", icon: "layers",
        subs: [
          { label: "Categories", href: "/categories" },
          { label: "Occasions & Tags", href: "/tags" },
          { label: "Brands", href: "/brands" },
          { label: "Variants & options", href: "/products/variants" },
        ],
      },
    ],
  },
  {
    title: "Stock & buying", accent: "#5ec9a8", emblem: "box",
    items: [
      // Inventory = stock's ONE owner (RADIAN_INVENTORY_MODULE_ARCHITECTURE.md, 22 Jul).
      // Immutable ledger + AVCO money.
      {
        label: "Inventory", href: "/inventory", icon: "warehouse",
        subs: [
          { label: "Overview", href: "/inventory", match: exact("/inventory") },
          { label: "Stock board", href: "/inventory/stock" },
          { label: "Opening stock", href: "/inventory/opening" },
          { label: "Transfer", href: "/inventory/transfer" },
          { label: "Wastage & Gift", href: "/inventory/issue" },
          { label: "Stocktake", href: "/inventory/stocktake" },
          { label: "Movements", href: "/inventory/movements" },
          { label: "Warehouses", href: "/inventory/warehouses" },
          { label: "Reports", href: "/inventory/reports" },
          { label: "Settings", href: "/inventory/settings" },
        ],
      },
      // Purchases = the buying book (RADIAN_PURCHASE_MODULE_ARCHITECTURE.md, 22 Jul).
      // One entity, two doors: quick market entry + advance orders (DEC-PUR-001).
      // Requisition/Order screens arrive with the first branch — deliberately absent.
      // ⚠️ /purchases/[id] is dynamic — list/new/returns are reserved static names.
      {
        label: "Purchases", href: "/purchases", icon: "cart",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "Overview", href: "/purchases", match: exact("/purchases") },
          { label: "All purchases", href: "/purchases/list" },
          { label: "New purchase", href: "/purchases/new" },
          { label: "Returns", href: "/purchases/returns" },
          { label: "Reports", href: "/purchases/reports" },
        ],
      },
      // Suppliers = everyone Radian pays (RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md, 23 Jul).
      // Purchase only references it (DEC-SUP-001).
      // ⚠️ /suppliers/[id] is dynamic — list/new/settings are reserved static names.
      {
        label: "Suppliers", href: "/suppliers", icon: "users",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "Overview", href: "/suppliers", match: exact("/suppliers") },
          { label: "All suppliers", href: "/suppliers/list" },
          { label: "New supplier", href: "/suppliers/new" },
          // DEC-SUP-009 — fulfillment vendors' own workspace (cake-type partners):
          // same Supplier table underneath, their own face on top
          { label: "Vendors", href: "/suppliers/vendors", match: (p) => p.startsWith("/suppliers/vendors") },
          { label: "Settings", href: "/suppliers/settings" },
        ],
      },
      /*  Items = the physical master behind every Product
          (RADIAN_ITEM_MODULE_ARCHITECTURE.md). It sat beside Products for a
          year; it is here now because an item is a thing in a bucket in the
          back room. Nobody outside ever sees one, and the screens that use it
          are the two directly above.

          ⚠️ /items/[id] is dynamic — the static names below can never be item
          ids. Everything the Item module needs lives INSIDE it (owner, 21
          Jul): its own category tree, its own colour/size master, and Units.  */
      {
        label: "Items", href: "/items", icon: "gem",
        subs: [
          { label: "Overview", href: "/items", match: exact("/items") },
          { label: "All items", href: "/items/list" },
          { label: "New item", href: "/items/new" },
          /* Recipes moved OUT with the Recipe tab (DEC-ITM-011 phase 3) — it belongs to
             Assembly, and two homes for one idea is the confusion we just removed.
             Costs removed too: every figure on it already lives on Overview (the "no
             cost" alert) or All items (cost column, sort by dearest, the No-cost tick),
             and half its numbers were about recipes. A screen that only repeats other
             screens costs attention and gives nothing back. (sobuj, 21 Jul) */
          { label: "Item categories", href: "/items/categories" },
          { label: "Colours", href: "/items/colors" },
          { label: "Sizes", href: "/items/sizes" },
          // Units lives under Items (owner's call, 21 Jul) — units exist to serve
          // items, so that is where people look. No top-level entry, or it appears twice.
          { label: "Units", href: "/items/units" },
          { label: "Trash", href: "/items/trash" },
        ],
      },
      // Assembly v2 (RADIAN_ASSEMBLY_MODULE_ARCHITECTURE.md, redesign 23 Jul):
      // Template (no stock touch) → Pipeline (components → Assembly floor) →
      // Finished goods → Transfer (owner picks the Item). Stock via Inventory only.
      {
        label: "Assembly", href: "/assembly", icon: "tools",
        subs: [
          { label: "Overview", href: "/assembly", match: exact("/assembly") },
          { label: "Templates", href: "/assembly/templates" },
          { label: "Production pipeline", href: "/assembly/pipeline" },
          { label: "Finished goods", href: "/assembly/finished" },
          { label: "Wastage", href: "/assembly/wastage" },
          /*  Daily capacity — how much can be MADE per day. A back-of-house
              production limit, so it lives here beside Assembly, not in
              Products. URL unchanged (/products/capacity), 6 Aug 2026.  */
          { label: "Daily capacity", href: "/products/capacity" },
          { label: "Settings", href: "/assembly/settings" },
        ],
      },
    ],
  },
  {
    title: "Money", accent: "#e9c46a", emblem: "cash",
    items: [
      {
        label: "Finance", href: "/finance", icon: "wallet",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "Overview", href: "/finance", match: (p) => p === "/finance" },
          { label: "Money accounts", href: "/finance/accounts" },
          { label: "Chart of accounts", href: "/finance/chart" },
          { label: "Expenses", href: "/finance/expenses" },
          { label: "Money in & moving", href: "/finance/income" },
          { label: "Partners", href: "/finance/partners" },
          { label: "Monthly bills", href: "/finance/recurring" },
          { label: "Staff advance & salary", href: "/finance/staff" },
          { label: "Cash with carriers", href: "/finance/carrier" },
          { label: "Assets & loans", href: "/finance/assets" },
          { label: "Reports", href: "/finance/reports" },
          { label: "Books vs reality", href: "/finance/drift" },
          { label: "VAT challan (Mushak 6.3)", href: "/finance/vat" },
          { label: "Ledger", href: "/finance/ledger" },
          { label: "Manual journal", href: "/finance/journal" },
          { label: "Settings", href: "/finance/settings" },
        ],
      },
      /*  INTELLIGENCE — RADIAN_INTELLIGENCE_MODULE_ARCHITECTURE.md (29 Jul 2026).
          ONE module with four sub-modules, exactly as the owner's own map has
          it. The Executive Dashboard is a SUB-MODULE, not a module of its own —
          an earlier pass got that wrong and it is worth not repeating.

          Last in Internal on purpose: by rule 3 in the header comment, a
          module's own reports stay with that module, and only the questions
          that cross modules ("where did this month's profit come from") land
          here. So this is the room you enter after the work, not during it.

          NO role gate on the module itself. DEC-INT-005 gives STAFF the
          Executive Dashboard deliberately — the Today list IS their work, and
          the server withholds cost and cash from it per figure rather than
          closing the door. An earlier pass put roles here and hid the whole
          module from staff, which quietly reversed a locked decision.  */
      {
        label: "Intelligence", href: "/intelligence", icon: "sparkle",
        subs: [
          { label: "Executive dashboard", href: "/intelligence", match: exact("/intelligence") },
          { label: "Analytics", href: "/intelligence/analytics", roles: ["OWNER", "MANAGER"] },
          { label: "Reports", href: "/intelligence/reports", roles: ["OWNER", "MANAGER"] },
          { label: "Targets & KPIs", href: "/intelligence/kpis", roles: ["OWNER", "MANAGER"] },
          { label: "Forecast & market", href: "/intelligence/forecast", roles: ["OWNER", "MANAGER"] },
        ],
      },
    ],
  },
  {
    title: "Growth", accent: "#7fb4f0", emblem: "chart",
    items: [
      {
        label: "Marketing & Growth", href: "/marketing", icon: "megaphone",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "Overview", href: "/marketing", match: exact("/marketing") },
          {
            label: "Campaigns", href: "/marketing/campaigns",
            match: (p) => p.startsWith("/marketing/campaigns"),
            subs: [
              { label: "Overview", href: "/marketing/campaigns", match: exact("/marketing/campaigns") },
              { label: "All campaigns", href: "/marketing/campaigns/list" },
              { label: "Order sources", href: "/marketing/campaigns/sources" },
            ],
          },
          {
            label: "Offers & Promotions", href: "/marketing/offers",
            match: (p) => p.startsWith("/marketing/offers"),
            subs: [
              { label: "Overview", href: "/marketing/offers", match: (p) => p === "/marketing/offers" || p.startsWith("/marketing/offers/perf") },
              { label: "Offers", href: "/marketing/offers/list", match: (p) => p.startsWith("/marketing/offers/list") || (/^\/marketing\/offers\/[^/]+$/.test(p) && !["/marketing/offers/coupons", "/marketing/offers/templates", "/marketing/offers/settings", "/marketing/offers/approvals"].includes(p)) },
              { label: "Coupons", href: "/marketing/offers/coupons" },
              { label: "Templates", href: "/marketing/offers/templates" },
              { label: "Approvals", href: "/marketing/offers/approvals" },
              { label: "Settings", href: "/marketing/offers/settings" },
            ],
          },
          {
            label: "Affiliates & Partners", href: "/marketing/affiliates",
            match: (p) => p.startsWith("/marketing/affiliates"),
            subs: [
              { label: "Overview", href: "/marketing/affiliates", match: exact("/marketing/affiliates") },
              { label: "All affiliates", href: "/marketing/affiliates/list" },
              { label: "Commission ledger", href: "/marketing/affiliates/commissions" },
              { label: "Payouts", href: "/marketing/affiliates/payouts" },
            ],
          },
          {
            label: "Occasions & Outreach", href: "/marketing/occasions",
            match: (p) => p.startsWith("/marketing/occasions") || p.startsWith("/marketing/outreach"),
            subs: [
              { label: "Occasions due", href: "/marketing/occasions" },
              { label: "Contact history", href: "/marketing/outreach", match: exact("/marketing/outreach") },
              { label: "Do not contact", href: "/marketing/outreach/optouts" },
            ],
          },
          {
            // MKT-D18 — messages, lists and a queue. No API needed; when one
            // is verified, "send them all" joins the same screen.
            label: "WhatsApp", href: "/marketing/whatsapp",
            match: (p) => p.startsWith("/marketing/whatsapp"),
          },
          {
            // MKT-D19 — provider-agnostic; nothing sends without a key.
            label: "Email & SMS", href: "/marketing/messaging",
            match: (p) => p.startsWith("/marketing/messaging"),
          },
          {
            // DEC-WA-002…008 — পেমেন্ট ফেল আর অসমাপ্ত checkout। Marketing-এ
            // রাখা হলো কারণ এটা ফেরানোর কাজ, বিক্রির হিসাব নয় — আর
            // checkout_abandoned template Meta-র চোখে Marketing।
            label: "Recover lost orders", href: "/marketing/recovery",
            match: (p) => p.startsWith("/marketing/recovery"),
          },
          {
            // MKT-D16 — a customer brings a friend. Points one way, a discount
            // the other, and the one points ledger Loyalty now shares.
            label: "Referral", href: "/marketing/referral",
            match: (p) => p.startsWith("/marketing/referral"),
          },
          {
            // MKT-D21 — points on ordinary purchases. Same ledger as Referral,
            // so a customer sees one balance and not two arguing ones.
            label: "Loyalty points", href: "/marketing/loyalty",
            match: (p) => p.startsWith("/marketing/loyalty"),
          },
          {
            // MKT-D20 — what Meta charged and what it bought. The one marketing
            // screen that is fully useful today: the ads are already running.
            label: "Ad numbers", href: "/marketing/ads",
            match: (p) => p.startsWith("/marketing/ads"),
          },
          {
            // Every pixel and tag id, pasted once (MKT-D15).
            label: "Tracking codes", href: "/marketing/tracking",
          },
          {
            // What Google and Facebook see. Being found is marketing.
            label: "SEO", href: "/marketing/seo",
            match: (p) => p.startsWith("/marketing/seo"),
            subs: [
              { label: "Where we stand", href: "/marketing/seo", match: exact("/marketing/seo") },
              { label: "Pages", href: "/marketing/seo?tab=pages" },
              { label: "Old links", href: "/marketing/seo?tab=redirects" },
              { label: "Site-wide", href: "/marketing/seo?tab=settings" },
            ],
          },
          { label: "Settings", href: "/marketing/settings" },
        ],
      },
      {
        label: "Customers", href: "/customers", icon: "heart",
        subs: [
          { label: "Overview", href: "/customers", match: exact("/customers") },
          { label: "All customers", href: "/customers/list" },
          { label: "Segments", href: "/customers/segments" },
          { label: "Risk & blocklist", href: "/customers/risk" },
          { label: "Consent", href: "/customers/consent" },
          { label: "Duplicates & merge", href: "/customers/duplicates" },
          { label: "Occasions", href: "/customers/occasions" },
        ],
      },
    ],
  },
  {
    title: "Setup", accent: "#b9aecf", emblem: "gear",
    items: [
      /*  Delivery's SETUP half — the other end of the split described in
          Internal. Riders stay here rather than in People because adding a
          rider is a delivery capability, not a person you have a relationship
          with; couriers left this menu on 12 Aug 2026 and are added in
          Administration → Courier & delivery, keys and all.

          ⚠️ href-less parent, same reason as Delivery's work half: /delivery
          belongs to the fulfilment board's key.  */
      {
        label: "Delivery setup", icon: "truck",
        subs: [
          { label: "Methods & slots", href: "/delivery/zones" },
          { label: "Riders", href: "/delivery/riders" },
          { label: "Setup", href: "/delivery/setup" },
        ],
      },
      /*  Returns' setup half (DEC-RTN-016) — reasons, approval rules and
          default refund methods. Written once, then left alone for months,
          which is why it no longer sits in the menu people open to handle
          today's return.  */
      { label: "Returns settings", href: "/returns/settings", icon: "gear" },
      // Employee / HR (RADIAN_HR_MODULE_ARCHITECTURE.md, 28 Jul). Finance
      // references it, never owns it. What a person is paid is a money fact,
      // so MANAGER and up; the personal columns are stripped server-side for
      // anyone but the OWNER.
      // ⚠️ /employees/[id] is dynamic — new / attendance / payroll are reserved.
      {
        label: "Staff", href: "/employees", icon: "user",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "All staff", href: "/employees", match: exact("/employees") },
          { label: "New employee", href: "/employees/new" },
          { label: "Job roles", href: "/employees/roles" },
          { label: "Attendance", href: "/employees/attendance" },
          { label: "Payroll", href: "/employees/payroll", match: (p) => p.startsWith("/employees/payroll") },
          { label: "Removed staff", href: "/employees/trash" },
        ],
      },
      /*  ADMINISTRATION (30 Jul 2026) — RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md
          Replaces the old "Settings" entry, which had NO href at all: a menu row
          that did nothing when clicked, sitting there since the first build.

          The module is OWNER-only as a whole, and that is deliberate rather than
          careless: the screen that hands out access also hands out the power to
          hand out access. "My password & PIN" is the one thing everybody needs,
          so it stays outside as its own row.

          ⚠️ These sub-entries are the LAST hand-written roles in this file. Once
          §7 stage 3 lands, the sidebar draws itself from GET /administration/menu
          and this array stops deciding anything. Until then, adding a screen here
          means regenerating apps/api/src/administration/registry.def.ts — the two
          lists disagreeing is the exact bug this module was built to end. */
      {
        label: "Administration", href: "/administration", icon: "shield", roles: ["OWNER"],
        subs: [
          { label: "Overview", href: "/administration", match: exact("/administration") },
          { label: "Access control", href: "/administration/access" },
          /*  These two point at the screens that ALREADY work rather than at
              new stubs. Moving a working screen behind a placeholder because
              the menu was being tidied would be a step backwards dressed up as
              progress. They move to /administration/* when there is something
              better to move them to.  */
          { label: "People & accounts", href: "/settings/people" },
          { label: "Activity & sessions", href: "/settings/audit" },
          { label: "Company settings", href: "/administration/company" },
          { label: "All settings", href: "/administration/settings" },
          { label: "Backup & restore", href: "/administration/backup" },
          /*  ADM-D09 — EVERY outside service lives here, on the owner's
              instruction (30 Jul): Facebook, WhatsApp, Google, Meta, all of it.
              Grouped rather than one flat list, and payment sits at the top
              deliberately — a flat list makes "this one moves money" and "this
              one counts page views" look like the same kind of setting.

              What is NOT here is the CONTENT that travels over these
              connections: the WhatsApp wording stays in Marketing, the SEO
              titles in SEO. That line is what stops a key having two homes.  */
          {
            label: "Integrations & keys", href: "/administration/integrations",
            subs: [
              { label: "All keys", href: "/administration/integrations", match: exact("/administration/integrations") },
              { label: "Payment gateways", href: "/administration/integrations/payment" },
              { label: "Courier & delivery", href: "/administration/integrations/courier" },
              { label: "Messaging", href: "/administration/integrations/messaging" },
              { label: "Social & ads", href: "/administration/integrations/social" },
              { label: "Tracking & analytics", href: "/administration/integrations/analytics" },
            ],
          },
        ],
      },
      // SEO moved into the Marketing group (owner, 28 Jul 2026) — being found
      // is marketing, not a system setting. /settings/seo is now a redirect.
      { label: "My password & PIN", href: "/settings/me", icon: "lock" },
    ],
  },
];

/*  ADM-RULE-001 — the key a nav entry has in the registry.

    This MUST match the generator that produced registry.def.ts from this very
    file, character for character, or the sidebar asks about a screen the server
    has never heard of and the row silently disappears. Which is the exact class
    of bug this whole module exists to end, so it is worth being boring about:

      /finance/pnl          -> finance.pnl
      module with no href   -> slug of its label
      a sub with the SAME href as its parent (the "Overview" row)
                            -> <parentKey>.overview
      a sub pointing at ANOTHER module (Orders -> /returns)
                            -> that module's own key, which resolves correctly
      /returns?channel=online -> returns    (the ? and everything after is DROPPED)

    THAT LAST LINE IS NEW (17 Aug 2026) and matters. Rows now exist that point
    at the same screen with a filter on it: Returns has a website door and a
    counter door (DEC-RTN-016), SEO has four tabs. A query string is not a
    different screen, so it must not become a different access key — otherwise
    Access control would have to tick "returns" four times, and a key nobody
    ever created falls through to VISIBLE, which quietly hands a filtered view
    to somebody who was denied the module itself. Strip the query, and every
    door inherits the one tick the module already has.  */
const slugOf = (href: string) =>
  href.split("?")[0].replace(/^\//, "").replace(/\//g, ".") || "root";
const moduleKey = (it: Item) =>
  it.href ? slugOf(it.href) : it.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
/*  Compare hrefs with their query stripped too — "/returns" and
    "/returns?channel=online" are the same screen, so the parent's row IS the
    overview row.  */
const subKey = (sb: Sub, parentKey: string, parentHref?: string) =>
  parentHref && sb.href.split("?")[0] === parentHref.split("?")[0]
    ? `${parentKey}.overview`
    : slugOf(sb.href);

/*  ROUTE GATE LOOKUP (19 Aug 2026) — which registry key answers for a path.

    The sidebar hides rows, but a pasted URL used to render the whole screen
    with every fetch failing 403 underneath (owner found it testing rajib).
    AccessGate in the layout asks THIS function the same question the sidebar
    asks, built from the SAME lists, so the two can never disagree. Exact row
    match wins (longest href first); otherwise the deepest row whose href is
    a prefix — a detail page is judged as its module, exactly like the API
    guard judges /orders/RAD-1 as "orders". No row at all returns null and
    the page is left to the server, which still refuses the data.  */
export function nodeForPath(path: string): { key: string; roles?: Role[] } | null {
  const p = path.split("?")[0].replace(/\/+$/, "") || "/";
  type Hit = { base: string; key: string; roles?: Role[]; exact: boolean };
  const hits: Hit[] = [];
  const addSub = (sb: Sub, parentKey: string, parentHref: string | undefined, roles?: Role[]) => {
    const base = sb.href.split("?")[0];
    const key = subKey(sb, parentKey, parentHref);
    const r = sb.roles ?? roles;
    if (sb.match?.(p) || base === p) hits.push({ base, key, roles: r, exact: true });
    else if (p.startsWith(base + "/")) hits.push({ base, key: parentKey, roles: r, exact: false });
    sb.subs?.forEach((x) => addSub(x, parentKey, parentHref, r));
  };
  for (const g of GROUPS) {
    for (const it of g.items) {
      const mk = moduleKey(it);
      if (it.href) {
        const base = it.href.split("?")[0];
        if (base === p) hits.push({ base, key: mk, roles: it.roles, exact: true });
        else if (p.startsWith(base + "/")) hits.push({ base, key: mk, roles: it.roles, exact: false });
      }
      it.subs?.forEach((sb) => addSub(sb, mk, it.href, it.roles));
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => (Number(b.exact) - Number(a.exact)) || (b.base.length - a.base.length));
  return { key: hits[0].key, roles: hits[0].roles };
}

export default function AdminSidebar() {
  const { me, signOut } = useAuth();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  /*  THE ONE LIST, finally read (ADM-RULE-001).

      Until now this file decided visibility from its own roles: arrays — a
      second list answering the same question as the API's @Roles, with nobody
      reconciling them. That is how the entire Intelligence module vanished for
      STAFF for weeks while the API was serving it happily and no error was
      raised anywhere.

      Now the server answers, from Access control. `null` means the answer has
      not arrived (or could not be fetched) and the OLD role filter is used
      instead — deliberately, because a sidebar that empties itself when the
      network hiccups is worse than one that is briefly out of date. It fails
      to the previous behaviour, never to a blank screen.  */
  const [access, setAccess] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    if (!me) { setAccess(null); return; }
    let alive = true;
    getMyAccess()
      /*  An EMPTY object is not an answer — the server returns one when it
          cannot find the user at all, and treating it as "nothing is mentioned,
          so show everything" would open the whole panel on a lookup failure.
          Empty is treated exactly like a failed fetch: fall back to the old
          role filter.  */
      .then((a) => { if (alive) setAccess(a && Object.keys(a).length ? a : null); })
      .catch(() => { if (alive) setAccess(null); });
    return () => { alive = false; };
  }, [me]);

  const visibleGroups = useMemo(() => {
    const role = (me?.role ?? "STAFF") as Role;

    /*  One predicate, two sources. A key the server did not mention falls back
        to the hand-written roles arrays — NEVER to blanket-visible. The old
        "unknown key = show it" rule opened Administration to a template-less
        account on 18 Aug (the rajib incident): Administration is deliberately
        outside the registry, so its key is never in the map, and the fallback
        showed it to everyone. Undecided-but-registered screens are still
        surfaced on the Access screen, where acting on them is possible.  */
    const allowed = (key: string, legacy?: Role[]) =>
      access
        ? (key in access ? access[key] : !legacy || legacy.includes(role))
        : !legacy || legacy.includes(role);

    return GROUPS
      .map((g) => ({
        ...g,
        items: g.items
          .filter((it) => allowed(moduleKey(it), it.roles))
          /*  Sub-entries are gated too. Intelligence is the reason: the
              Executive Dashboard is open to STAFF on purpose (DEC-INT-005 —
              the Today list is their own work), while Analytics, Reports and
              Targets are money-shaped and are not. Gating the whole module hid
              the dashboard from the very people it was written for. */
          .map((it) =>
            it.subs
              ? {
                  ...it,
                  subs: it.subs
                    .filter((sb) => allowed(subKey(sb, moduleKey(it), it.href), sb.roles))
                    .map((sb) =>
                      sb.subs
                        ? {
                            ...sb,
                            subs: sb.subs.filter((deep) =>
                              allowed(subKey(deep, subKey(sb, moduleKey(it), it.href), sb.href), deep.roles),
                            ),
                          }
                        : sb,
                    ),
                }
              : it,
          )
          // a module whose every screen is closed is a door onto a wall
          .filter((it) => !it.subs || it.subs.length > 0 || !!it.href),
      }))
      .filter((g) => g.items.length > 0);
  }, [me?.role, me, access]);

  /*  Which DEPARTMENT is open (owner, 18 Aug 2026, refined same day).

      An accordion, exactly like the modules inside it: opening one department
      closes the others, and clicking the open one closes it too — nothing is
      pinned open, not even the department you are standing in. Six coloured
      headers are calm; twenty-five rows are not.

      Stored in localStorage so the panel opens the way it was left. Restoring
      the window does NOT re-open anything (the pathname guard below) — only a
      real click or a real navigation moves this.  */
  const OPEN_KEY = "radian.nav.openGroup";
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(OPEN_KEY);
      setOpenGroup(saved !== null ? (saved === "" ? null : saved) : "Today's work");
    } catch { /* unreadable preference = the default */ }
  }, []);
  const setOpenGroupSticky = (title: string | null) => {
    setOpenGroup(title);
    try { window.localStorage.setItem(OPEN_KEY, title ?? ""); } catch { /* ignore */ }
  };
  const toggleGroup = (title: string) =>
    setOpenGroupSticky(openGroup === title ? null : title);

  // Arriving in a module opens exactly its branch and folds everything else.
  // Three levels now, so landing on /marketing/affiliates/payouts has to open
  // BOTH "Marketing & Growth" and "Affiliates & Partners" — otherwise the page
  // you are standing on is not visible anywhere in the nav.
  //
  //  ⚠️ GUARDED BY REAL NAVIGATION (owner, 18 Aug 2026). This used to depend on
  //  [pathname, visibleGroups] — and visibleGroups is rebuilt whenever access
  //  refreshes, which happens on window focus. So minimising the browser and
  //  coming back re-opened every branch the user had deliberately closed.
  //  Now it fires only when the PATH actually changes: a click that goes
  //  somewhere. Closing a menu and staying put stays closed.
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (lastPath.current === pathname) return; // focus/refresh, not navigation
    lastPath.current = pathname;

    const active = pickActive(visibleGroups.flatMap((g) => g.items), pathname);
    if (!active) return;

    /*  Real navigation into a folded department unfolds it (accordion), or the
        page you land on would be invisible in the nav.  */
    const holder = visibleGroups.find((g) => g.items.includes(active));
    if (holder && openGroup !== holder.title) setOpenGroupSticky(holder.title);

    if (!active.subs) return;
    const keys = [active.label];
    const activeSub = active.subs.find(
      (s) => s.subs && (s.match ? s.match(pathname) : pathname === s.href || pathname.startsWith(s.href + "/")),
    );
    if (activeSub) keys.push(`${active.label}::${activeSub.label}`);

    // REPLACE, not merge — arriving somewhere folds every other branch away,
    // so the sidebar always shows one open path: the one you are standing on.
    setExpanded((prev) => {
      if (prev.size === keys.length && keys.every((k) => prev.has(k))) return prev;
      return new Set(keys);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, visibleGroups]);

  /*  Accordion — one open at a time (sobuj, 28 Jul: "je module click krbo seta
      on hobe onno ta auto off hoye jabe").

      Before this, opening a second module left the first one open, and after a
      few clicks the sidebar was a wall of links with no shape to it. Now:

        · opening a module closes every other module
        · opening a sub-module closes its siblings, but leaves its parent open
          — a child cannot be visible with its parent shut

      Keys are "Module" for level 2 and "Module::Sub-module" for level 3, so a
      sibling is simply anything sharing the same prefix. */
  const toggle = (key: string) =>
    setExpanded((prev) => {
      if (prev.has(key)) {
        // closing: this one and anything nested inside it
        const n = new Set<string>();
        for (const k of prev) if (k !== key && !k.startsWith(`${key}::`)) n.add(k);
        return n;
      }
      const parent = key.includes("::") ? key.slice(0, key.lastIndexOf("::")) : null;
      // keep only this branch's ancestors — every other branch folds away
      const n = new Set<string>();
      if (parent) {
        for (const k of prev) if (k === parent || parent.startsWith(`${k}::`)) n.add(k);
      }
      n.add(key);
      return n;
    });

  /*  The invite / reset link pages are reached with no session at all, so there
      is no nav to draw — and drawing one from a null user would show the STAFF
      menu to somebody who has not signed in yet.  */
  if (NO_SESSION_PATHS.some((p) => pathname.startsWith(p))) return null;

  //  The single module the current path belongs to — used to highlight one row.
  const activeItem = pickActive(visibleGroups.flatMap((g) => g.items), pathname);

  return (
    <aside className="w-[250px] shrink-0 text-white px-3 py-5 sticky top-0 h-screen hidden md:flex md:flex-col overflow-y-auto border-r border-white/[0.06]"
      style={{ background: "linear-gradient(176deg,#2b0e40 0%,#38124f 46%,#2a0d3e 100%)" }}>
      <div className="flex items-center gap-3 px-2 pb-4">
        <div className="w-[36px] h-[36px] rounded-[50%_50%_50%_0] -rotate-45 shrink-0"
          style={{ background: "linear-gradient(150deg,#cf43ea,#b76e79)", boxShadow: "0 0 18px rgba(207,67,234,0.45)" }} />
        <div>
          <b className="font-display text-[20px] text-white font-semibold block leading-none tracking-[0.01em]">Radian</b>
          <small className="text-[#d9c2ec] text-[10.5px] font-semibold tracking-[0.16em] uppercase">Admin OS</small>
        </div>
      </div>

      {/*  6 Aug 2026 — owner: one click from anywhere in the admin into the
          live shop. WEB_BASE, never a hardcoded domain, so it opens whichever
          storefront this environment actually serves (demo today, radianbd.com
          after cutover).  */}
      <a
        href={WEB_BASE}
        target="_blank"
        rel="noreferrer"
        className="mx-1 mb-4 flex items-center justify-center gap-2 rounded-[12px] border border-white/[0.14] bg-white/[0.07] hover:bg-white/[0.14] text-white text-[13px] font-semibold py-2.5 transition-colors backdrop-blur"
      >
        ↗ View website
      </a>

      <nav className="text-[15px]">
        {visibleGroups.map((g) => {
          const shut = openGroup !== g.title;
          const holdsActive = !!activeItem && g.items.includes(activeItem);
          return (
          <div key={g.title} className="mb-1.5">
            {/*  Department header — its colour, its icon, and the whole row is
                the fold control. An accordion: opening one closes the rest,
                and even the department you are standing in may be closed
                (owner, 18 Aug). A closed department holding the current page
                keeps a small dot so "where am I" is never lost.  */}
            <button
              type="button"
              onClick={() => toggleGroup(g.title)}
              aria-expanded={!shut}
              className={"w-full flex items-center gap-2.5 px-2 py-2 rounded-[12px] transition-colors " +
                (shut ? "hover:bg-white/[0.06]" : "")}
              style={shut ? undefined : { background: `${g.accent}14` }}
            >
              <span
                className="w-[27px] h-[27px] rounded-[9px] grid place-items-center shrink-0"
                style={{ background: `${g.accent}26`, color: g.accent, boxShadow: shut ? undefined : `0 0 12px ${g.accent}33` }}
              >
                <Icon name={g.emblem} size={15} strokeWidth={2.4} />
              </span>
              <span
                className="text-[11.5px] font-extrabold tracking-[0.14em] uppercase flex-1 text-left"
                style={{ color: shut ? `${g.accent}cc` : g.accent }}
              >
                {g.title}
              </span>
              {shut && holdsActive && (
                <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: g.accent }} />
              )}
              {shut && !holdsActive && (
                <span className="text-[10.5px] font-bold text-white/35 tabular-nums">{g.items.length}</span>
              )}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                className={"shrink-0 transition-transform duration-200 " + (shut ? "opacity-40" : "rotate-90 opacity-70")}
                style={{ color: g.accent }}>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
            {!shut && (
            <div className="mt-1 ml-[13px] pl-[10px] border-l-2" style={{ borderColor: `${g.accent}40` }}>
            {g.items.map((it) => {
              /*  Exactly ONE module highlights — the one the path really belongs
                  to. A sub match wins over a bare href prefix, so /products/variants
                  lights Catalog, not Products (see pickActive). 6 Aug 2026.  */
              const parentActive = it === activeItem;
              const open = expanded.has(it.label);
              const rowCls =
                "w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-[11px] mb-0.5 font-medium transition-all text-left " +
                (parentActive
                  ? "text-white font-semibold"
                  : "text-white/[0.92] hover:bg-white/[0.09]");
              const rowStyle = parentActive
                ? { background: `linear-gradient(135deg, ${g.accent}52, #8A2BB066)`, boxShadow: `inset 0 0 0 1px ${g.accent}55` }
                : undefined;
              const label = (
                <>
                  <span className="w-[20px] grid place-items-center shrink-0"
                    style={{ color: parentActive ? "#fff" : `${g.accent}e6` }}>
                    <Icon name={it.icon} size={17} strokeWidth={2.1} />
                  </span>
                  <span className="flex-1 min-w-0 truncate text-[14.5px]">{it.label}</span>
                </>
              );
              const chevron = (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                  strokeLinecap="round" strokeLinejoin="round"
                  className={"shrink-0 opacity-70 transition-transform duration-200 " + (open ? "rotate-90" : "")}>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              );

              return (
                <div key={it.label}>
                  {/* THE WHOLE ROW is the control (sobuj, 21 Jul: "module a click krlei
                      sub module on hobe, abar click krle off"). Clicking a module with a
                      sub-menu opens it AND goes to the module; clicking it again just
                      closes the menu and leaves you where you are. The tiny arrow was a
                      needlessly small target. */}
                  {it.subs ? (
                    <button
                      type="button"
                      onClick={() => {
                        const wasOpen = expanded.has(it.label);
                        toggle(it.label);
                        if (!wasOpen && it.href) router.push(it.href);
                      }}
                      aria-expanded={open}
                      className={rowCls}
                      style={rowStyle}
                    >
                      {label}
                      {chevron}
                    </button>
                  ) : it.href ? (
                    <Link href={it.href} className={rowCls} style={rowStyle}>{label}</Link>
                  ) : (
                    <span className={rowCls + " opacity-60 cursor-default"} title="Coming soon">{label}</span>
                  )}
                  {it.subs && open && (
                    <div className="ml-[30px] mb-1.5 border-l-2 border-white/15 pl-2.5">
                      {it.subs.map((s) => {
                        const on = s.match ? s.match(pathname) : pathname === s.href || pathname.startsWith(s.href + "/");
                        const subCls =
                          "block px-3 py-2 rounded-[8px] mb-0.5 text-[14px] transition-colors " +
                          (on ? "text-white font-semibold bg-white/[0.16]" : "text-white/[0.82] font-medium hover:text-white hover:bg-white/[0.09]");

                        /* A sub-module — its own screens hang off it. Same rule as
                           the module row above: the whole row is the control, one
                           click opens it AND goes there, a second click closes it. */
                        if (s.subs) {
                          const key = `${it.label}::${s.label}`;
                          const subOpen = expanded.has(key);
                          return (
                            <div key={s.href}>
                              <button
                                type="button"
                                onClick={() => {
                                  const wasOpen = expanded.has(key);
                                  toggle(key);
                                  if (!wasOpen) router.push(s.href);
                                }}
                                aria-expanded={subOpen}
                                className={subCls + " w-full text-left flex items-center gap-2"}
                              >
                                <span className="flex-1 min-w-0 truncate">{s.label}</span>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
                                  strokeLinecap="round" strokeLinejoin="round"
                                  className={"shrink-0 opacity-70 transition-transform duration-200 " + (subOpen ? "rotate-90" : "")}>
                                  <path d="M9 6l6 6-6 6" />
                                </svg>
                              </button>
                              {subOpen && (
                                <div className="ml-[10px] mb-1 border-l-2 border-white/10 pl-2.5">
                                  {s.subs.map((t) => {
                                    const tOn = t.match ? t.match(pathname) : pathname === t.href || pathname.startsWith(t.href + "/");
                                    return (
                                      <Link key={t.href} href={t.href}
                                        className={"block px-3 py-1.5 rounded-[8px] mb-0.5 text-[13px] transition-colors " +
                                          (tOn ? "text-white font-semibold bg-white/[0.14]" : "text-white/[0.72] hover:text-white hover:bg-white/[0.08]")}>
                                        {t.label}
                                      </Link>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        }

                        return (
                          <Link key={s.href} href={s.href} className={subCls}>
                            {s.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
            )}
          </div>
          );
        })}
      </nav>

      {/* who is at the keyboard — the name the ledger will record (DEC-FIN-028) */}
      <div className="mt-auto px-2 pt-3">
        {me && (
          <div className="flex items-center gap-2.5 px-2 py-2.5 rounded-xl mb-2" style={{ background: "rgba(255,255,255,0.07)" }}>
            <div className="w-8 h-8 rounded-full grid place-items-center text-[13px] font-bold text-white shrink-0"
              style={{ background: "linear-gradient(135deg,#a021b8,#d98cb3)" }}>
              {me.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold text-white truncate">{me.name}</div>
              <div className="text-[10.5px] text-[#d9c2ec] uppercase tracking-[0.06em]">{me.role.toLowerCase()}</div>
            </div>
            {/*  System notices live behind this bell, beside the name — never
                as banners on top of working pages (owner, 18 Aug 2026).  */}
            <NotificationsBell />
            <button onClick={signOut} title="Sign out"
              className="text-[11px] font-bold text-[#d9c2ec] hover:text-white px-2 py-1 rounded-lg">
              exit
            </button>
          </div>
        )}
        <div className="text-[11px] text-[#9977b0]">Radian Admin OS</div>
      </div>
    </aside>
  );
}
