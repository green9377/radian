"use client";

import { useEffect, useMemo, useState } from "react";
import { NO_SESSION_PATHS, useAuth } from "./AuthGate";
import { getMyAccess } from "../_data/api";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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
type Role = "OWNER" | "MANAGER" | "STAFF";
type Item = { label: string; href?: string; icon: string; subs?: Sub[]; roles?: Role[] };
type Group = { title: string; items: Item[] };

const exact = (h: string) => (p: string) => p === h;

const GROUPS: Group[] = [
  {
    title: "Master Data",
    items: [
      {
        label: "Products", href: "/products", icon: "❀",
        subs: [
          { label: "Overview", href: "/products", match: exact("/products") },
          { label: "All products", href: "/products/list" },
          { label: "Stock", href: "/products/stock" },
          /*  How much can be MADE in a day, as against how much is on the
              shelf — a different question, so a different screen, next to the
              one it is most often confused with.  */
          { label: "Daily capacity", href: "/products/capacity" },
          { label: "Margin", href: "/products/margin" },
          { label: "Health", href: "/products/health" },
          { label: "Catalog funnel", href: "/products/funnel" },
          { label: "Variants & options", href: "/products/variants" },
          { label: "Add-ons", href: "/products/addons" },
          { label: "Upgrades", href: "/products/upgrades" },
          { label: "Bulk actions", href: "/products/bulk" },
          { label: "Trash", href: "/products/trash" },
        ],
      },
      // Items = the physical master behind every Product (RADIAN_ITEM_MODULE_ARCHITECTURE.md).
      // Sits directly under Products because that is the pair people think in.
      // ⚠️ /items/[id] is dynamic — the static names below can never be item ids.
      // Everything the Item module needs lives INSIDE it (owner, 21 Jul): its own
      // category tree, its own colour/size master, and Units.
      {
        label: "Items", href: "/items", icon: "◈",
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
          { label: "Units", href: "/items/units" },
          { label: "Trash", href: "/items/trash" },
        ],
      },
      { label: "Categories", href: "/categories", icon: "▦" },
      { label: "Occasions & Tags", href: "/tags", icon: "☰" },
      { label: "Brands", href: "/brands", icon: "✦" },
      // Units lives under Items' sub-menu (owner's call, 21 Jul) — units exist to serve
      // items, so that is where people look for them. No top-level entry, or it appears twice.
      {
        label: "Customers", href: "/customers", icon: "◉",
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
      // Suppliers = everyone Radian pays (RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md, 23 Jul).
      // Master data, same rank as Customers — Purchase only references it (DEC-SUP-001).
      // ⚠️ /suppliers/[id] is dynamic — list/new/settings are reserved static names.
      {
        label: "Suppliers", href: "/suppliers", icon: "⛟",
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
      // Employee / HR (RADIAN_HR_MODULE_ARCHITECTURE.md, 28 Jul). Master Data,
      // same rank as Customers and Suppliers — Finance references it, never owns
      // it. What a person is paid is a money fact, so MANAGER and up; the
      // personal columns are stripped server-side for anyone but the OWNER.
      // ⚠️ /employees/[id] is dynamic — new / attendance / payroll are reserved.
      {
        label: "Staff", href: "/employees", icon: "👥",
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
    ],
  },
  {
    title: "Commerce",
    items: [
      // Inbox = সব channel-এর গ্রাহক-chat এক পর্দায় (RADIAN_INBOX_MODULE_ARCHITECTURE.md)
      { label: "Inbox", href: "/inbox", icon: "💬" },
      {
        label: "Orders", href: "/orders", icon: "🛍",
        subs: [
          { label: "Overview", href: "/orders", match: exact("/orders") },
          { label: "All orders", href: "/orders/list" },
          { label: "Needs action", href: "/orders/action" },
          { label: "Payments", href: "/orders/payments" },
          // where an order came in through (DEC-SAL-001). The API has existed
          // since Sales; there was never a screen, which is why foodpanda and
          // Sugary had nowhere to be recorded.
          { label: "Sales channels", href: "/orders/channels" },
          { label: "Returns", href: "/returns" }, // → Returns & Refunds module (DEC-RTN)
          { label: "Recovery", href: "/orders/recovery" },
          { label: "Scheduled", href: "/orders/scheduled" },
          { label: "Cancelled", href: "/orders/cancelled" },
          { label: "Reports", href: "/orders/reports" },
        ],
      },
      // POS = the physical-store counter (RADIAN_POS_MODULE_ARCHITECTURE.md, 23 Jul).
      // Separate module, but a completed sale lands in the unified Order ledger
      // (channel=POS, DEC-POS-001). Sell screen first; the rest grow in as built.
      // ⚠️ /pos/[static] only — no dynamic segment yet. /pos = Overview.
      {
        label: "POS", href: "/pos", icon: "🧾",
        subs: [
          { label: "Overview", href: "/pos", match: exact("/pos") },
          { label: "Sell (counter)", href: "/pos/sell" },
          { label: "Today / Shift", href: "/pos/shift" },
          { label: "Sales history", href: "/pos/sales" },
          { label: "Day-close", href: "/pos/day-close" },
          { label: "Due board", href: "/pos/due" },
          { label: "Settings", href: "/pos/settings" },
        ],
      },
      // Returns & Refunds = post-delivery grievance → resolution
      // (RADIAN_RETURNS_MODULE_ARCHITECTURE.md, 23 Jul, DEC-RTN-005..015).
      // Staff-initiated only; refund ≤ collected; restock via Inventory.
      // ⚠️ /returns/[id] is dynamic — new/settings are reserved static names.
      {
        label: "Returns & Refunds", href: "/returns", icon: "↩",
        subs: [
          { label: "Overview", href: "/returns", match: exact("/returns") },
          { label: "New return", href: "/returns/new" },
          { label: "Reasons & settings", href: "/returns/settings" },
        ],
      },
      // Purchases = the buying book (RADIAN_PURCHASE_MODULE_ARCHITECTURE.md, 22 Jul).
      // One entity, two doors: quick market entry + advance orders (DEC-PUR-001).
      // Requisition/Order screens arrive with the first branch — deliberately absent.
      // ⚠️ /purchases/[id] is dynamic — list/new/returns are reserved static names.
      {
        label: "Purchases", href: "/purchases", icon: "🧺",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "Overview", href: "/purchases", match: exact("/purchases") },
          { label: "All purchases", href: "/purchases/list" },
          { label: "New purchase", href: "/purchases/new" },
          { label: "Returns", href: "/purchases/returns" },
          { label: "Reports", href: "/purchases/reports" },
        ],
      },
      // Offers & Promotions moved to the Marketing group (owner's call, 28 Jul
      // 2026). The Offers module still owns the Offer entity — only its place
      // in the panel changed. See the Marketing group below.
    ],
  },
  {
    // The shop's own front window — what a visitor lands on, as opposed to
    // Marketing, which owns what gets sent out. Added 30 Jul 2026 with Banners;
    // sections, collections, reviews, content and the footer join it as the
    // homepage audit works through them.
    title: "Storefront",
    items: [
      /*
        ONE MODULE, SUB-MODULES INSIDE IT — owner, 31 Jul 2026.

        This was ten flat entries: Homepage layout, Category pages, Banners,
        Trust strip, Section headings, Collections, Visit the shop, Reviews,
        Journal, Footer. Ten siblings with no shape, growing by one every time
        a page got connected, and nothing to tell him which he wanted.

        Same three-deep arrangement Marketing already uses, and the grouping is
        by the job in hand rather than by table:

          Pages        — how a page is arranged, top to bottom
          Blocks       — the pieces that get PLACED on those pages
          Words        — what the shop says, and what customers say back
          Shop details — facts about the business, shown on every page

        "Where do I change the banner on the flowers page" is a Pages question,
        even though a banner is a Block. Sorted by where he would look.
      */
      /*
        ⚠️ ONE LEVEL, NOT TWO — and this is the second correction, so it is
        worth writing down properly.

        First it was ten entries sitting at the top of the panel. The owner
        asked for one module with the rest inside it, so they were grouped into
        Pages / Blocks / Words / Shop details. That fixed the top of the panel
        and broke everything under it: reaching Banners went from one click to
        three, and every click needed a decision — "is a banner a Block or a
        Page?" — that only the person who invented the grouping could answer.

        The grouping still exists where it costs nothing: on the Overview
        screen, where all four are visible at once and nothing is hidden behind
        a word. In the nav, a plain list of eleven is easier than a tidy tree
        of four. Tidiness that costs clicks is not tidiness.

        Order is by how often it is used, then by what the page is made of —
        NOT alphabetical, which would put Banners above the pages they sit on.
      */
      {
        label: "Storefront", href: "/storefront", icon: "▤",
        subs: [
          { label: "Overview", href: "/storefront", match: exact("/storefront") },

          /*
            ── PAGES ────────────────────────────────────────────────────────
            Everything a page needs is now INSIDE the page — owner, 31 Jul.

            Banners, the trust strip, the budget cards and every section's
            wording used to be four more rows here. They belong to the
            homepage and to nothing else, so they are edited inside the
            homepage: open a section, and its editor is right there. The
            standalone screens still exist at their old addresses for anyone
            who arrives by link or bookmark; they are simply not a place he
            has to KNOW about any more.
          */
          { label: "Homepage", href: "/storefront/layout" },
          { label: "Category pages", href: "/storefront/category-page" },

          /*
            ── EVERY PAGE ───────────────────────────────────────────────────
            These four are not part of one page. Reviews, the shop card and
            the footer render at the bottom of EVERY page, and the journal is
            its own section of the site. Filing them inside the homepage would
            be filing them under one of the many pages they appear on.
          */
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
    ],
  },
  {
    title: "Operations",
    items: [
      // Inventory = stock's ONE owner (RADIAN_INVENTORY_MODULE_ARCHITECTURE.md, 22 Jul).
      // Immutable ledger + AVCO money. Opening/Transfer/Wastage/Stocktake screens
      // arrive in the next build steps — sidebar grows with them.
      {
        label: "Inventory", href: "/inventory", icon: "📦",
        subs: [
          { label: "Overview", href: "/inventory", match: exact("/inventory") },
          { label: "Stock board", href: "/inventory/stock" },
          { label: "Opening stock", href: "/inventory/opening" },
          { label: "Transfer", href: "/inventory/transfer" },
          { label: "Wastage & Gift", href: "/inventory/issue" },
          { label: "Stocktake", href: "/inventory/stocktake" },
          { label: "Movements", href: "/inventory/movements" },
          { label: "Reports", href: "/inventory/reports" },
          { label: "Settings", href: "/inventory/settings" },
        ],
      },
      // Assembly v2 (RADIAN_ASSEMBLY_MODULE_ARCHITECTURE.md, redesign 23 Jul):
      // Template (no stock touch) → Pipeline (components → Assembly floor) →
      // Finished goods → Transfer (owner picks the Item). Stock via Inventory only.
      {
        label: "Assembly", href: "/assembly", icon: "🛠",
        subs: [
          { label: "Overview", href: "/assembly", match: exact("/assembly") },
          { label: "Templates", href: "/assembly/templates" },
          { label: "Production pipeline", href: "/assembly/pipeline" },
          { label: "Finished goods", href: "/assembly/finished" },
          { label: "Wastage", href: "/assembly/wastage" },
          { label: "Settings", href: "/assembly/settings" },
        ],
      },
      {
        label: "Delivery", href: "/delivery", icon: "🚚",
        subs: [
          { label: "Fulfilment board", href: "/delivery", match: (p) => p === "/delivery" || p.startsWith("/delivery/board") },
          { label: "Riders", href: "/delivery/riders" },
          { label: "Couriers", href: "/delivery/couriers" },
          { label: "Methods & slots", href: "/delivery/zones" },
          { label: "Proof photos", href: "/delivery/proof" },
          { label: "Setup", href: "/delivery/setup" },
          { label: "Cost & performance", href: "/delivery/performance" },
        ],
      },
    ],
  },
  {
    /*  MARKETING & GROWTH — RADIAN_MARKETING_MODULE_ARCHITECTURE.md (28 Jul 2026).

        One module, four parts under it, and each part big enough to carry its
        own screens (owner's call, 28 Jul). So the group title is the module and
        every entry below is a sub-module with its own sub-menu — three levels,
        not two.

        Offers & Promotions MOVED here from the top level. Nothing about
        ownership changed: the Offer entity still belongs to the Offers module
        and Marketing never writes to it. It moved because to the person using
        the panel, a coupon IS marketing. Old /offers links still work — those
        routes are now redirects.

        MANAGER and up throughout: what was spent and what came back is a money
        question, and the occasion list is the customer book by another name.
        A payout is OWNER + PIN, enforced on the server — not by hiding a button.

        ⚠️ /marketing/campaigns/[id], /marketing/affiliates/[id],
           /marketing/offers/[id] are dynamic. Every static name at those levels
           (list · sources · commissions · payouts · coupons · templates ·
           approvals · settings · perf) is therefore RESERVED — an id can never
           be one of those words. */
    title: "Marketing & Growth",
    items: [
      {
        label: "Marketing & Growth", href: "/marketing", icon: "📣",
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
    ],
  },
  {
    title: "Finance",
    items: [
      {
        label: "Finance", href: "/finance", icon: "৳",
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
    ],
  },
  /*  INTELLIGENCE — RADIAN_INTELLIGENCE_MODULE_ARCHITECTURE.md (29 Jul 2026).
      ONE module with four sub-modules, exactly as the owner's own map has it.
      The Executive Dashboard is a SUB-MODULE, not a module of its own — an
      earlier pass got that wrong and it is worth not repeating.
      Open to everyone: STAFF is meant to see the Today section, because that is
      their own work. The server withholds cost, margin and cash per figure
      (DEC-INT-005) rather than closing the door, so there is no role gate here.
      Reports, KPIs and Forecast are not built yet and are therefore not listed —
      a nav entry that leads nowhere is a promise the panel cannot keep. */
  {
    title: "Intelligence",
    items: [
      {
        label: "Intelligence", href: "/intelligence", icon: "◎",
        /*  NO role gate on the module itself. DEC-INT-005 gives STAFF the
            Executive Dashboard deliberately — the Today list IS their work, and
            the server withholds cost and cash from it per figure rather than
            closing the door. An earlier pass put roles here and hid the whole
            module from staff, which quietly reversed a locked decision. */
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
    title: "System",
    items: [
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
        label: "Administration", href: "/administration", icon: "⚙", roles: ["OWNER"],
        subs: [
          { label: "Overview", href: "/administration", match: exact("/administration") },
          { label: "Access control", href: "/administration/access" },
          /*  These two point at the screens that ALREADY work rather than at
              new stubs. Moving a working screen behind a placeholder because
              the menu was being tidied would be a step backwards dressed up as
              progress. They move to /administration/* when there is something
              better to move them to.  */
          { label: "People & accounts", href: "/settings/people" },
          { label: "Activity & audit", href: "/settings/audit" },
          { label: "Company settings", href: "/administration/company" },
          { label: "All settings", href: "/administration/settings" },
          { label: "Backup & restore", href: "/administration/backup" },
          { label: "Signed in now", href: "/administration/sessions" },
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
      { label: "My password & PIN", href: "/settings/me", icon: "🔒" },
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
                            -> that module's own key, which resolves correctly  */
const slugOf = (href: string) => href.replace(/^\//, "").replace(/\//g, ".") || "root";
const moduleKey = (it: Item) =>
  it.href ? slugOf(it.href) : it.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const subKey = (sb: Sub, parentKey: string, parentHref?: string) =>
  sb.href === parentHref ? `${parentKey}.overview` : slugOf(sb.href);

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

    /*  One predicate, two sources. A key the server did not mention is treated
        as visible: that only happens for a nav row with no node yet, and hiding
        rows nobody has decided on would hide them silently — the thing ADM-D06
        exists to prevent. The Access screen shouts about undecided screens
        instead, where it can actually be acted on.  */
    const allowed = (key: string, legacy?: Role[]) =>
      access ? (key in access ? access[key] : true) : !legacy || legacy.includes(role);

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

  // Arriving in a module opens exactly its branch and folds everything else.
  // Three levels now, so landing on /marketing/affiliates/payouts has to open
  // BOTH "Marketing & Growth" and "Affiliates & Partners" — otherwise the page
  // you are standing on is not visible anywhere in the nav.
  useEffect(() => {
    const active = visibleGroups
      .flatMap((g) => g.items)
      .find((it) => it.href && (pathname === it.href || pathname.startsWith(it.href + "/")));
    if (!active?.subs) return;

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

  return (
    <aside className="w-[246px] shrink-0 bg-purple-deep text-white px-3 py-5 sticky top-0 h-screen hidden md:flex md:flex-col overflow-y-auto">
      <div className="flex items-center gap-2.5 px-2 pb-4">
        <div className="w-[34px] h-[34px] rounded-[50%_50%_50%_0] -rotate-45" style={{ background: "linear-gradient(150deg,#cf43ea,#b76e79)" }} />
        <div>
          <b className="font-display text-[19px] text-white font-semibold block leading-none">Radian</b>
          <small className="text-[#d9c2ec] text-[11px] font-semibold tracking-[0.1em] uppercase">Admin OS</small>
        </div>
      </div>

      <nav className="text-[15px]">
        {visibleGroups.map((g) => (
          <div key={g.title}>
            <div className="text-[11px] font-bold tracking-[0.13em] uppercase text-[#c9a6e4] px-3 pt-4 pb-1.5">{g.title}</div>
            {g.items.map((it) => {
              const parentActive = !!it.href && (pathname === it.href || pathname.startsWith(it.href + "/"));
              const open = expanded.has(it.label);
              const rowCls =
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] mb-1 font-medium transition-colors text-left " +
                (parentActive
                  ? "bg-orchid text-white font-semibold"
                  : "text-white/[0.94] hover:bg-white/[0.12]");
              const label = (
                <>
                  <span className="w-[19px] text-center text-[16px] opacity-95">{it.icon}</span>
                  <span className="flex-1 min-w-0 truncate">{it.label}</span>
                </>
              );
              const chevron = (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                  strokeLinecap="round" strokeLinejoin="round"
                  className={"shrink-0 opacity-80 transition-transform duration-200 " + (open ? "rotate-90" : "")}>
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
                    >
                      {label}
                      {chevron}
                    </button>
                  ) : it.href ? (
                    <Link href={it.href} className={rowCls}>{label}</Link>
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
        ))}
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
