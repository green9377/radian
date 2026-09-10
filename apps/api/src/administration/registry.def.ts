/*  THE ONE LIST  —  ADM-D05 / ADM-RULE-001
 *
 *  ⚠️ এই ফাইলটা হাতে লেখা নয় — GENERATED。 হাতে সারি বসালে পরের বার
 *     regenerate-এ মুছে যাবে, আর ঠিক সেই drift ফিরে আসবে যেটা এই module
 *     বন্ধ করতে এসেছে。
 *
 *       node apps/api/src/administration/registry.gen.mjs      ← এটা বানায়
 *       node apps/api/src/administration/registry.drift.mjs    ← এটা মেলায়
 *
 *  কেন এটা API-তে, panel-এ নয়: আগে দুটো তালিকা ছিল — সাইডবারের roles: array
 *  আর controller-এর @Roles — আর কেউ মেলাত না। Intelligence বানানোর দিন সাইডবারে
 *  roles বসানোয় STAFF-এর কাছ থেকে পুরো module লুকিয়ে গিয়েছিল, অথচ সিদ্ধান্ত ছিল
 *  উল্টো আর API খোলাই ছিল। কোনো error হয়নি।
 *
 *  এখন তালিকা একটাই, আর সেটা এখানে। সাইডবার এটা পড়বে (GET /administration/menu),
 *  পাহারাও এটা পড়বে। মেলানোর কিছু থাকবে না, কারণ মেলানোর মতো দ্বিতীয় তালিকা নেই।
 *
 *  legacyRoles = সাইডবারে যা লেখা আছে। শুরুর তিনটে পদ এখান থেকেই বানানো হয়
 *  (ADM-D02), যাতে প্রথম দিন কারও কিছু না বদলায়। নতুন টিক Position টেবিলে যাবে।
 *
 *  query-string যুক্ত সারি (?channel= / ?tab=) এখানে নেই — ওগুলো এক পর্দার
 *  দ্বিতীয় দরজা, আলাদা পর্দা নয় (DEC-RTN-016)。 base href-এর node-ই ওদের node。
 */

export type RegistryNode = {
  key: string;
  parentKey: string | null;
  kind: "MODULE" | "SCREEN";
  label: string;
  domain: string;
  href: string | null;
  /** আজকের সাইডবারে লেখা নিয়ম — শুধু শুরুর পদ বানানোর জন্য */
  legacyRoles: ("OWNER" | "MANAGER" | "STAFF")[] | null;
  sortOrder: number;
};

export const REGISTRY: RegistryNode[] = [
  {
    "key": "intelligence",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Business Dashboard",
    "domain": "Dashboards",
    "href": "/intelligence",
    "legacyRoles": null,
    "sortOrder": 0
  },
  {
    "key": "finance",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Accounts Dashboard",
    "domain": "Dashboards",
    "href": "/finance",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 1
  },
  {
    "key": "orders",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Orders",
    "domain": "Sales",
    "href": "/orders",
    "legacyRoles": null,
    "sortOrder": 2
  },
  {
    "key": "orders.overview",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Sales",
    "href": "/orders",
    "legacyRoles": null,
    "sortOrder": 3
  },
  {
    "key": "orders.list",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "All orders",
    "domain": "Sales",
    "href": "/orders/list",
    "legacyRoles": null,
    "sortOrder": 4
  },
  {
    "key": "orders.lost",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Lost orders",
    "domain": "Sales",
    "href": "/orders/lost",
    "legacyRoles": null,
    "sortOrder": 5
  },
  {
    "key": "orders.payments",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Payments",
    "domain": "Sales",
    "href": "/orders/payments",
    "legacyRoles": null,
    "sortOrder": 6
  },
  {
    "key": "orders.reports",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Sales",
    "href": "/orders/reports",
    "legacyRoles": null,
    "sortOrder": 7
  },
  {
    "key": "delivery",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Delivery",
    "domain": "Sales",
    "href": "/delivery",
    "legacyRoles": null,
    "sortOrder": 8
  },
  {
    "key": "delivery.overview",
    "parentKey": "delivery",
    "kind": "SCREEN",
    "label": "Delivery board",
    "domain": "Sales",
    "href": "/delivery",
    "legacyRoles": null,
    "sortOrder": 9
  },
  {
    "key": "delivery.settle",
    "parentKey": "delivery",
    "kind": "SCREEN",
    "label": "Delivery money",
    "domain": "Sales",
    "href": "/delivery/settle",
    "legacyRoles": null,
    "sortOrder": 10
  },
  {
    "key": "delivery.performance",
    "parentKey": "delivery",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Sales",
    "href": "/delivery/performance",
    "legacyRoles": null,
    "sortOrder": 11
  },
  {
    "key": "delivery.setup",
    "parentKey": "delivery",
    "kind": "SCREEN",
    "label": "Delivery setup",
    "domain": "Sales",
    "href": "/delivery/setup",
    "legacyRoles": null,
    "sortOrder": 12
  },
  {
    "key": "returns",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Returns & Refunds",
    "domain": "Sales",
    "href": "/returns",
    "legacyRoles": null,
    "sortOrder": 13
  },
  {
    "key": "returns.overview",
    "parentKey": "returns",
    "kind": "SCREEN",
    "label": "All returns",
    "domain": "Sales",
    "href": "/returns",
    "legacyRoles": null,
    "sortOrder": 14
  },
  {
    "key": "returns.new",
    "parentKey": "returns",
    "kind": "SCREEN",
    "label": "New return",
    "domain": "Sales",
    "href": "/returns/new",
    "legacyRoles": null,
    "sortOrder": 15
  },
  {
    "key": "inbox",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Inbox",
    "domain": "Sales",
    "href": "/inbox",
    "legacyRoles": null,
    "sortOrder": 16
  },
  {
    "key": "pos",
    "parentKey": null,
    "kind": "MODULE",
    "label": "POS",
    "domain": "Shop",
    "href": "/pos",
    "legacyRoles": null,
    "sortOrder": 17
  },
  {
    "key": "pos.sell",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Sell (counter)",
    "domain": "Shop",
    "href": "/pos/sell",
    "legacyRoles": null,
    "sortOrder": 18
  },
  {
    "key": "pos.shift",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Today / Shift",
    "domain": "Shop",
    "href": "/pos/shift",
    "legacyRoles": null,
    "sortOrder": 19
  },
  {
    "key": "pos.day-close",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Day-close",
    "domain": "Shop",
    "href": "/pos/day-close",
    "legacyRoles": null,
    "sortOrder": 20
  },
  {
    "key": "pos.sales",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Sales history",
    "domain": "Shop",
    "href": "/pos/sales",
    "legacyRoles": null,
    "sortOrder": 21
  },
  {
    "key": "pos.advance",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Advance orders",
    "domain": "Shop",
    "href": "/pos/advance",
    "legacyRoles": null,
    "sortOrder": 22
  },
  {
    "key": "pos.due",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Due board",
    "domain": "Shop",
    "href": "/pos/due",
    "legacyRoles": null,
    "sortOrder": 23
  },
  {
    "key": "pos.settings",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Shop",
    "href": "/pos/settings",
    "legacyRoles": null,
    "sortOrder": 24
  },
  {
    "key": "products",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Products",
    "domain": "Catalog",
    "href": "/products",
    "legacyRoles": null,
    "sortOrder": 25
  },
  {
    "key": "products.list",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "All products",
    "domain": "Catalog",
    "href": "/products/list",
    "legacyRoles": null,
    "sortOrder": 26
  },
  {
    "key": "products.stock",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Stock",
    "domain": "Catalog",
    "href": "/products/stock",
    "legacyRoles": null,
    "sortOrder": 27
  },
  {
    "key": "products.margin",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Margin",
    "domain": "Catalog",
    "href": "/products/margin",
    "legacyRoles": null,
    "sortOrder": 28
  },
  {
    "key": "products.health",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Health",
    "domain": "Catalog",
    "href": "/products/health",
    "legacyRoles": null,
    "sortOrder": 29
  },
  {
    "key": "products.funnel",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Catalog funnel",
    "domain": "Catalog",
    "href": "/products/funnel",
    "legacyRoles": null,
    "sortOrder": 30
  },
  {
    "key": "products.addons",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Add-ons",
    "domain": "Catalog",
    "href": "/products/addons",
    "legacyRoles": null,
    "sortOrder": 31
  },
  {
    "key": "products.upgrades",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Upgrades",
    "domain": "Catalog",
    "href": "/products/upgrades",
    "legacyRoles": null,
    "sortOrder": 32
  },
  {
    "key": "products.badges",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Badge rules",
    "domain": "Catalog",
    "href": "/products/badges",
    "legacyRoles": null,
    "sortOrder": 33
  },
  {
    "key": "products.bulk",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Bulk actions",
    "domain": "Catalog",
    "href": "/products/bulk",
    "legacyRoles": null,
    "sortOrder": 34
  },
  {
    "key": "products.trash",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Trash",
    "domain": "Catalog",
    "href": "/products/trash",
    "legacyRoles": null,
    "sortOrder": 35
  },
  {
    "key": "categories-tags",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Categories & Tags",
    "domain": "Catalog",
    "href": null,
    "legacyRoles": null,
    "sortOrder": 36
  },
  {
    "key": "categories",
    "parentKey": "categories-tags",
    "kind": "SCREEN",
    "label": "Categories",
    "domain": "Catalog",
    "href": "/categories",
    "legacyRoles": null,
    "sortOrder": 37
  },
  {
    "key": "tags",
    "parentKey": "categories-tags",
    "kind": "SCREEN",
    "label": "Occasions & Tags",
    "domain": "Catalog",
    "href": "/tags",
    "legacyRoles": null,
    "sortOrder": 38
  },
  {
    "key": "brands",
    "parentKey": "categories-tags",
    "kind": "SCREEN",
    "label": "Brands",
    "domain": "Catalog",
    "href": "/brands",
    "legacyRoles": null,
    "sortOrder": 39
  },
  {
    "key": "products.variants",
    "parentKey": "categories-tags",
    "kind": "SCREEN",
    "label": "Variants & options",
    "domain": "Catalog",
    "href": "/products/variants",
    "legacyRoles": null,
    "sortOrder": 40
  },
  {
    "key": "storefront",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Website",
    "domain": "Catalog",
    "href": "/storefront",
    "legacyRoles": null,
    "sortOrder": 41
  },
  {
    "key": "storefront.layout",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "Homepage",
    "domain": "Catalog",
    "href": "/storefront/layout",
    "legacyRoles": null,
    "sortOrder": 42
  },
  {
    "key": "storefront.category-page",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "Category pages",
    "domain": "Catalog",
    "href": "/storefront/category-page",
    "legacyRoles": null,
    "sortOrder": 43
  },
  {
    "key": "storefront.pages",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "Pages & FAQs",
    "domain": "Catalog",
    "href": "/storefront/pages",
    "legacyRoles": null,
    "sortOrder": 44
  },
  {
    "key": "storefront.reviews",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "Reviews",
    "domain": "Catalog",
    "href": "/storefront/reviews",
    "legacyRoles": null,
    "sortOrder": 45
  },
  {
    "key": "storefront.journal",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "Journal",
    "domain": "Catalog",
    "href": "/storefront/journal",
    "legacyRoles": null,
    "sortOrder": 46
  },
  {
    "key": "storefront.hours",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "Visit the shop",
    "domain": "Catalog",
    "href": "/storefront/hours",
    "legacyRoles": null,
    "sortOrder": 47
  },
  {
    "key": "storefront.footer",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "Footer & menus",
    "domain": "Catalog",
    "href": "/storefront/footer",
    "legacyRoles": null,
    "sortOrder": 48
  },
  {
    "key": "marketing.seo",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "SEO",
    "domain": "Catalog",
    "href": "/marketing/seo",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 49
  },
  {
    "key": "inventory",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Inventory",
    "domain": "Stock",
    "href": "/inventory",
    "legacyRoles": null,
    "sortOrder": 50
  },
  {
    "key": "inventory.stock",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Stock board",
    "domain": "Stock",
    "href": "/inventory/stock",
    "legacyRoles": null,
    "sortOrder": 51
  },
  {
    "key": "inventory.opening",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Opening stock",
    "domain": "Stock",
    "href": "/inventory/opening",
    "legacyRoles": null,
    "sortOrder": 52
  },
  {
    "key": "inventory.transfer",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Transfer",
    "domain": "Stock",
    "href": "/inventory/transfer",
    "legacyRoles": null,
    "sortOrder": 53
  },
  {
    "key": "inventory.issue",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Wastage & Gift",
    "domain": "Stock",
    "href": "/inventory/issue",
    "legacyRoles": null,
    "sortOrder": 54
  },
  {
    "key": "inventory.stocktake",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Stocktake",
    "domain": "Stock",
    "href": "/inventory/stocktake",
    "legacyRoles": null,
    "sortOrder": 55
  },
  {
    "key": "inventory.movements",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Movements",
    "domain": "Stock",
    "href": "/inventory/movements",
    "legacyRoles": null,
    "sortOrder": 56
  },
  {
    "key": "inventory.reports",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Stock",
    "href": "/inventory/reports",
    "legacyRoles": null,
    "sortOrder": 57
  },
  {
    "key": "inventory.warehouses",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Warehouses",
    "domain": "Stock",
    "href": "/inventory/warehouses",
    "legacyRoles": null,
    "sortOrder": 58
  },
  {
    "key": "inventory.settings",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Stock",
    "href": "/inventory/settings",
    "legacyRoles": null,
    "sortOrder": 59
  },
  {
    "key": "purchases",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Purchases",
    "domain": "Stock",
    "href": "/purchases",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 60
  },
  {
    "key": "purchases.list",
    "parentKey": "purchases",
    "kind": "SCREEN",
    "label": "All purchases",
    "domain": "Stock",
    "href": "/purchases/list",
    "legacyRoles": null,
    "sortOrder": 61
  },
  {
    "key": "purchases.new",
    "parentKey": "purchases",
    "kind": "SCREEN",
    "label": "New purchase",
    "domain": "Stock",
    "href": "/purchases/new",
    "legacyRoles": null,
    "sortOrder": 62
  },
  {
    "key": "purchases.returns",
    "parentKey": "purchases",
    "kind": "SCREEN",
    "label": "Purchase returns",
    "domain": "Stock",
    "href": "/purchases/returns",
    "legacyRoles": null,
    "sortOrder": 63
  },
  {
    "key": "purchases.reports",
    "parentKey": "purchases",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Stock",
    "href": "/purchases/reports",
    "legacyRoles": null,
    "sortOrder": 64
  },
  {
    "key": "suppliers",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Suppliers",
    "domain": "Stock",
    "href": "/suppliers",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 65
  },
  {
    "key": "suppliers.list",
    "parentKey": "suppliers",
    "kind": "SCREEN",
    "label": "All suppliers",
    "domain": "Stock",
    "href": "/suppliers/list",
    "legacyRoles": null,
    "sortOrder": 66
  },
  {
    "key": "suppliers.vendors",
    "parentKey": "suppliers",
    "kind": "SCREEN",
    "label": "Vendors",
    "domain": "Stock",
    "href": "/suppliers/vendors",
    "legacyRoles": null,
    "sortOrder": 67
  },
  {
    "key": "suppliers.settings",
    "parentKey": "suppliers",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Stock",
    "href": "/suppliers/settings",
    "legacyRoles": null,
    "sortOrder": 68
  },
  {
    "key": "items",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Items",
    "domain": "Stock",
    "href": "/items",
    "legacyRoles": null,
    "sortOrder": 69
  },
  {
    "key": "items.list",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "All items",
    "domain": "Stock",
    "href": "/items/list",
    "legacyRoles": null,
    "sortOrder": 70
  },
  {
    "key": "items.new",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "New item",
    "domain": "Stock",
    "href": "/items/new",
    "legacyRoles": null,
    "sortOrder": 71
  },
  {
    "key": "items.categories",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Item categories",
    "domain": "Stock",
    "href": "/items/categories",
    "legacyRoles": null,
    "sortOrder": 72
  },
  {
    "key": "items.types",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Item types",
    "domain": "Stock",
    "href": "/items/types",
    "legacyRoles": null,
    "sortOrder": 73
  },
  {
    "key": "items.pricing",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Pricing",
    "domain": "Stock",
    "href": "/items/pricing",
    "legacyRoles": null,
    "sortOrder": 74
  },
  {
    "key": "items.colors",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Colours",
    "domain": "Stock",
    "href": "/items/colors",
    "legacyRoles": null,
    "sortOrder": 75
  },
  {
    "key": "items.sizes",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Sizes",
    "domain": "Stock",
    "href": "/items/sizes",
    "legacyRoles": null,
    "sortOrder": 76
  },
  {
    "key": "items.units",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Units",
    "domain": "Stock",
    "href": "/items/units",
    "legacyRoles": null,
    "sortOrder": 77
  },
  {
    "key": "items.trash",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Trash",
    "domain": "Stock",
    "href": "/items/trash",
    "legacyRoles": null,
    "sortOrder": 78
  },
  {
    "key": "assembly",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Assembly",
    "domain": "Stock",
    "href": "/assembly",
    "legacyRoles": null,
    "sortOrder": 79
  },
  {
    "key": "assembly.templates",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Templates",
    "domain": "Stock",
    "href": "/assembly/templates",
    "legacyRoles": null,
    "sortOrder": 80
  },
  {
    "key": "assembly.pipeline",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Production pipeline",
    "domain": "Stock",
    "href": "/assembly/pipeline",
    "legacyRoles": null,
    "sortOrder": 81
  },
  {
    "key": "assembly.finished",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Finished goods",
    "domain": "Stock",
    "href": "/assembly/finished",
    "legacyRoles": null,
    "sortOrder": 82
  },
  {
    "key": "assembly.wastage",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Wastage",
    "domain": "Stock",
    "href": "/assembly/wastage",
    "legacyRoles": null,
    "sortOrder": 83
  },
  {
    "key": "products.capacity",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Daily capacity",
    "domain": "Stock",
    "href": "/products/capacity",
    "legacyRoles": null,
    "sortOrder": 84
  },
  {
    "key": "assembly.settings",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Stock",
    "href": "/assembly/settings",
    "legacyRoles": null,
    "sortOrder": 85
  },
  {
    "key": "finance.accounts",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Money accounts",
    "domain": "Accounts",
    "href": "/finance/accounts",
    "legacyRoles": null,
    "sortOrder": 86
  },
  {
    "key": "finance.income",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Money in & moving",
    "domain": "Accounts",
    "href": "/finance/income",
    "legacyRoles": null,
    "sortOrder": 87
  },
  {
    "key": "finance.expenses",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Expenses",
    "domain": "Accounts",
    "href": "/finance/expenses",
    "legacyRoles": null,
    "sortOrder": 88
  },
  {
    "key": "finance.recurring",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Monthly bills",
    "domain": "Accounts",
    "href": "/finance/recurring",
    "legacyRoles": null,
    "sortOrder": 89
  },
  {
    "key": "finance.partners",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Partners",
    "domain": "Accounts",
    "href": "/finance/partners",
    "legacyRoles": null,
    "sortOrder": 90
  },
  {
    "key": "finance.carrier",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Cash with carriers",
    "domain": "Accounts",
    "href": "/finance/carrier",
    "legacyRoles": null,
    "sortOrder": 91
  },
  {
    "key": "finance.gateway",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Payment gateway",
    "domain": "Accounts",
    "href": "/finance/gateway",
    "legacyRoles": null,
    "sortOrder": 92
  },
  {
    "key": "finance.assets",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Assets & loans",
    "domain": "Accounts",
    "href": "/finance/assets",
    "legacyRoles": null,
    "sortOrder": 93
  },
  {
    "key": "finance.staff",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Staff advance & salary",
    "domain": "Accounts",
    "href": "/finance/staff",
    "legacyRoles": null,
    "sortOrder": 94
  },
  {
    "key": "finance.settings",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Accounts",
    "href": "/finance/settings",
    "legacyRoles": null,
    "sortOrder": 95
  },
  {
    "key": "books-reports",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Books & Reports",
    "domain": "Accounts",
    "href": null,
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 96
  },
  {
    "key": "finance.ledger",
    "parentKey": "books-reports",
    "kind": "SCREEN",
    "label": "Ledger",
    "domain": "Accounts",
    "href": "/finance/ledger",
    "legacyRoles": null,
    "sortOrder": 97
  },
  {
    "key": "finance.journal",
    "parentKey": "books-reports",
    "kind": "SCREEN",
    "label": "Manual journal",
    "domain": "Accounts",
    "href": "/finance/journal",
    "legacyRoles": null,
    "sortOrder": 98
  },
  {
    "key": "finance.chart",
    "parentKey": "books-reports",
    "kind": "SCREEN",
    "label": "Chart of accounts",
    "domain": "Accounts",
    "href": "/finance/chart",
    "legacyRoles": null,
    "sortOrder": 99
  },
  {
    "key": "finance.reports",
    "parentKey": "books-reports",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Accounts",
    "href": "/finance/reports",
    "legacyRoles": null,
    "sortOrder": 100
  },
  {
    "key": "finance.drift",
    "parentKey": "books-reports",
    "kind": "SCREEN",
    "label": "Books vs reality",
    "domain": "Accounts",
    "href": "/finance/drift",
    "legacyRoles": null,
    "sortOrder": 101
  },
  {
    "key": "finance.vat",
    "parentKey": "books-reports",
    "kind": "SCREEN",
    "label": "VAT challan (Mushak 6.3)",
    "domain": "Accounts",
    "href": "/finance/vat",
    "legacyRoles": null,
    "sortOrder": 102
  },
  {
    "key": "analytics",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Analytics",
    "domain": "Accounts",
    "href": null,
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 103
  },
  {
    "key": "intelligence.analytics",
    "parentKey": "analytics",
    "kind": "SCREEN",
    "label": "Analytics",
    "domain": "Accounts",
    "href": "/intelligence/analytics",
    "legacyRoles": null,
    "sortOrder": 104
  },
  {
    "key": "intelligence.reports",
    "parentKey": "analytics",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Accounts",
    "href": "/intelligence/reports",
    "legacyRoles": null,
    "sortOrder": 105
  },
  {
    "key": "intelligence.kpis",
    "parentKey": "analytics",
    "kind": "SCREEN",
    "label": "Targets & KPIs",
    "domain": "Accounts",
    "href": "/intelligence/kpis",
    "legacyRoles": null,
    "sortOrder": 106
  },
  {
    "key": "intelligence.forecast",
    "parentKey": "analytics",
    "kind": "SCREEN",
    "label": "Forecast & market",
    "domain": "Accounts",
    "href": "/intelligence/forecast",
    "legacyRoles": null,
    "sortOrder": 107
  },
  {
    "key": "customers",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Customers",
    "domain": "Customers & Marketing",
    "href": "/customers",
    "legacyRoles": null,
    "sortOrder": 108
  },
  {
    "key": "customers.list",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "All customers",
    "domain": "Customers & Marketing",
    "href": "/customers/list",
    "legacyRoles": null,
    "sortOrder": 109
  },
  {
    "key": "customers.segments",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Segments",
    "domain": "Customers & Marketing",
    "href": "/customers/segments",
    "legacyRoles": null,
    "sortOrder": 110
  },
  {
    "key": "customers.occasions",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Occasions",
    "domain": "Customers & Marketing",
    "href": "/customers/occasions",
    "legacyRoles": null,
    "sortOrder": 111
  },
  {
    "key": "customers.risk",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Risk & blocklist",
    "domain": "Customers & Marketing",
    "href": "/customers/risk",
    "legacyRoles": null,
    "sortOrder": 112
  },
  {
    "key": "customers.consent",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Consent",
    "domain": "Customers & Marketing",
    "href": "/customers/consent",
    "legacyRoles": null,
    "sortOrder": 113
  },
  {
    "key": "customers.duplicates",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Duplicates & merge",
    "domain": "Customers & Marketing",
    "href": "/customers/duplicates",
    "legacyRoles": null,
    "sortOrder": 114
  },
  {
    "key": "marketing",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Marketing",
    "domain": "Customers & Marketing",
    "href": "/marketing",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 115
  },
  {
    "key": "marketing.campaigns",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Campaigns",
    "domain": "Customers & Marketing",
    "href": "/marketing/campaigns",
    "legacyRoles": null,
    "sortOrder": 116
  },
  {
    "key": "marketing.campaigns.sources",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Order sources",
    "domain": "Customers & Marketing",
    "href": "/marketing/campaigns/sources",
    "legacyRoles": null,
    "sortOrder": 117
  },
  {
    "key": "marketing.ads",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Ad numbers",
    "domain": "Customers & Marketing",
    "href": "/marketing/ads",
    "legacyRoles": null,
    "sortOrder": 118
  },
  {
    "key": "marketing.tracking",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Tracking codes",
    "domain": "Customers & Marketing",
    "href": "/marketing/tracking",
    "legacyRoles": null,
    "sortOrder": 119
  },
  {
    "key": "marketing.settings",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Marketing settings",
    "domain": "Customers & Marketing",
    "href": "/marketing/settings",
    "legacyRoles": null,
    "sortOrder": 120
  },
  {
    "key": "marketing.offers",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Offers & Coupons",
    "domain": "Customers & Marketing",
    "href": "/marketing/offers",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 121
  },
  {
    "key": "marketing.offers.list",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Offers",
    "domain": "Customers & Marketing",
    "href": "/marketing/offers/list",
    "legacyRoles": null,
    "sortOrder": 122
  },
  {
    "key": "marketing.offers.coupons",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Coupons",
    "domain": "Customers & Marketing",
    "href": "/marketing/offers/coupons",
    "legacyRoles": null,
    "sortOrder": 123
  },
  {
    "key": "marketing.offers.templates",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Templates",
    "domain": "Customers & Marketing",
    "href": "/marketing/offers/templates",
    "legacyRoles": null,
    "sortOrder": 124
  },
  {
    "key": "marketing.offers.approvals",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Approvals",
    "domain": "Customers & Marketing",
    "href": "/marketing/offers/approvals",
    "legacyRoles": null,
    "sortOrder": 125
  },
  {
    "key": "marketing.offers.settings",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Customers & Marketing",
    "href": "/marketing/offers/settings",
    "legacyRoles": null,
    "sortOrder": 126
  },
  {
    "key": "outreach-loyalty",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Outreach & Loyalty",
    "domain": "Customers & Marketing",
    "href": null,
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 127
  },
  {
    "key": "marketing.occasions",
    "parentKey": "outreach-loyalty",
    "kind": "SCREEN",
    "label": "Occasions due",
    "domain": "Customers & Marketing",
    "href": "/marketing/occasions",
    "legacyRoles": null,
    "sortOrder": 128
  },
  {
    "key": "marketing.outreach",
    "parentKey": "outreach-loyalty",
    "kind": "SCREEN",
    "label": "Contact history",
    "domain": "Customers & Marketing",
    "href": "/marketing/outreach",
    "legacyRoles": null,
    "sortOrder": 129
  },
  {
    "key": "marketing.outreach.optouts",
    "parentKey": "outreach-loyalty",
    "kind": "SCREEN",
    "label": "Do not contact",
    "domain": "Customers & Marketing",
    "href": "/marketing/outreach/optouts",
    "legacyRoles": null,
    "sortOrder": 130
  },
  {
    "key": "marketing.recovery",
    "parentKey": "outreach-loyalty",
    "kind": "SCREEN",
    "label": "Recover lost orders",
    "domain": "Customers & Marketing",
    "href": "/marketing/recovery",
    "legacyRoles": null,
    "sortOrder": 131
  },
  {
    "key": "marketing.referral",
    "parentKey": "outreach-loyalty",
    "kind": "SCREEN",
    "label": "Referral",
    "domain": "Customers & Marketing",
    "href": "/marketing/referral",
    "legacyRoles": null,
    "sortOrder": 132
  },
  {
    "key": "marketing.loyalty",
    "parentKey": "outreach-loyalty",
    "kind": "SCREEN",
    "label": "Loyalty points",
    "domain": "Customers & Marketing",
    "href": "/marketing/loyalty",
    "legacyRoles": null,
    "sortOrder": 133
  },
  {
    "key": "messaging",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Messaging",
    "domain": "Customers & Marketing",
    "href": null,
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 134
  },
  {
    "key": "marketing.whatsapp",
    "parentKey": "messaging",
    "kind": "SCREEN",
    "label": "WhatsApp",
    "domain": "Customers & Marketing",
    "href": "/marketing/whatsapp",
    "legacyRoles": null,
    "sortOrder": 135
  },
  {
    "key": "marketing.messaging",
    "parentKey": "messaging",
    "kind": "SCREEN",
    "label": "Email & SMS",
    "domain": "Customers & Marketing",
    "href": "/marketing/messaging",
    "legacyRoles": null,
    "sortOrder": 136
  },
  {
    "key": "marketing.affiliates",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Affiliates",
    "domain": "Customers & Marketing",
    "href": "/marketing/affiliates",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 137
  },
  {
    "key": "marketing.affiliates.list",
    "parentKey": "marketing.affiliates",
    "kind": "SCREEN",
    "label": "All affiliates",
    "domain": "Customers & Marketing",
    "href": "/marketing/affiliates/list",
    "legacyRoles": null,
    "sortOrder": 138
  },
  {
    "key": "marketing.affiliates.commissions",
    "parentKey": "marketing.affiliates",
    "kind": "SCREEN",
    "label": "Commission ledger",
    "domain": "Customers & Marketing",
    "href": "/marketing/affiliates/commissions",
    "legacyRoles": null,
    "sortOrder": 139
  },
  {
    "key": "marketing.affiliates.payouts",
    "parentKey": "marketing.affiliates",
    "kind": "SCREEN",
    "label": "Payouts",
    "domain": "Customers & Marketing",
    "href": "/marketing/affiliates/payouts",
    "legacyRoles": null,
    "sortOrder": 140
  },
  {
    "key": "employees",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Staff",
    "domain": "Staff",
    "href": "/employees",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 141
  },
  {
    "key": "employees.overview",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "All staff",
    "domain": "Staff",
    "href": "/employees",
    "legacyRoles": null,
    "sortOrder": 142
  },
  {
    "key": "employees.new",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "New employee",
    "domain": "Staff",
    "href": "/employees/new",
    "legacyRoles": null,
    "sortOrder": 143
  },
  {
    "key": "employees.roles",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "Job roles",
    "domain": "Staff",
    "href": "/employees/roles",
    "legacyRoles": null,
    "sortOrder": 144
  },
  {
    "key": "employees.attendance",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "Attendance",
    "domain": "Staff",
    "href": "/employees/attendance",
    "legacyRoles": null,
    "sortOrder": 145
  },
  {
    "key": "employees.payroll",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "Payroll",
    "domain": "Staff",
    "href": "/employees/payroll",
    "legacyRoles": null,
    "sortOrder": 146
  },
  {
    "key": "employees.trash",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "Removed staff",
    "domain": "Staff",
    "href": "/employees/trash",
    "legacyRoles": null,
    "sortOrder": 147
  },
  {
    "key": "shop-setup",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Shop setup",
    "domain": "Settings",
    "href": null,
    "legacyRoles": null,
    "sortOrder": 148
  },
  {
    "key": "administration.company",
    "parentKey": "shop-setup",
    "kind": "SCREEN",
    "label": "Company settings",
    "domain": "Settings",
    "href": "/administration/company",
    "legacyRoles": [
      "OWNER"
    ],
    "sortOrder": 149
  },
  {
    "key": "orders.channels",
    "parentKey": "shop-setup",
    "kind": "SCREEN",
    "label": "Sales channels",
    "domain": "Settings",
    "href": "/orders/channels",
    "legacyRoles": null,
    "sortOrder": 150
  },
  {
    "key": "administration.payment-methods",
    "parentKey": "shop-setup",
    "kind": "SCREEN",
    "label": "Payment methods",
    "domain": "Settings",
    "href": "/administration/payment-methods",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 151
  },
  {
    "key": "returns.settings",
    "parentKey": "shop-setup",
    "kind": "SCREEN",
    "label": "Returns settings",
    "domain": "Settings",
    "href": "/returns/settings",
    "legacyRoles": null,
    "sortOrder": 152
  },
  {
    "key": "administration.settings",
    "parentKey": "shop-setup",
    "kind": "SCREEN",
    "label": "All settings",
    "domain": "Settings",
    "href": "/administration/settings",
    "legacyRoles": [
      "OWNER"
    ],
    "sortOrder": 153
  },
  {
    "key": "administration.integrations",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Integrations & keys",
    "domain": "Settings",
    "href": "/administration/integrations",
    "legacyRoles": [
      "OWNER"
    ],
    "sortOrder": 154
  },
  {
    "key": "administration.integrations.overview",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "All keys",
    "domain": "Settings",
    "href": "/administration/integrations",
    "legacyRoles": null,
    "sortOrder": 155
  },
  {
    "key": "administration.integrations.payment",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "Payment gateways",
    "domain": "Settings",
    "href": "/administration/integrations/payment",
    "legacyRoles": null,
    "sortOrder": 156
  },
  {
    "key": "administration.integrations.courier",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "Courier & delivery",
    "domain": "Settings",
    "href": "/administration/integrations/courier",
    "legacyRoles": null,
    "sortOrder": 157
  },
  {
    "key": "administration.integrations.messaging",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "Messaging",
    "domain": "Settings",
    "href": "/administration/integrations/messaging",
    "legacyRoles": null,
    "sortOrder": 158
  },
  {
    "key": "administration.integrations.social",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "Social & ads",
    "domain": "Settings",
    "href": "/administration/integrations/social",
    "legacyRoles": null,
    "sortOrder": 159
  },
  {
    "key": "administration.integrations.analytics",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "Tracking & analytics",
    "domain": "Settings",
    "href": "/administration/integrations/analytics",
    "legacyRoles": null,
    "sortOrder": 160
  },
  {
    "key": "administration",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Access & security",
    "domain": "Settings",
    "href": "/administration",
    "legacyRoles": [
      "OWNER"
    ],
    "sortOrder": 161
  },
  {
    "key": "administration.access",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Access control",
    "domain": "Settings",
    "href": "/administration/access",
    "legacyRoles": null,
    "sortOrder": 162
  },
  {
    "key": "settings.people",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "People & accounts",
    "domain": "Settings",
    "href": "/settings/people",
    "legacyRoles": null,
    "sortOrder": 163
  },
  {
    "key": "settings.audit",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Activity & sessions",
    "domain": "Settings",
    "href": "/settings/audit",
    "legacyRoles": null,
    "sortOrder": 164
  },
  {
    "key": "administration.backup",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Backup & restore",
    "domain": "Settings",
    "href": "/administration/backup",
    "legacyRoles": null,
    "sortOrder": 165
  },
  {
    "key": "settings.me",
    "parentKey": null,
    "kind": "MODULE",
    "label": "My password & PIN",
    "domain": "Settings",
    "href": "/settings/me",
    "legacyRoles": null,
    "sortOrder": 166
  }
];
