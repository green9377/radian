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
    "key": "storefront",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Storefront",
    "domain": "Website",
    "href": "/storefront",
    "legacyRoles": null,
    "sortOrder": 0
  },
  {
    "key": "storefront.overview",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Website",
    "href": "/storefront",
    "legacyRoles": null,
    "sortOrder": 1
  },
  {
    "key": "storefront.layout",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "Homepage",
    "domain": "Website",
    "href": "/storefront/layout",
    "legacyRoles": null,
    "sortOrder": 2
  },
  {
    "key": "storefront.category-page",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "Category pages",
    "domain": "Website",
    "href": "/storefront/category-page",
    "legacyRoles": null,
    "sortOrder": 3
  },
  {
    "key": "storefront.reviews",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "Reviews",
    "domain": "Website",
    "href": "/storefront/reviews",
    "legacyRoles": null,
    "sortOrder": 4
  },
  {
    "key": "storefront.journal",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "Journal",
    "domain": "Website",
    "href": "/storefront/journal",
    "legacyRoles": null,
    "sortOrder": 5
  },
  {
    "key": "storefront.pages",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "Pages & FAQs",
    "domain": "Website",
    "href": "/storefront/pages",
    "legacyRoles": null,
    "sortOrder": 6
  },
  {
    "key": "storefront.hours",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "Visit the shop",
    "domain": "Website",
    "href": "/storefront/hours",
    "legacyRoles": null,
    "sortOrder": 7
  },
  {
    "key": "storefront.footer",
    "parentKey": "storefront",
    "kind": "SCREEN",
    "label": "Footer & menus",
    "domain": "Website",
    "href": "/storefront/footer",
    "legacyRoles": null,
    "sortOrder": 8
  },
  {
    "key": "products",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Products",
    "domain": "Website",
    "href": "/products",
    "legacyRoles": null,
    "sortOrder": 9
  },
  {
    "key": "products.overview",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Website",
    "href": "/products",
    "legacyRoles": null,
    "sortOrder": 10
  },
  {
    "key": "products.list",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "All products",
    "domain": "Website",
    "href": "/products/list",
    "legacyRoles": null,
    "sortOrder": 11
  },
  {
    "key": "products.stock",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Stock",
    "domain": "Website",
    "href": "/products/stock",
    "legacyRoles": null,
    "sortOrder": 12
  },
  {
    "key": "products.margin",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Margin",
    "domain": "Website",
    "href": "/products/margin",
    "legacyRoles": null,
    "sortOrder": 13
  },
  {
    "key": "products.health",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Health",
    "domain": "Website",
    "href": "/products/health",
    "legacyRoles": null,
    "sortOrder": 14
  },
  {
    "key": "products.funnel",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Catalog funnel",
    "domain": "Website",
    "href": "/products/funnel",
    "legacyRoles": null,
    "sortOrder": 15
  },
  {
    "key": "products.addons",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Add-ons",
    "domain": "Website",
    "href": "/products/addons",
    "legacyRoles": null,
    "sortOrder": 16
  },
  {
    "key": "products.upgrades",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Upgrades",
    "domain": "Website",
    "href": "/products/upgrades",
    "legacyRoles": null,
    "sortOrder": 17
  },
  {
    "key": "products.bulk",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Bulk actions",
    "domain": "Website",
    "href": "/products/bulk",
    "legacyRoles": null,
    "sortOrder": 18
  },
  {
    "key": "products.trash",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Trash",
    "domain": "Website",
    "href": "/products/trash",
    "legacyRoles": null,
    "sortOrder": 19
  },
  {
    "key": "catalog",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Catalog",
    "domain": "Website",
    "href": null,
    "legacyRoles": null,
    "sortOrder": 20
  },
  {
    "key": "categories",
    "parentKey": "catalog",
    "kind": "SCREEN",
    "label": "Categories",
    "domain": "Website",
    "href": "/categories",
    "legacyRoles": null,
    "sortOrder": 21
  },
  {
    "key": "tags",
    "parentKey": "catalog",
    "kind": "SCREEN",
    "label": "Occasions & Tags",
    "domain": "Website",
    "href": "/tags",
    "legacyRoles": null,
    "sortOrder": 22
  },
  {
    "key": "brands",
    "parentKey": "catalog",
    "kind": "SCREEN",
    "label": "Brands",
    "domain": "Website",
    "href": "/brands",
    "legacyRoles": null,
    "sortOrder": 23
  },
  {
    "key": "products.variants",
    "parentKey": "catalog",
    "kind": "SCREEN",
    "label": "Variants & options",
    "domain": "Website",
    "href": "/products/variants",
    "legacyRoles": null,
    "sortOrder": 24
  },
  {
    "key": "orders",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Orders",
    "domain": "Website",
    "href": "/orders",
    "legacyRoles": null,
    "sortOrder": 25
  },
  {
    "key": "orders.overview",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Website",
    "href": "/orders",
    "legacyRoles": null,
    "sortOrder": 26
  },
  {
    "key": "orders.list",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "All orders",
    "domain": "Website",
    "href": "/orders/list",
    "legacyRoles": null,
    "sortOrder": 27
  },
  {
    "key": "orders.action",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Needs action",
    "domain": "Website",
    "href": "/orders/action",
    "legacyRoles": null,
    "sortOrder": 28
  },
  {
    "key": "orders.payments",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Payments",
    "domain": "Website",
    "href": "/orders/payments",
    "legacyRoles": null,
    "sortOrder": 29
  },
  {
    "key": "orders.channels",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Sales channels",
    "domain": "Website",
    "href": "/orders/channels",
    "legacyRoles": null,
    "sortOrder": 30
  },
  {
    "key": "orders.recovery",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Recovery",
    "domain": "Website",
    "href": "/orders/recovery",
    "legacyRoles": null,
    "sortOrder": 31
  },
  {
    "key": "orders.scheduled",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Scheduled",
    "domain": "Website",
    "href": "/orders/scheduled",
    "legacyRoles": null,
    "sortOrder": 32
  },
  {
    "key": "orders.cancelled",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Cancelled",
    "domain": "Website",
    "href": "/orders/cancelled",
    "legacyRoles": null,
    "sortOrder": 33
  },
  {
    "key": "orders.reports",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Website",
    "href": "/orders/reports",
    "legacyRoles": null,
    "sortOrder": 34
  },
  {
    "key": "inbox",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Inbox",
    "domain": "Website",
    "href": "/inbox",
    "legacyRoles": null,
    "sortOrder": 35
  },
  {
    "key": "pos",
    "parentKey": null,
    "kind": "MODULE",
    "label": "POS",
    "domain": "Shop",
    "href": "/pos",
    "legacyRoles": null,
    "sortOrder": 36
  },
  {
    "key": "pos.overview",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Shop",
    "href": "/pos",
    "legacyRoles": null,
    "sortOrder": 37
  },
  {
    "key": "pos.sell",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Sell (counter)",
    "domain": "Shop",
    "href": "/pos/sell",
    "legacyRoles": null,
    "sortOrder": 38
  },
  {
    "key": "pos.shift",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Today / Shift",
    "domain": "Shop",
    "href": "/pos/shift",
    "legacyRoles": null,
    "sortOrder": 39
  },
  {
    "key": "pos.sales",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Sales history",
    "domain": "Shop",
    "href": "/pos/sales",
    "legacyRoles": null,
    "sortOrder": 40
  },
  {
    "key": "pos.day-close",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Day-close",
    "domain": "Shop",
    "href": "/pos/day-close",
    "legacyRoles": null,
    "sortOrder": 41
  },
  {
    "key": "pos.due",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Due board",
    "domain": "Shop",
    "href": "/pos/due",
    "legacyRoles": null,
    "sortOrder": 42
  },
  {
    "key": "pos.settings",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Shop",
    "href": "/pos/settings",
    "legacyRoles": null,
    "sortOrder": 43
  },
  {
    "key": "delivery",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Delivery",
    "domain": "Internal",
    "href": "/delivery",
    "legacyRoles": null,
    "sortOrder": 44
  },
  {
    "key": "delivery.overview",
    "parentKey": "delivery",
    "kind": "SCREEN",
    "label": "Fulfilment board",
    "domain": "Internal",
    "href": "/delivery",
    "legacyRoles": null,
    "sortOrder": 45
  },
  {
    "key": "delivery.proof",
    "parentKey": "delivery",
    "kind": "SCREEN",
    "label": "Proof photos",
    "domain": "Internal",
    "href": "/delivery/proof",
    "legacyRoles": null,
    "sortOrder": 46
  },
  {
    "key": "delivery.settle",
    "parentKey": "delivery",
    "kind": "SCREEN",
    "label": "Settle a carrier",
    "domain": "Internal",
    "href": "/delivery/settle",
    "legacyRoles": null,
    "sortOrder": 47
  },
  {
    "key": "delivery.performance",
    "parentKey": "delivery",
    "kind": "SCREEN",
    "label": "Cost & performance",
    "domain": "Internal",
    "href": "/delivery/performance",
    "legacyRoles": null,
    "sortOrder": 48
  },
  {
    "key": "inventory",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Inventory",
    "domain": "Internal",
    "href": "/inventory",
    "legacyRoles": null,
    "sortOrder": 49
  },
  {
    "key": "inventory.overview",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Internal",
    "href": "/inventory",
    "legacyRoles": null,
    "sortOrder": 50
  },
  {
    "key": "inventory.stock",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Stock board",
    "domain": "Internal",
    "href": "/inventory/stock",
    "legacyRoles": null,
    "sortOrder": 51
  },
  {
    "key": "inventory.opening",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Opening stock",
    "domain": "Internal",
    "href": "/inventory/opening",
    "legacyRoles": null,
    "sortOrder": 52
  },
  {
    "key": "inventory.transfer",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Transfer",
    "domain": "Internal",
    "href": "/inventory/transfer",
    "legacyRoles": null,
    "sortOrder": 53
  },
  {
    "key": "inventory.issue",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Wastage & Gift",
    "domain": "Internal",
    "href": "/inventory/issue",
    "legacyRoles": null,
    "sortOrder": 54
  },
  {
    "key": "inventory.stocktake",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Stocktake",
    "domain": "Internal",
    "href": "/inventory/stocktake",
    "legacyRoles": null,
    "sortOrder": 55
  },
  {
    "key": "inventory.movements",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Movements",
    "domain": "Internal",
    "href": "/inventory/movements",
    "legacyRoles": null,
    "sortOrder": 56
  },
  {
    "key": "inventory.warehouses",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Warehouses",
    "domain": "Internal",
    "href": "/inventory/warehouses",
    "legacyRoles": null,
    "sortOrder": 57
  },
  {
    "key": "inventory.reports",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Internal",
    "href": "/inventory/reports",
    "legacyRoles": null,
    "sortOrder": 58
  },
  {
    "key": "inventory.settings",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Internal",
    "href": "/inventory/settings",
    "legacyRoles": null,
    "sortOrder": 59
  },
  {
    "key": "assembly",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Assembly",
    "domain": "Internal",
    "href": "/assembly",
    "legacyRoles": null,
    "sortOrder": 60
  },
  {
    "key": "assembly.overview",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Internal",
    "href": "/assembly",
    "legacyRoles": null,
    "sortOrder": 61
  },
  {
    "key": "assembly.templates",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Templates",
    "domain": "Internal",
    "href": "/assembly/templates",
    "legacyRoles": null,
    "sortOrder": 62
  },
  {
    "key": "assembly.pipeline",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Production pipeline",
    "domain": "Internal",
    "href": "/assembly/pipeline",
    "legacyRoles": null,
    "sortOrder": 63
  },
  {
    "key": "assembly.finished",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Finished goods",
    "domain": "Internal",
    "href": "/assembly/finished",
    "legacyRoles": null,
    "sortOrder": 64
  },
  {
    "key": "assembly.wastage",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Wastage",
    "domain": "Internal",
    "href": "/assembly/wastage",
    "legacyRoles": null,
    "sortOrder": 65
  },
  {
    "key": "products.capacity",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Daily capacity",
    "domain": "Internal",
    "href": "/products/capacity",
    "legacyRoles": null,
    "sortOrder": 66
  },
  {
    "key": "assembly.settings",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Internal",
    "href": "/assembly/settings",
    "legacyRoles": null,
    "sortOrder": 67
  },
  {
    "key": "items",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Items",
    "domain": "Internal",
    "href": "/items",
    "legacyRoles": null,
    "sortOrder": 68
  },
  {
    "key": "items.overview",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Internal",
    "href": "/items",
    "legacyRoles": null,
    "sortOrder": 69
  },
  {
    "key": "items.list",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "All items",
    "domain": "Internal",
    "href": "/items/list",
    "legacyRoles": null,
    "sortOrder": 70
  },
  {
    "key": "items.new",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "New item",
    "domain": "Internal",
    "href": "/items/new",
    "legacyRoles": null,
    "sortOrder": 71
  },
  {
    "key": "items.categories",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Item categories",
    "domain": "Internal",
    "href": "/items/categories",
    "legacyRoles": null,
    "sortOrder": 72
  },
  {
    "key": "items.colors",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Colours",
    "domain": "Internal",
    "href": "/items/colors",
    "legacyRoles": null,
    "sortOrder": 73
  },
  {
    "key": "items.sizes",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Sizes",
    "domain": "Internal",
    "href": "/items/sizes",
    "legacyRoles": null,
    "sortOrder": 74
  },
  {
    "key": "items.units",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Units",
    "domain": "Internal",
    "href": "/items/units",
    "legacyRoles": null,
    "sortOrder": 75
  },
  {
    "key": "items.trash",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Trash",
    "domain": "Internal",
    "href": "/items/trash",
    "legacyRoles": null,
    "sortOrder": 76
  },
  {
    "key": "purchases",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Purchases",
    "domain": "Internal",
    "href": "/purchases",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 77
  },
  {
    "key": "purchases.overview",
    "parentKey": "purchases",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Internal",
    "href": "/purchases",
    "legacyRoles": null,
    "sortOrder": 78
  },
  {
    "key": "purchases.list",
    "parentKey": "purchases",
    "kind": "SCREEN",
    "label": "All purchases",
    "domain": "Internal",
    "href": "/purchases/list",
    "legacyRoles": null,
    "sortOrder": 79
  },
  {
    "key": "purchases.new",
    "parentKey": "purchases",
    "kind": "SCREEN",
    "label": "New purchase",
    "domain": "Internal",
    "href": "/purchases/new",
    "legacyRoles": null,
    "sortOrder": 80
  },
  {
    "key": "purchases.returns",
    "parentKey": "purchases",
    "kind": "SCREEN",
    "label": "Returns",
    "domain": "Internal",
    "href": "/purchases/returns",
    "legacyRoles": null,
    "sortOrder": 81
  },
  {
    "key": "purchases.reports",
    "parentKey": "purchases",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Internal",
    "href": "/purchases/reports",
    "legacyRoles": null,
    "sortOrder": 82
  },
  {
    "key": "returns",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Returns & Refunds",
    "domain": "Internal",
    "href": "/returns",
    "legacyRoles": null,
    "sortOrder": 83
  },
  {
    "key": "returns.overview",
    "parentKey": "returns",
    "kind": "SCREEN",
    "label": "Overview (all returns)",
    "domain": "Internal",
    "href": "/returns",
    "legacyRoles": null,
    "sortOrder": 84
  },
  {
    "key": "returns.new",
    "parentKey": "returns",
    "kind": "SCREEN",
    "label": "New return",
    "domain": "Internal",
    "href": "/returns/new",
    "legacyRoles": null,
    "sortOrder": 85
  },
  {
    "key": "finance",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Finance",
    "domain": "Internal",
    "href": "/finance",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 86
  },
  {
    "key": "finance.overview",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Internal",
    "href": "/finance",
    "legacyRoles": null,
    "sortOrder": 87
  },
  {
    "key": "finance.accounts",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Money accounts",
    "domain": "Internal",
    "href": "/finance/accounts",
    "legacyRoles": null,
    "sortOrder": 88
  },
  {
    "key": "finance.chart",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Chart of accounts",
    "domain": "Internal",
    "href": "/finance/chart",
    "legacyRoles": null,
    "sortOrder": 89
  },
  {
    "key": "finance.expenses",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Expenses",
    "domain": "Internal",
    "href": "/finance/expenses",
    "legacyRoles": null,
    "sortOrder": 90
  },
  {
    "key": "finance.income",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Money in & moving",
    "domain": "Internal",
    "href": "/finance/income",
    "legacyRoles": null,
    "sortOrder": 91
  },
  {
    "key": "finance.partners",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Partners",
    "domain": "Internal",
    "href": "/finance/partners",
    "legacyRoles": null,
    "sortOrder": 92
  },
  {
    "key": "finance.recurring",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Monthly bills",
    "domain": "Internal",
    "href": "/finance/recurring",
    "legacyRoles": null,
    "sortOrder": 93
  },
  {
    "key": "finance.staff",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Staff advance & salary",
    "domain": "Internal",
    "href": "/finance/staff",
    "legacyRoles": null,
    "sortOrder": 94
  },
  {
    "key": "finance.carrier",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Cash with carriers",
    "domain": "Internal",
    "href": "/finance/carrier",
    "legacyRoles": null,
    "sortOrder": 95
  },
  {
    "key": "finance.assets",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Assets & loans",
    "domain": "Internal",
    "href": "/finance/assets",
    "legacyRoles": null,
    "sortOrder": 96
  },
  {
    "key": "finance.reports",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Internal",
    "href": "/finance/reports",
    "legacyRoles": null,
    "sortOrder": 97
  },
  {
    "key": "finance.drift",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Books vs reality",
    "domain": "Internal",
    "href": "/finance/drift",
    "legacyRoles": null,
    "sortOrder": 98
  },
  {
    "key": "finance.vat",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "VAT challan (Mushak 6.3)",
    "domain": "Internal",
    "href": "/finance/vat",
    "legacyRoles": null,
    "sortOrder": 99
  },
  {
    "key": "finance.ledger",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Ledger",
    "domain": "Internal",
    "href": "/finance/ledger",
    "legacyRoles": null,
    "sortOrder": 100
  },
  {
    "key": "finance.journal",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Manual journal",
    "domain": "Internal",
    "href": "/finance/journal",
    "legacyRoles": null,
    "sortOrder": 101
  },
  {
    "key": "finance.settings",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Internal",
    "href": "/finance/settings",
    "legacyRoles": null,
    "sortOrder": 102
  },
  {
    "key": "intelligence",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Intelligence",
    "domain": "Internal",
    "href": "/intelligence",
    "legacyRoles": null,
    "sortOrder": 103
  },
  {
    "key": "intelligence.overview",
    "parentKey": "intelligence",
    "kind": "SCREEN",
    "label": "Executive dashboard",
    "domain": "Internal",
    "href": "/intelligence",
    "legacyRoles": null,
    "sortOrder": 104
  },
  {
    "key": "intelligence.analytics",
    "parentKey": "intelligence",
    "kind": "SCREEN",
    "label": "Analytics",
    "domain": "Internal",
    "href": "/intelligence/analytics",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 105
  },
  {
    "key": "intelligence.reports",
    "parentKey": "intelligence",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Internal",
    "href": "/intelligence/reports",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 106
  },
  {
    "key": "intelligence.kpis",
    "parentKey": "intelligence",
    "kind": "SCREEN",
    "label": "Targets & KPIs",
    "domain": "Internal",
    "href": "/intelligence/kpis",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 107
  },
  {
    "key": "intelligence.forecast",
    "parentKey": "intelligence",
    "kind": "SCREEN",
    "label": "Forecast & market",
    "domain": "Internal",
    "href": "/intelligence/forecast",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 108
  },
  {
    "key": "marketing",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Marketing & Growth",
    "domain": "Marketing",
    "href": "/marketing",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 109
  },
  {
    "key": "marketing.overview",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Marketing",
    "href": "/marketing",
    "legacyRoles": null,
    "sortOrder": 110
  },
  {
    "key": "marketing.campaigns",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Campaigns",
    "domain": "Marketing",
    "href": "/marketing/campaigns",
    "legacyRoles": null,
    "sortOrder": 111
  },
  {
    "key": "marketing.campaigns.overview",
    "parentKey": "marketing.campaigns",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Marketing",
    "href": "/marketing/campaigns",
    "legacyRoles": null,
    "sortOrder": 112
  },
  {
    "key": "marketing.campaigns.list",
    "parentKey": "marketing.campaigns",
    "kind": "SCREEN",
    "label": "All campaigns",
    "domain": "Marketing",
    "href": "/marketing/campaigns/list",
    "legacyRoles": null,
    "sortOrder": 113
  },
  {
    "key": "marketing.campaigns.sources",
    "parentKey": "marketing.campaigns",
    "kind": "SCREEN",
    "label": "Order sources",
    "domain": "Marketing",
    "href": "/marketing/campaigns/sources",
    "legacyRoles": null,
    "sortOrder": 114
  },
  {
    "key": "marketing.offers",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Offers & Promotions",
    "domain": "Marketing",
    "href": "/marketing/offers",
    "legacyRoles": null,
    "sortOrder": 115
  },
  {
    "key": "marketing.offers.overview",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Marketing",
    "href": "/marketing/offers",
    "legacyRoles": null,
    "sortOrder": 116
  },
  {
    "key": "marketing.offers.list",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Offers",
    "domain": "Marketing",
    "href": "/marketing/offers/list",
    "legacyRoles": null,
    "sortOrder": 117
  },
  {
    "key": "marketing.offers.coupons",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Coupons",
    "domain": "Marketing",
    "href": "/marketing/offers/coupons",
    "legacyRoles": null,
    "sortOrder": 118
  },
  {
    "key": "marketing.offers.templates",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Templates",
    "domain": "Marketing",
    "href": "/marketing/offers/templates",
    "legacyRoles": null,
    "sortOrder": 119
  },
  {
    "key": "marketing.offers.approvals",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Approvals",
    "domain": "Marketing",
    "href": "/marketing/offers/approvals",
    "legacyRoles": null,
    "sortOrder": 120
  },
  {
    "key": "marketing.offers.settings",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Marketing",
    "href": "/marketing/offers/settings",
    "legacyRoles": null,
    "sortOrder": 121
  },
  {
    "key": "marketing.affiliates",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Affiliates & Partners",
    "domain": "Marketing",
    "href": "/marketing/affiliates",
    "legacyRoles": null,
    "sortOrder": 122
  },
  {
    "key": "marketing.affiliates.overview",
    "parentKey": "marketing.affiliates",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Marketing",
    "href": "/marketing/affiliates",
    "legacyRoles": null,
    "sortOrder": 123
  },
  {
    "key": "marketing.affiliates.list",
    "parentKey": "marketing.affiliates",
    "kind": "SCREEN",
    "label": "All affiliates",
    "domain": "Marketing",
    "href": "/marketing/affiliates/list",
    "legacyRoles": null,
    "sortOrder": 124
  },
  {
    "key": "marketing.affiliates.commissions",
    "parentKey": "marketing.affiliates",
    "kind": "SCREEN",
    "label": "Commission ledger",
    "domain": "Marketing",
    "href": "/marketing/affiliates/commissions",
    "legacyRoles": null,
    "sortOrder": 125
  },
  {
    "key": "marketing.affiliates.payouts",
    "parentKey": "marketing.affiliates",
    "kind": "SCREEN",
    "label": "Payouts",
    "domain": "Marketing",
    "href": "/marketing/affiliates/payouts",
    "legacyRoles": null,
    "sortOrder": 126
  },
  {
    "key": "marketing.occasions",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Occasions & Outreach",
    "domain": "Marketing",
    "href": "/marketing/occasions",
    "legacyRoles": null,
    "sortOrder": 127
  },
  {
    "key": "marketing.occasions.overview",
    "parentKey": "marketing.occasions",
    "kind": "SCREEN",
    "label": "Occasions due",
    "domain": "Marketing",
    "href": "/marketing/occasions",
    "legacyRoles": null,
    "sortOrder": 128
  },
  {
    "key": "marketing.outreach",
    "parentKey": "marketing.occasions",
    "kind": "SCREEN",
    "label": "Contact history",
    "domain": "Marketing",
    "href": "/marketing/outreach",
    "legacyRoles": null,
    "sortOrder": 129
  },
  {
    "key": "marketing.outreach.optouts",
    "parentKey": "marketing.occasions",
    "kind": "SCREEN",
    "label": "Do not contact",
    "domain": "Marketing",
    "href": "/marketing/outreach/optouts",
    "legacyRoles": null,
    "sortOrder": 130
  },
  {
    "key": "marketing.whatsapp",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "WhatsApp",
    "domain": "Marketing",
    "href": "/marketing/whatsapp",
    "legacyRoles": null,
    "sortOrder": 131
  },
  {
    "key": "marketing.messaging",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Email & SMS",
    "domain": "Marketing",
    "href": "/marketing/messaging",
    "legacyRoles": null,
    "sortOrder": 132
  },
  {
    "key": "marketing.recovery",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Recover lost orders",
    "domain": "Marketing",
    "href": "/marketing/recovery",
    "legacyRoles": null,
    "sortOrder": 133
  },
  {
    "key": "marketing.referral",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Referral",
    "domain": "Marketing",
    "href": "/marketing/referral",
    "legacyRoles": null,
    "sortOrder": 134
  },
  {
    "key": "marketing.loyalty",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Loyalty points",
    "domain": "Marketing",
    "href": "/marketing/loyalty",
    "legacyRoles": null,
    "sortOrder": 135
  },
  {
    "key": "marketing.ads",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Ad numbers",
    "domain": "Marketing",
    "href": "/marketing/ads",
    "legacyRoles": null,
    "sortOrder": 136
  },
  {
    "key": "marketing.tracking",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Tracking codes",
    "domain": "Marketing",
    "href": "/marketing/tracking",
    "legacyRoles": null,
    "sortOrder": 137
  },
  {
    "key": "marketing.seo",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "SEO",
    "domain": "Marketing",
    "href": "/marketing/seo",
    "legacyRoles": null,
    "sortOrder": 138
  },
  {
    "key": "marketing.seo.overview",
    "parentKey": "marketing.seo",
    "kind": "SCREEN",
    "label": "Where we stand",
    "domain": "Marketing",
    "href": "/marketing/seo",
    "legacyRoles": null,
    "sortOrder": 139
  },
  {
    "key": "marketing.settings",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Marketing",
    "href": "/marketing/settings",
    "legacyRoles": null,
    "sortOrder": 140
  },
  {
    "key": "customers",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Customers",
    "domain": "People",
    "href": "/customers",
    "legacyRoles": null,
    "sortOrder": 141
  },
  {
    "key": "customers.overview",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "People",
    "href": "/customers",
    "legacyRoles": null,
    "sortOrder": 142
  },
  {
    "key": "customers.list",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "All customers",
    "domain": "People",
    "href": "/customers/list",
    "legacyRoles": null,
    "sortOrder": 143
  },
  {
    "key": "customers.segments",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Segments",
    "domain": "People",
    "href": "/customers/segments",
    "legacyRoles": null,
    "sortOrder": 144
  },
  {
    "key": "customers.risk",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Risk & blocklist",
    "domain": "People",
    "href": "/customers/risk",
    "legacyRoles": null,
    "sortOrder": 145
  },
  {
    "key": "customers.consent",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Consent",
    "domain": "People",
    "href": "/customers/consent",
    "legacyRoles": null,
    "sortOrder": 146
  },
  {
    "key": "customers.duplicates",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Duplicates & merge",
    "domain": "People",
    "href": "/customers/duplicates",
    "legacyRoles": null,
    "sortOrder": 147
  },
  {
    "key": "customers.occasions",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Occasions",
    "domain": "People",
    "href": "/customers/occasions",
    "legacyRoles": null,
    "sortOrder": 148
  },
  {
    "key": "employees",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Staff",
    "domain": "People",
    "href": "/employees",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 149
  },
  {
    "key": "employees.overview",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "All staff",
    "domain": "People",
    "href": "/employees",
    "legacyRoles": null,
    "sortOrder": 150
  },
  {
    "key": "employees.new",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "New employee",
    "domain": "People",
    "href": "/employees/new",
    "legacyRoles": null,
    "sortOrder": 151
  },
  {
    "key": "employees.roles",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "Job roles",
    "domain": "People",
    "href": "/employees/roles",
    "legacyRoles": null,
    "sortOrder": 152
  },
  {
    "key": "employees.attendance",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "Attendance",
    "domain": "People",
    "href": "/employees/attendance",
    "legacyRoles": null,
    "sortOrder": 153
  },
  {
    "key": "employees.payroll",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "Payroll",
    "domain": "People",
    "href": "/employees/payroll",
    "legacyRoles": null,
    "sortOrder": 154
  },
  {
    "key": "employees.trash",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "Removed staff",
    "domain": "People",
    "href": "/employees/trash",
    "legacyRoles": null,
    "sortOrder": 155
  },
  {
    "key": "suppliers",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Suppliers",
    "domain": "People",
    "href": "/suppliers",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 156
  },
  {
    "key": "suppliers.overview",
    "parentKey": "suppliers",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "People",
    "href": "/suppliers",
    "legacyRoles": null,
    "sortOrder": 157
  },
  {
    "key": "suppliers.list",
    "parentKey": "suppliers",
    "kind": "SCREEN",
    "label": "All suppliers",
    "domain": "People",
    "href": "/suppliers/list",
    "legacyRoles": null,
    "sortOrder": 158
  },
  {
    "key": "suppliers.new",
    "parentKey": "suppliers",
    "kind": "SCREEN",
    "label": "New supplier",
    "domain": "People",
    "href": "/suppliers/new",
    "legacyRoles": null,
    "sortOrder": 159
  },
  {
    "key": "suppliers.vendors",
    "parentKey": "suppliers",
    "kind": "SCREEN",
    "label": "Vendors",
    "domain": "People",
    "href": "/suppliers/vendors",
    "legacyRoles": null,
    "sortOrder": 160
  },
  {
    "key": "suppliers.settings",
    "parentKey": "suppliers",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "People",
    "href": "/suppliers/settings",
    "legacyRoles": null,
    "sortOrder": 161
  },
  {
    "key": "delivery-setup",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Delivery setup",
    "domain": "Configuration",
    "href": null,
    "legacyRoles": null,
    "sortOrder": 162
  },
  {
    "key": "delivery.zones",
    "parentKey": "delivery-setup",
    "kind": "SCREEN",
    "label": "Methods & slots",
    "domain": "Configuration",
    "href": "/delivery/zones",
    "legacyRoles": null,
    "sortOrder": 163
  },
  {
    "key": "delivery.riders",
    "parentKey": "delivery-setup",
    "kind": "SCREEN",
    "label": "Riders",
    "domain": "Configuration",
    "href": "/delivery/riders",
    "legacyRoles": null,
    "sortOrder": 164
  },
  {
    "key": "delivery.setup",
    "parentKey": "delivery-setup",
    "kind": "SCREEN",
    "label": "Setup",
    "domain": "Configuration",
    "href": "/delivery/setup",
    "legacyRoles": null,
    "sortOrder": 165
  },
  {
    "key": "returns.settings",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Returns settings",
    "domain": "Configuration",
    "href": "/returns/settings",
    "legacyRoles": null,
    "sortOrder": 166
  },
  {
    "key": "administration",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Administration",
    "domain": "Configuration",
    "href": "/administration",
    "legacyRoles": [
      "OWNER"
    ],
    "sortOrder": 167
  },
  {
    "key": "administration.overview",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Configuration",
    "href": "/administration",
    "legacyRoles": null,
    "sortOrder": 168
  },
  {
    "key": "administration.access",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Access control",
    "domain": "Configuration",
    "href": "/administration/access",
    "legacyRoles": null,
    "sortOrder": 169
  },
  {
    "key": "settings.people",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "People & accounts",
    "domain": "Configuration",
    "href": "/settings/people",
    "legacyRoles": null,
    "sortOrder": 170
  },
  {
    "key": "settings.audit",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Activity & audit",
    "domain": "Configuration",
    "href": "/settings/audit",
    "legacyRoles": null,
    "sortOrder": 171
  },
  {
    "key": "administration.company",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Company settings",
    "domain": "Configuration",
    "href": "/administration/company",
    "legacyRoles": null,
    "sortOrder": 172
  },
  {
    "key": "administration.settings",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "All settings",
    "domain": "Configuration",
    "href": "/administration/settings",
    "legacyRoles": null,
    "sortOrder": 173
  },
  {
    "key": "administration.backup",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Backup & restore",
    "domain": "Configuration",
    "href": "/administration/backup",
    "legacyRoles": null,
    "sortOrder": 174
  },
  {
    "key": "administration.sessions",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Signed in now",
    "domain": "Configuration",
    "href": "/administration/sessions",
    "legacyRoles": null,
    "sortOrder": 175
  },
  {
    "key": "administration.integrations",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Integrations & keys",
    "domain": "Configuration",
    "href": "/administration/integrations",
    "legacyRoles": null,
    "sortOrder": 176
  },
  {
    "key": "administration.integrations.overview",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "All keys",
    "domain": "Configuration",
    "href": "/administration/integrations",
    "legacyRoles": null,
    "sortOrder": 177
  },
  {
    "key": "administration.integrations.payment",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "Payment gateways",
    "domain": "Configuration",
    "href": "/administration/integrations/payment",
    "legacyRoles": null,
    "sortOrder": 178
  },
  {
    "key": "administration.integrations.courier",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "Courier & delivery",
    "domain": "Configuration",
    "href": "/administration/integrations/courier",
    "legacyRoles": null,
    "sortOrder": 179
  },
  {
    "key": "administration.integrations.messaging",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "Messaging",
    "domain": "Configuration",
    "href": "/administration/integrations/messaging",
    "legacyRoles": null,
    "sortOrder": 180
  },
  {
    "key": "administration.integrations.social",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "Social & ads",
    "domain": "Configuration",
    "href": "/administration/integrations/social",
    "legacyRoles": null,
    "sortOrder": 181
  },
  {
    "key": "administration.integrations.analytics",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "Tracking & analytics",
    "domain": "Configuration",
    "href": "/administration/integrations/analytics",
    "legacyRoles": null,
    "sortOrder": 182
  },
  {
    "key": "settings.me",
    "parentKey": null,
    "kind": "MODULE",
    "label": "My password & PIN",
    "domain": "Configuration",
    "href": "/settings/me",
    "legacyRoles": null,
    "sortOrder": 183
  }
];
