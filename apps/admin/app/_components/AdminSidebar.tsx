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
/** A sub-menu entry. `subs` on a sub is kept in the type for the access
    helpers, but since 8 Sep 2026 the nav is two levels only — a module and
    its one list — and nothing in GROUPS nests deeper. */
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
    HOW THIS PANEL IS ARRANGED — owner, 8 September 2026.

    The old panel folded menus inside menus inside menus (Marketing went three
    deep, Administration → Integrations too) and the owner called it a maze.
    The rule now: a section label → a module → ONE click opens ONE list, and
    nothing folds inside that list. Two levels, never three.

    Two dashboards stand above every section — the whole business, and the
    books — and signing in lands on the first of them.

    The sections follow who does the work: SALES (orders → delivery → returns),
    SHOP (the counter), CATALOG (what is sold and how the website shows it),
    STOCK (the stockroom and buying), ACCOUNTS (the books), CUSTOMERS &
    MARKETING, STAFF, SETTINGS (set once, changed rarely).

    A module's own click opens its overview page, so no list carries an
    "Overview" row. The three rules from before still hold: a module may appear
    in two places but its data may not (Returns has one book; the online and
    counter doors are filtered links); daily screens and setup screens may
    live apart; a report lives where its decision lives.

    ⚠️ NOT ONE href CHANGED. Access keys derive from hrefs (ADM-RULE-001), so
    every tick and bookmark survives. After editing this array, regenerate the
    registry: node apps/api/src/administration/registry.gen.mjs
    ═══════════════════════════════════════════════════════════════════════ */
const GROUPS: Group[] = [
  {
    title: "Dashboards", accent: "#cf43ea", emblem: "sparkle",
    items: [
      { label: "Business Dashboard", href: "/intelligence", icon: "sparkle" },
      { label: "Accounts Dashboard", href: "/finance", icon: "wallet", roles: ["OWNER", "MANAGER"] },
    ],
  },
  {
    title: "Sales", accent: "#451e27", emblem: "bag",
    items: [
      {
        label: "Orders", href: "/orders", icon: "bag",
        subs: [
          { label: "Overview", href: "/orders" },
          { label: "All orders", href: "/orders/list" },
          /*  Needs action, Scheduled and the old Recovery page left the menu on
              9 Sep 2026 (owner): All orders carries Confirm/Call on every row,
              and Lost orders is where the unfinished ones live now.  */
          { label: "Lost orders", href: "/orders/lost" },
          /*  Cancelled is a segment of All orders; Online payments and the
              order-side Returns list are tabs of Payments (owner, 9 Sep 2026).  */
          { label: "Payments", href: "/orders/payments" },
          { label: "Reports", href: "/orders/reports" },
        ],
      },
      {
        label: "Delivery", href: "/delivery", icon: "truck",
        subs: [
          /*  Owner, 10 Sep 2026: three pages. Proof photos left — the photo
              is a step on the order and a column on the board.  */
          { label: "Delivery board", href: "/delivery", match: (p) => p === "/delivery" || p.startsWith("/delivery/board") },
          { label: "Delivery money", href: "/delivery/settle" },
          { label: "Reports", href: "/delivery/performance" },
          /*  Owner, 10 Sep 2026: the setup lives with the module, not under
              Settings — one place to look for anything delivery.  */
          { label: "Delivery setup", href: "/delivery/setup" },
        ],
      },
      {
        label: "Returns & Refunds", href: "/returns", icon: "returnArrow",
        subs: [
          { label: "All returns", href: "/returns", match: exact("/returns") },
          { label: "New return", href: "/returns/new" },
          { label: "Online returns", href: "/returns?channel=online" },
          { label: "Counter returns", href: "/returns?channel=counter" },
        ],
      },
      { label: "Inbox", href: "/inbox", icon: "mail" },
    ],
  },
  {
    title: "Shop", accent: "#e9c46a", emblem: "register",
    items: [
      {
        label: "POS", href: "/pos", icon: "register",
        subs: [
          { label: "Sell (counter)", href: "/pos/sell" },
          { label: "Today / Shift", href: "/pos/shift" },
          { label: "Day-close", href: "/pos/day-close" },
          { label: "Sales history", href: "/pos/sales" },
          { label: "Advance orders", href: "/pos/advance" },
          { label: "Due board", href: "/pos/due" },
          { label: "Settings", href: "/pos/settings" },
        ],
      },
    ],
  },
  {
    title: "Catalog", accent: "#e07be0", emblem: "flower",
    items: [
      {
        label: "Products", href: "/products", icon: "flower",
        subs: [
          { label: "All products", href: "/products/list" },
          { label: "Stock", href: "/products/stock" },
          { label: "Margin", href: "/products/margin" },
          { label: "Health", href: "/products/health" },
          { label: "Catalog funnel", href: "/products/funnel" },
          { label: "Add-ons", href: "/products/addons" },
          { label: "Upgrades", href: "/products/upgrades" },
          { label: "Badge rules", href: "/products/badges" },
          { label: "Bulk actions", href: "/products/bulk" },
          { label: "Trash", href: "/products/trash" },
        ],
      },
      {
        label: "Categories & Tags", icon: "layers",
        subs: [
          { label: "Categories", href: "/categories" },
          { label: "Occasions & Tags", href: "/tags" },
          { label: "Brands", href: "/brands" },
          { label: "Variants & options", href: "/products/variants" },
        ],
      },
      {
        label: "Website", href: "/storefront", icon: "store",
        subs: [
          { label: "Homepage", href: "/storefront/layout" },
          { label: "Category pages", href: "/storefront/category-page" },
          { label: "Pages & FAQs", href: "/storefront/pages" },
          { label: "Reviews", href: "/storefront/reviews" },
          { label: "Journal", href: "/storefront/journal" },
          { label: "Visit the shop", href: "/storefront/hours" },
          { label: "Footer & menus", href: "/storefront/footer" },
          { label: "SEO", href: "/marketing/seo", match: (p) => p.startsWith("/marketing/seo"), roles: ["OWNER", "MANAGER"] },
        ],
      },
    ],
  },
  {
    title: "Stock", accent: "#5ec9a8", emblem: "box",
    items: [
      {
        label: "Inventory", href: "/inventory", icon: "warehouse",
        subs: [
          { label: "Stock board", href: "/inventory/stock" },
          { label: "Opening stock", href: "/inventory/opening" },
          { label: "Transfer", href: "/inventory/transfer" },
          { label: "Wastage & Gift", href: "/inventory/issue" },
          { label: "Stocktake", href: "/inventory/stocktake" },
          { label: "Movements", href: "/inventory/movements" },
          { label: "Reports", href: "/inventory/reports" },
          { label: "Warehouses", href: "/inventory/warehouses" },
          { label: "Settings", href: "/inventory/settings" },
        ],
      },
      {
        label: "Purchases", href: "/purchases", icon: "cart",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "All purchases", href: "/purchases/list" },
          { label: "New purchase", href: "/purchases/new" },
          { label: "Purchase returns", href: "/purchases/returns" },
          { label: "Reports", href: "/purchases/reports" },
        ],
      },
      {
        label: "Suppliers", href: "/suppliers", icon: "users",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "All suppliers", href: "/suppliers/list" },
          { label: "Vendors", href: "/suppliers/vendors", match: (p) => p.startsWith("/suppliers/vendors") },
          { label: "Settings", href: "/suppliers/settings" },
        ],
      },
      {
        label: "Items", href: "/items", icon: "gem",
        subs: [
          { label: "All items", href: "/items/list" },
          { label: "New item", href: "/items/new" },
          { label: "Item categories", href: "/items/categories" },
          { label: "Item types", href: "/items/types" },
          { label: "Pricing", href: "/items/pricing" },
          { label: "Colours", href: "/items/colors" },
          { label: "Sizes", href: "/items/sizes" },
          { label: "Units", href: "/items/units" },
          { label: "Trash", href: "/items/trash" },
        ],
      },
      {
        label: "Assembly", href: "/assembly", icon: "tools",
        subs: [
          { label: "Templates", href: "/assembly/templates" },
          { label: "Production pipeline", href: "/assembly/pipeline" },
          { label: "Finished goods", href: "/assembly/finished" },
          { label: "Wastage", href: "/assembly/wastage" },
          { label: "Daily capacity", href: "/products/capacity" },
          { label: "Settings", href: "/assembly/settings" },
        ],
      },
    ],
  },
  {
    title: "Accounts", accent: "#e9c46a", emblem: "cash",
    items: [
      {
        label: "Finance", href: "/finance", icon: "wallet",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "Money accounts", href: "/finance/accounts" },
          { label: "Money in & moving", href: "/finance/income" },
          { label: "Expenses", href: "/finance/expenses" },
          { label: "Monthly bills", href: "/finance/recurring" },
          { label: "Partners", href: "/finance/partners" },
          { label: "Cash with carriers", href: "/finance/carrier" },
          { label: "Payment gateway", href: "/finance/gateway" },
          { label: "Assets & loans", href: "/finance/assets" },
          { label: "Staff advance & salary", href: "/finance/staff" },
          { label: "Settings", href: "/finance/settings" },
        ],
      },
      {
        label: "Books & Reports", icon: "book",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "Ledger", href: "/finance/ledger" },
          { label: "Manual journal", href: "/finance/journal" },
          { label: "Chart of accounts", href: "/finance/chart" },
          { label: "Reports", href: "/finance/reports" },
          { label: "Books vs reality", href: "/finance/drift" },
          { label: "VAT challan (Mushak 6.3)", href: "/finance/vat" },
        ],
      },
      {
        label: "Analytics", icon: "chart",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "Analytics", href: "/intelligence/analytics" },
          { label: "Reports", href: "/intelligence/reports" },
          { label: "Targets & KPIs", href: "/intelligence/kpis" },
          { label: "Forecast & market", href: "/intelligence/forecast" },
        ],
      },
    ],
  },
  {
    title: "Customers & Marketing", accent: "#7fb4f0", emblem: "heart",
    items: [
      {
        label: "Customers", href: "/customers", icon: "heart",
        subs: [
          { label: "All customers", href: "/customers/list" },
          { label: "Segments", href: "/customers/segments" },
          { label: "Occasions", href: "/customers/occasions" },
          { label: "Risk & blocklist", href: "/customers/risk" },
          { label: "Consent", href: "/customers/consent" },
          { label: "Duplicates & merge", href: "/customers/duplicates" },
        ],
      },
      {
        /*  href /marketing on purpose: its key "marketing" is what judges the
            API's /marketing/* routes and holds the existing access ticks.  */
        label: "Marketing", href: "/marketing", icon: "megaphone",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "Campaigns", href: "/marketing/campaigns" },
          { label: "Order sources", href: "/marketing/campaigns/sources" },
          { label: "Ad numbers", href: "/marketing/ads" },
          { label: "Tracking codes", href: "/marketing/tracking" },
          { label: "Marketing settings", href: "/marketing/settings" },
        ],
      },
      {
        label: "Offers & Coupons", href: "/marketing/offers", icon: "tag",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "Offers", href: "/marketing/offers/list", match: (p) => p.startsWith("/marketing/offers/list") || (/^\/marketing\/offers\/[^/]+$/.test(p) && !["/marketing/offers/coupons", "/marketing/offers/templates", "/marketing/offers/settings", "/marketing/offers/approvals"].includes(p)) },
          { label: "Coupons", href: "/marketing/offers/coupons" },
          { label: "Templates", href: "/marketing/offers/templates" },
          { label: "Approvals", href: "/marketing/offers/approvals" },
          { label: "Settings", href: "/marketing/offers/settings" },
        ],
      },
      {
        label: "Outreach & Loyalty", icon: "star",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "Occasions due", href: "/marketing/occasions" },
          { label: "Contact history", href: "/marketing/outreach", match: exact("/marketing/outreach") },
          { label: "Do not contact", href: "/marketing/outreach/optouts" },
          { label: "Recover lost orders", href: "/marketing/recovery" },
          { label: "Referral", href: "/marketing/referral" },
          { label: "Loyalty points", href: "/marketing/loyalty" },
        ],
      },
      {
        label: "Messaging", icon: "phone",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "WhatsApp", href: "/marketing/whatsapp" },
          { label: "Email & SMS", href: "/marketing/messaging" },
        ],
      },
      {
        label: "Affiliates", href: "/marketing/affiliates", icon: "users",
        roles: ["OWNER", "MANAGER"],
        subs: [
          { label: "All affiliates", href: "/marketing/affiliates/list" },
          { label: "Commission ledger", href: "/marketing/affiliates/commissions" },
          { label: "Payouts", href: "/marketing/affiliates/payouts" },
        ],
      },
    ],
  },
  {
    title: "Staff", accent: "#322d3c", emblem: "user",
    items: [
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
    ],
  },
  {
    title: "Settings", accent: "#322d3c", emblem: "gear",
    items: [
      {
        label: "Shop setup", icon: "gear",
        subs: [
          { label: "Company settings", href: "/administration/company", roles: ["OWNER"] },
          { label: "Sales channels", href: "/orders/channels" },
          { label: "Payment methods", href: "/administration/payment-methods", roles: ["OWNER", "MANAGER"] },
          { label: "Returns settings", href: "/returns/settings" },
          { label: "All settings", href: "/administration/settings", roles: ["OWNER"] },
        ],
      },
      {
        label: "Integrations & keys", href: "/administration/integrations", icon: "shield", roles: ["OWNER"],
        subs: [
          { label: "All keys", href: "/administration/integrations", match: exact("/administration/integrations") },
          { label: "Payment gateways", href: "/administration/integrations/payment" },
          { label: "Courier & delivery", href: "/administration/integrations/courier" },
          { label: "Messaging", href: "/administration/integrations/messaging" },
          { label: "Social & ads", href: "/administration/integrations/social" },
          { label: "Tracking & analytics", href: "/administration/integrations/analytics" },
        ],
      },
      {
        label: "Access & security", href: "/administration", icon: "lock", roles: ["OWNER"],
        subs: [
          { label: "Access control", href: "/administration/access" },
          { label: "People & accounts", href: "/settings/people" },
          { label: "Activity & sessions", href: "/settings/audit" },
          { label: "Backup & restore", href: "/administration/backup" },
        ],
      },
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

  /*  Arriving in a module opens exactly its list and folds every other one,
      so the page you are standing on is always visible in the nav.

      ⚠️ GUARDED BY REAL NAVIGATION (owner, 18 Aug 2026). This used to depend
      on [pathname, visibleGroups] — and visibleGroups is rebuilt whenever
      access refreshes, which happens on window focus. So minimising the
      browser and coming back re-opened every list the user had closed. Now it
      fires only when the PATH actually changes.  */
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (lastPath.current === pathname) return; // focus/refresh, not navigation
    lastPath.current = pathname;
    const active = pickActive(visibleGroups.flatMap((g) => g.items), pathname);
    if (!active || !active.subs) return;
    setExpanded((prev) => (prev.size === 1 && prev.has(active.label) ? prev : new Set([active.label])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, visibleGroups]);

  /*  Accordion — one list open at a time (sobuj, 28 Jul: "je module click
      krbo seta on hobe onno ta auto off hoye jabe"). Two levels only since
      8 Sep 2026, so a key is simply the module's label.  */
  const toggle = (key: string) =>
    setExpanded((prev) => (prev.has(key) ? new Set() : new Set([key])));

  /*  The invite / reset link pages are reached with no session at all, so there
      is no nav to draw — and drawing one from a null user would show the STAFF
      menu to somebody who has not signed in yet.  */
  if (NO_SESSION_PATHS.some((p) => pathname.startsWith(p))) return null;

  //  The single module the current path belongs to — used to highlight one row.
  const activeItem = pickActive(visibleGroups.flatMap((g) => g.items), pathname);

  return (
    <aside
      className="w-[262px] shrink-0 text-white px-3 py-4 sticky top-0 h-screen hidden md:flex md:flex-col overflow-y-auto font-nav"
      style={{
        background: "linear-gradient(180deg,#3a0054 0%,#470066 42%,#5b0f83 100%)",
        /*  Design A (owner, 8 Sep 2026): depth inside the deep purple — a soft
            inner shadow down the edges and a faint glow at the top, so the
            panel reads as a lit surface rather than a flat block.  */
        boxShadow: "inset -18px 0 32px -20px rgba(0,0,0,.55), inset 18px 0 32px -22px rgba(0,0,0,.35), inset 0 40px 60px -40px rgba(207,67,234,.35)",
      }}
    >
      <div className="flex items-center gap-3 px-2 pb-4">
        <div className="w-[34px] h-[34px] rounded-[50%_50%_50%_0] -rotate-45 shrink-0"
          style={{ background: "linear-gradient(150deg,#cf43ea,#b76e79)", boxShadow: "0 0 18px rgba(207,67,234,0.5)" }} />
        <div>
          <b className="text-[20px] font-extrabold text-white block leading-none tracking-[-0.02em]">RADIAN</b>
          <small className="text-[#e5b3bc] text-[10px] font-extrabold tracking-[0.18em] uppercase">Admin OS</small>
        </div>
      </div>

      {/*  6 Aug 2026 — owner: one click from anywhere in the admin into the
          live shop. WEB_BASE, never a hardcoded domain.  */}
      <a
        href={WEB_BASE}
        target="_blank"
        rel="noreferrer"
        className="mx-1 mb-3 flex items-center justify-center gap-2 rounded-[12px] border border-white/[0.14] bg-white/[0.07] hover:bg-white/[0.14] text-white text-[13px] font-bold py-2.5 transition-colors"
      >
        ↗ View website
      </a>

      <nav className="text-[14px]">
        {visibleGroups.map((g) => {
          const dashboards = g.title === "Dashboards";
          return (
            <div key={g.title} className="mb-1">
              {!dashboards && (
                <div className="text-[10.5px] font-extrabold tracking-[0.18em] uppercase text-[#e5b3bc] px-3 pt-4 pb-1.5">
                  {g.title}
                </div>
              )}
              {g.items.map((it) => {
                const parentActive = it === activeItem;
                const open = expanded.has(it.label);
                const rowBase = dashboards
                  ? "w-full flex items-center gap-3 px-3 py-[11px] rounded-[14px] mb-1.5 text-[14px] font-extrabold transition-all text-left "
                  : "w-full flex items-center gap-2.5 px-3 py-[9px] rounded-[12px] mb-0.5 text-[14px] font-bold transition-all text-left ";
                const rowCls =
                  rowBase +
                  (parentActive && !open
                    ? "text-white bg-white/[0.16]"
                    : open
                      ? "text-white bg-white/[0.12]"
                      : dashboards
                        ? "text-white bg-white/[0.08] hover:bg-white/[0.14]"
                        : "text-[#f1e6f8] hover:bg-white/[0.08]");
                const rowStyle =
                  dashboards && parentActive
                    ? { background: "#fff", color: "#ce6ef7", boxShadow: "0 10px 24px -10px rgba(0,0,0,.6)" }
                    : open
                      ? { boxShadow: "0 8px 20px -12px rgba(0,0,0,.7)" }
                      : undefined;
                const label = (
                  <>
                    <span
                      className={(dashboards ? "w-[30px] h-[30px] rounded-[9px]" : "w-[26px] h-[26px] rounded-[8px]") + " grid place-items-center shrink-0"}
                      style={{
                        background: dashboards && parentActive ? "#32193a" : "rgba(255,255,255,.12)",
                        color: dashboards && parentActive ? "#bb7fdc" : "#fff",
                      }}
                    >
                      <Icon name={it.icon} size={dashboards ? 16 : 15} strokeWidth={2.4} />
                    </span>
                    <span className="flex-1 min-w-0 truncate">{it.label}</span>
                  </>
                );
                const chevron = (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round"
                    className={"shrink-0 opacity-70 transition-transform duration-200 " + (open ? "rotate-180" : "")}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                );

                return (
                  <div key={it.label}>
                    {/* THE WHOLE ROW is the control (sobuj, 21 Jul): one click opens
                        the list AND goes to the module; a second click closes it and
                        leaves you where you are. */}
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
                      /*  The one list. White-on-purple, lifted with a shadow, a
                          thin rail down its left — what is open cannot be missed.  */
                      <div
                        className="ml-[14px] mt-1 mb-2 pl-[10px] py-1.5 border-l-2 border-white/25"
                      >
                        {it.subs.map((s) => {
                          const on = subOwns(s, pathname);
                          return (
                            <Link
                              key={s.href}
                              href={s.href}
                              className={"block px-3 py-[7px] rounded-[9px] mb-0.5 text-[13.5px] font-bold transition-colors " +
                                (on ? "text-[#ce6ef7] bg-white" : "text-[#e3cff0] hover:text-white hover:bg-white/[0.1]")}
                              style={on ? { boxShadow: "0 8px 18px -10px rgba(0,0,0,.7)" } : undefined}
                            >
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
          );
        })}
      </nav>

      {/* who is at the keyboard — the name the ledger will record (DEC-FIN-028) */}
      <div className="mt-auto px-1 pt-4">
        {me && (
          <div className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-[14px] mb-2" style={{ background: "rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)" }}>
            <div className="w-8 h-8 rounded-full grid place-items-center text-[13px] font-extrabold text-white shrink-0"
              style={{ background: "linear-gradient(135deg,#cf43ea,#b76e79)" }}>
              {me.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-extrabold text-white truncate">{me.name}</div>
              <div className="text-[10px] font-bold text-[#e5b3bc] uppercase tracking-[0.12em]">{me.role.toLowerCase()}</div>
            </div>
            <NotificationsBell />
            <button onClick={signOut} title="Sign out"
              className="text-[11px] font-extrabold text-[#e5b3bc] hover:text-white px-2 py-1 rounded-lg">
              exit
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
