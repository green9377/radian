/*  THE ONE LIST  —  ADM-D05 / ADM-RULE-001
 *
 *  এই ফাইলটা হাতে লেখা হয়নি। AdminSidebar.tsx থেকে বের করা — ১৫৯টা পর্দা,
 *  একটাও ডুপ্লিকেট নয়, সাইডবারের গোনা সংখ্যার সাথে হুবহু মিলেছে।
 *
 *  কেন এটা API-তে, panel-এ নয়: আগে দুটো তালিকা ছিল — সাইডবারের roles: array
 *  আর controller-এর @Roles — আর কেউ মেলাত না। Intelligence বানানোর দিন সাইডবারে
 *  roles বসানোয় STAFF-এর কাছ থেকে পুরো module লুকিয়ে গিয়েছিল, অথচ সিদ্ধান্ত ছিল
 *  উল্টো আর API খোলাই ছিল। কোনো error হয়নি।
 *
 *  এখন তালিকা একটাই, আর সেটা এখানে। সাইডবার এটা পড়বে (GET /administration/menu),
 *  পাহারাও এটা পড়বে। মেলানোর কিছু থাকবে না, কারণ মেলানোর মতো দ্বিতীয় তালিকা নেই।
 *
 *  legacyRoles = আজ সাইডবারে যা লেখা আছে (১৫৯টার মধ্যে ১১টায়)। শুরুর তিনটে পদ
 *  এখান থেকেই বানানো হয় (ADM-D02), যাতে প্রথম দিন কারও কিছু না বদলায়। নতুন টিক
 *  Position টেবিলে যাবে — এই ফিল্ডটা তখন শুধু ইতিহাস।
 *
 *  ⚠️ নতুন পর্দা যোগ করলে AdminSidebar.tsx-এ যোগ করে এই ফাইলটা আবার তৈরি করতে
 *     হবে। হাতে সারি বসালে ঠিক সেই drift ফিরে আসে যেটা এই module বন্ধ করতে এসেছে।
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
    "key": "products",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Products",
    "domain": "Master Data",
    "href": "/products",
    "legacyRoles": null,
    "sortOrder": 0
  },
  {
    "key": "products.overview",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Master Data",
    "href": "/products",
    "legacyRoles": null,
    "sortOrder": 1
  },
  {
    "key": "products.list",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "All products",
    "domain": "Master Data",
    "href": "/products/list",
    "legacyRoles": null,
    "sortOrder": 2
  },
  {
    "key": "products.stock",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Stock",
    "domain": "Master Data",
    "href": "/products/stock",
    "legacyRoles": null,
    "sortOrder": 3
  },
  {
    "key": "products.margin",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Margin",
    "domain": "Master Data",
    "href": "/products/margin",
    "legacyRoles": null,
    "sortOrder": 4
  },
  {
    "key": "products.health",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Health",
    "domain": "Master Data",
    "href": "/products/health",
    "legacyRoles": null,
    "sortOrder": 5
  },
  {
    "key": "products.funnel",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Catalog funnel",
    "domain": "Master Data",
    "href": "/products/funnel",
    "legacyRoles": null,
    "sortOrder": 6
  },
  {
    "key": "products.variants",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Variants & options",
    "domain": "Master Data",
    "href": "/products/variants",
    "legacyRoles": null,
    "sortOrder": 7
  },
  {
    "key": "products.addons",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Add-ons",
    "domain": "Master Data",
    "href": "/products/addons",
    "legacyRoles": null,
    "sortOrder": 8
  },
  {
    "key": "products.upgrades",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Upgrades",
    "domain": "Master Data",
    "href": "/products/upgrades",
    "legacyRoles": null,
    "sortOrder": 9
  },
  {
    "key": "products.bulk",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Bulk actions",
    "domain": "Master Data",
    "href": "/products/bulk",
    "legacyRoles": null,
    "sortOrder": 10
  },
  {
    "key": "products.trash",
    "parentKey": "products",
    "kind": "SCREEN",
    "label": "Trash",
    "domain": "Master Data",
    "href": "/products/trash",
    "legacyRoles": null,
    "sortOrder": 11
  },
  {
    "key": "items",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Items",
    "domain": "Master Data",
    "href": "/items",
    "legacyRoles": null,
    "sortOrder": 12
  },
  {
    "key": "items.overview",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Master Data",
    "href": "/items",
    "legacyRoles": null,
    "sortOrder": 13
  },
  {
    "key": "items.list",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "All items",
    "domain": "Master Data",
    "href": "/items/list",
    "legacyRoles": null,
    "sortOrder": 14
  },
  {
    "key": "items.new",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "New item",
    "domain": "Master Data",
    "href": "/items/new",
    "legacyRoles": null,
    "sortOrder": 15
  },
  {
    "key": "items.categories",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Item categories",
    "domain": "Master Data",
    "href": "/items/categories",
    "legacyRoles": null,
    "sortOrder": 16
  },
  {
    "key": "items.colors",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Colours",
    "domain": "Master Data",
    "href": "/items/colors",
    "legacyRoles": null,
    "sortOrder": 17
  },
  {
    "key": "items.sizes",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Sizes",
    "domain": "Master Data",
    "href": "/items/sizes",
    "legacyRoles": null,
    "sortOrder": 18
  },
  {
    "key": "items.units",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Units",
    "domain": "Master Data",
    "href": "/items/units",
    "legacyRoles": null,
    "sortOrder": 19
  },
  {
    "key": "items.trash",
    "parentKey": "items",
    "kind": "SCREEN",
    "label": "Trash",
    "domain": "Master Data",
    "href": "/items/trash",
    "legacyRoles": null,
    "sortOrder": 20
  },
  {
    "key": "categories",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Categories",
    "domain": "Master Data",
    "href": "/categories",
    "legacyRoles": null,
    "sortOrder": 21
  },
  {
    "key": "tags",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Occasions & Tags",
    "domain": "Master Data",
    "href": "/tags",
    "legacyRoles": null,
    "sortOrder": 22
  },
  {
    "key": "brands",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Brands",
    "domain": "Master Data",
    "href": "/brands",
    "legacyRoles": null,
    "sortOrder": 23
  },
  {
    "key": "customers",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Customers",
    "domain": "Master Data",
    "href": "/customers",
    "legacyRoles": null,
    "sortOrder": 24
  },
  {
    "key": "customers.overview",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Master Data",
    "href": "/customers",
    "legacyRoles": null,
    "sortOrder": 25
  },
  {
    "key": "customers.list",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "All customers",
    "domain": "Master Data",
    "href": "/customers/list",
    "legacyRoles": null,
    "sortOrder": 26
  },
  {
    "key": "customers.segments",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Segments",
    "domain": "Master Data",
    "href": "/customers/segments",
    "legacyRoles": null,
    "sortOrder": 27
  },
  {
    "key": "customers.risk",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Risk & blocklist",
    "domain": "Master Data",
    "href": "/customers/risk",
    "legacyRoles": null,
    "sortOrder": 28
  },
  {
    "key": "customers.consent",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Consent",
    "domain": "Master Data",
    "href": "/customers/consent",
    "legacyRoles": null,
    "sortOrder": 29
  },
  {
    "key": "customers.duplicates",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Duplicates & merge",
    "domain": "Master Data",
    "href": "/customers/duplicates",
    "legacyRoles": null,
    "sortOrder": 30
  },
  {
    "key": "customers.occasions",
    "parentKey": "customers",
    "kind": "SCREEN",
    "label": "Occasions",
    "domain": "Master Data",
    "href": "/customers/occasions",
    "legacyRoles": null,
    "sortOrder": 31
  },
  {
    "key": "suppliers",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Suppliers",
    "domain": "Master Data",
    "href": "/suppliers",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 32
  },
  {
    "key": "suppliers.overview",
    "parentKey": "suppliers",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Master Data",
    "href": "/suppliers",
    "legacyRoles": null,
    "sortOrder": 33
  },
  {
    "key": "suppliers.list",
    "parentKey": "suppliers",
    "kind": "SCREEN",
    "label": "All suppliers",
    "domain": "Master Data",
    "href": "/suppliers/list",
    "legacyRoles": null,
    "sortOrder": 34
  },
  {
    "key": "suppliers.new",
    "parentKey": "suppliers",
    "kind": "SCREEN",
    "label": "New supplier",
    "domain": "Master Data",
    "href": "/suppliers/new",
    "legacyRoles": null,
    "sortOrder": 35
  },
  {
    "key": "suppliers.vendors",
    "parentKey": "suppliers",
    "kind": "SCREEN",
    "label": "Vendors",
    "domain": "Master Data",
    "href": "/suppliers/vendors",
    "legacyRoles": null,
    "sortOrder": 36
  },
  {
    "key": "suppliers.settings",
    "parentKey": "suppliers",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Master Data",
    "href": "/suppliers/settings",
    "legacyRoles": null,
    "sortOrder": 37
  },
  {
    "key": "employees",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Staff",
    "domain": "Master Data",
    "href": "/employees",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 38
  },
  {
    "key": "employees.overview",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "All staff",
    "domain": "Master Data",
    "href": "/employees",
    "legacyRoles": null,
    "sortOrder": 39
  },
  {
    "key": "employees.new",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "New employee",
    "domain": "Master Data",
    "href": "/employees/new",
    "legacyRoles": null,
    "sortOrder": 40
  },
  {
    "key": "employees.roles",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "Job roles",
    "domain": "Master Data",
    "href": "/employees/roles",
    "legacyRoles": null,
    "sortOrder": 41
  },
  {
    "key": "employees.attendance",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "Attendance",
    "domain": "Master Data",
    "href": "/employees/attendance",
    "legacyRoles": null,
    "sortOrder": 42
  },
  {
    "key": "employees.payroll",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "Payroll",
    "domain": "Master Data",
    "href": "/employees/payroll",
    "legacyRoles": null,
    "sortOrder": 43
  },
  {
    "key": "employees.trash",
    "parentKey": "employees",
    "kind": "SCREEN",
    "label": "Removed staff",
    "domain": "Master Data",
    "href": "/employees/trash",
    "legacyRoles": null,
    "sortOrder": 44
  },
  {
    "key": "orders",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Orders",
    "domain": "Commerce",
    "href": "/orders",
    "legacyRoles": null,
    "sortOrder": 45
  },
  {
    "key": "orders.overview",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Commerce",
    "href": "/orders",
    "legacyRoles": null,
    "sortOrder": 46
  },
  {
    "key": "orders.list",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "All orders",
    "domain": "Commerce",
    "href": "/orders/list",
    "legacyRoles": null,
    "sortOrder": 47
  },
  {
    "key": "orders.action",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Needs action",
    "domain": "Commerce",
    "href": "/orders/action",
    "legacyRoles": null,
    "sortOrder": 48
  },
  {
    "key": "orders.payments",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Payments",
    "domain": "Commerce",
    "href": "/orders/payments",
    "legacyRoles": null,
    "sortOrder": 49
  },
  {
    "key": "orders.channels",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Sales channels",
    "domain": "Commerce",
    "href": "/orders/channels",
    "legacyRoles": null,
    "sortOrder": 50
  },
  {
    "key": "orders.recovery",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Recovery",
    "domain": "Commerce",
    "href": "/orders/recovery",
    "legacyRoles": null,
    "sortOrder": 51
  },
  {
    "key": "orders.scheduled",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Scheduled",
    "domain": "Commerce",
    "href": "/orders/scheduled",
    "legacyRoles": null,
    "sortOrder": 52
  },
  {
    "key": "orders.cancelled",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Cancelled",
    "domain": "Commerce",
    "href": "/orders/cancelled",
    "legacyRoles": null,
    "sortOrder": 53
  },
  {
    "key": "orders.reports",
    "parentKey": "orders",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Commerce",
    "href": "/orders/reports",
    "legacyRoles": null,
    "sortOrder": 54
  },
  {
    "key": "pos",
    "parentKey": null,
    "kind": "MODULE",
    "label": "POS",
    "domain": "Commerce",
    "href": "/pos",
    "legacyRoles": null,
    "sortOrder": 55
  },
  {
    "key": "pos.overview",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Commerce",
    "href": "/pos",
    "legacyRoles": null,
    "sortOrder": 56
  },
  {
    "key": "pos.sell",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Sell (counter)",
    "domain": "Commerce",
    "href": "/pos/sell",
    "legacyRoles": null,
    "sortOrder": 57
  },
  {
    "key": "pos.shift",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Today / Shift",
    "domain": "Commerce",
    "href": "/pos/shift",
    "legacyRoles": null,
    "sortOrder": 58
  },
  {
    "key": "pos.sales",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Sales history",
    "domain": "Commerce",
    "href": "/pos/sales",
    "legacyRoles": null,
    "sortOrder": 59
  },
  {
    "key": "pos.day-close",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Day-close",
    "domain": "Commerce",
    "href": "/pos/day-close",
    "legacyRoles": null,
    "sortOrder": 60
  },
  {
    "key": "pos.due",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Due board",
    "domain": "Commerce",
    "href": "/pos/due",
    "legacyRoles": null,
    "sortOrder": 61
  },
  {
    "key": "pos.settings",
    "parentKey": "pos",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Commerce",
    "href": "/pos/settings",
    "legacyRoles": null,
    "sortOrder": 62
  },
  {
    "key": "returns",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Returns & Refunds",
    "domain": "Commerce",
    "href": "/returns",
    "legacyRoles": null,
    "sortOrder": 63
  },
  {
    "key": "returns.overview",
    "parentKey": "returns",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Commerce",
    "href": "/returns",
    "legacyRoles": null,
    "sortOrder": 64
  },
  {
    "key": "returns.new",
    "parentKey": "returns",
    "kind": "SCREEN",
    "label": "New return",
    "domain": "Commerce",
    "href": "/returns/new",
    "legacyRoles": null,
    "sortOrder": 65
  },
  {
    "key": "returns.settings",
    "parentKey": "returns",
    "kind": "SCREEN",
    "label": "Reasons & settings",
    "domain": "Commerce",
    "href": "/returns/settings",
    "legacyRoles": null,
    "sortOrder": 66
  },
  {
    "key": "purchases",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Purchases",
    "domain": "Commerce",
    "href": "/purchases",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 67
  },
  {
    "key": "purchases.overview",
    "parentKey": "purchases",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Commerce",
    "href": "/purchases",
    "legacyRoles": null,
    "sortOrder": 68
  },
  {
    "key": "purchases.list",
    "parentKey": "purchases",
    "kind": "SCREEN",
    "label": "All purchases",
    "domain": "Commerce",
    "href": "/purchases/list",
    "legacyRoles": null,
    "sortOrder": 69
  },
  {
    "key": "purchases.new",
    "parentKey": "purchases",
    "kind": "SCREEN",
    "label": "New purchase",
    "domain": "Commerce",
    "href": "/purchases/new",
    "legacyRoles": null,
    "sortOrder": 70
  },
  {
    "key": "purchases.returns",
    "parentKey": "purchases",
    "kind": "SCREEN",
    "label": "Returns",
    "domain": "Commerce",
    "href": "/purchases/returns",
    "legacyRoles": null,
    "sortOrder": 71
  },
  {
    "key": "purchases.reports",
    "parentKey": "purchases",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Commerce",
    "href": "/purchases/reports",
    "legacyRoles": null,
    "sortOrder": 72
  },
  {
    "key": "inventory",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Inventory",
    "domain": "Operations",
    "href": "/inventory",
    "legacyRoles": null,
    "sortOrder": 73
  },
  {
    "key": "inventory.overview",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Operations",
    "href": "/inventory",
    "legacyRoles": null,
    "sortOrder": 74
  },
  {
    "key": "inventory.stock",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Stock board",
    "domain": "Operations",
    "href": "/inventory/stock",
    "legacyRoles": null,
    "sortOrder": 75
  },
  {
    "key": "inventory.opening",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Opening stock",
    "domain": "Operations",
    "href": "/inventory/opening",
    "legacyRoles": null,
    "sortOrder": 76
  },
  {
    "key": "inventory.transfer",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Transfer",
    "domain": "Operations",
    "href": "/inventory/transfer",
    "legacyRoles": null,
    "sortOrder": 77
  },
  {
    "key": "inventory.issue",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Wastage & Gift",
    "domain": "Operations",
    "href": "/inventory/issue",
    "legacyRoles": null,
    "sortOrder": 78
  },
  {
    "key": "inventory.stocktake",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Stocktake",
    "domain": "Operations",
    "href": "/inventory/stocktake",
    "legacyRoles": null,
    "sortOrder": 79
  },
  {
    "key": "inventory.movements",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Movements",
    "domain": "Operations",
    "href": "/inventory/movements",
    "legacyRoles": null,
    "sortOrder": 80
  },
  {
    "key": "inventory.reports",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Operations",
    "href": "/inventory/reports",
    "legacyRoles": null,
    "sortOrder": 81
  },
  {
    "key": "inventory.settings",
    "parentKey": "inventory",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Operations",
    "href": "/inventory/settings",
    "legacyRoles": null,
    "sortOrder": 82
  },
  {
    "key": "assembly",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Assembly",
    "domain": "Operations",
    "href": "/assembly",
    "legacyRoles": null,
    "sortOrder": 83
  },
  {
    "key": "assembly.overview",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Operations",
    "href": "/assembly",
    "legacyRoles": null,
    "sortOrder": 84
  },
  {
    "key": "assembly.templates",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Templates",
    "domain": "Operations",
    "href": "/assembly/templates",
    "legacyRoles": null,
    "sortOrder": 85
  },
  {
    "key": "assembly.pipeline",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Production pipeline",
    "domain": "Operations",
    "href": "/assembly/pipeline",
    "legacyRoles": null,
    "sortOrder": 86
  },
  {
    "key": "assembly.finished",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Finished goods",
    "domain": "Operations",
    "href": "/assembly/finished",
    "legacyRoles": null,
    "sortOrder": 87
  },
  {
    "key": "assembly.wastage",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Wastage",
    "domain": "Operations",
    "href": "/assembly/wastage",
    "legacyRoles": null,
    "sortOrder": 88
  },
  {
    "key": "assembly.settings",
    "parentKey": "assembly",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Operations",
    "href": "/assembly/settings",
    "legacyRoles": null,
    "sortOrder": 89
  },
  {
    "key": "delivery",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Delivery",
    "domain": "Operations",
    "href": "/delivery",
    "legacyRoles": null,
    "sortOrder": 90
  },
  {
    "key": "delivery.overview",
    "parentKey": "delivery",
    "kind": "SCREEN",
    "label": "Fulfilment board",
    "domain": "Operations",
    "href": "/delivery",
    "legacyRoles": null,
    "sortOrder": 91
  },
  {
    "key": "delivery.riders",
    "parentKey": "delivery",
    "kind": "SCREEN",
    "label": "Riders",
    "domain": "Operations",
    "href": "/delivery/riders",
    "legacyRoles": null,
    "sortOrder": 92
  },
  {
    "key": "delivery.couriers",
    "parentKey": "delivery",
    "kind": "SCREEN",
    "label": "Couriers",
    "domain": "Operations",
    "href": "/delivery/couriers",
    "legacyRoles": null,
    "sortOrder": 93
  },
  {
    "key": "delivery.zones",
    "parentKey": "delivery",
    "kind": "SCREEN",
    "label": "Methods & slots",
    "domain": "Operations",
    "href": "/delivery/zones",
    "legacyRoles": null,
    "sortOrder": 94
  },
  {
    "key": "delivery.proof",
    "parentKey": "delivery",
    "kind": "SCREEN",
    "label": "Proof photos",
    "domain": "Operations",
    "href": "/delivery/proof",
    "legacyRoles": null,
    "sortOrder": 95
  },
  {
    "key": "delivery.setup",
    "parentKey": "delivery",
    "kind": "SCREEN",
    "label": "Setup",
    "domain": "Operations",
    "href": "/delivery/setup",
    "legacyRoles": null,
    "sortOrder": 96
  },
  {
    "key": "delivery.performance",
    "parentKey": "delivery",
    "kind": "SCREEN",
    "label": "Cost & performance",
    "domain": "Operations",
    "href": "/delivery/performance",
    "legacyRoles": null,
    "sortOrder": 97
  },
  {
    "key": "marketing",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Marketing & Growth",
    "domain": "Marketing & Growth",
    "href": "/marketing",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 98
  },
  {
    "key": "marketing.overview",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Marketing & Growth",
    "href": "/marketing",
    "legacyRoles": null,
    "sortOrder": 99
  },
  {
    "key": "marketing.campaigns",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Campaigns",
    "domain": "Marketing & Growth",
    "href": "/marketing/campaigns",
    "legacyRoles": null,
    "sortOrder": 100
  },
  {
    "key": "marketing.campaigns.overview",
    "parentKey": "marketing.campaigns",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Marketing & Growth",
    "href": "/marketing/campaigns",
    "legacyRoles": null,
    "sortOrder": 101
  },
  {
    "key": "marketing.campaigns.list",
    "parentKey": "marketing.campaigns",
    "kind": "SCREEN",
    "label": "All campaigns",
    "domain": "Marketing & Growth",
    "href": "/marketing/campaigns/list",
    "legacyRoles": null,
    "sortOrder": 102
  },
  {
    "key": "marketing.campaigns.sources",
    "parentKey": "marketing.campaigns",
    "kind": "SCREEN",
    "label": "Order sources",
    "domain": "Marketing & Growth",
    "href": "/marketing/campaigns/sources",
    "legacyRoles": null,
    "sortOrder": 103
  },
  {
    "key": "marketing.offers",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Offers & Promotions",
    "domain": "Marketing & Growth",
    "href": "/marketing/offers",
    "legacyRoles": null,
    "sortOrder": 104
  },
  {
    "key": "marketing.offers.overview",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Marketing & Growth",
    "href": "/marketing/offers",
    "legacyRoles": null,
    "sortOrder": 105
  },
  {
    "key": "marketing.offers.list",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Offers",
    "domain": "Marketing & Growth",
    "href": "/marketing/offers/list",
    "legacyRoles": null,
    "sortOrder": 106
  },
  {
    "key": "marketing.offers.coupons",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Coupons",
    "domain": "Marketing & Growth",
    "href": "/marketing/offers/coupons",
    "legacyRoles": null,
    "sortOrder": 107
  },
  {
    "key": "marketing.offers.templates",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Templates",
    "domain": "Marketing & Growth",
    "href": "/marketing/offers/templates",
    "legacyRoles": null,
    "sortOrder": 108
  },
  {
    "key": "marketing.offers.approvals",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Approvals",
    "domain": "Marketing & Growth",
    "href": "/marketing/offers/approvals",
    "legacyRoles": null,
    "sortOrder": 109
  },
  {
    "key": "marketing.offers.settings",
    "parentKey": "marketing.offers",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Marketing & Growth",
    "href": "/marketing/offers/settings",
    "legacyRoles": null,
    "sortOrder": 110
  },
  {
    "key": "marketing.affiliates",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Affiliates & Partners",
    "domain": "Marketing & Growth",
    "href": "/marketing/affiliates",
    "legacyRoles": null,
    "sortOrder": 111
  },
  {
    "key": "marketing.affiliates.overview",
    "parentKey": "marketing.affiliates",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Marketing & Growth",
    "href": "/marketing/affiliates",
    "legacyRoles": null,
    "sortOrder": 112
  },
  {
    "key": "marketing.affiliates.list",
    "parentKey": "marketing.affiliates",
    "kind": "SCREEN",
    "label": "All affiliates",
    "domain": "Marketing & Growth",
    "href": "/marketing/affiliates/list",
    "legacyRoles": null,
    "sortOrder": 113
  },
  {
    "key": "marketing.affiliates.commissions",
    "parentKey": "marketing.affiliates",
    "kind": "SCREEN",
    "label": "Commission ledger",
    "domain": "Marketing & Growth",
    "href": "/marketing/affiliates/commissions",
    "legacyRoles": null,
    "sortOrder": 114
  },
  {
    "key": "marketing.affiliates.payouts",
    "parentKey": "marketing.affiliates",
    "kind": "SCREEN",
    "label": "Payouts",
    "domain": "Marketing & Growth",
    "href": "/marketing/affiliates/payouts",
    "legacyRoles": null,
    "sortOrder": 115
  },
  {
    "key": "marketing.occasions",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Occasions & Outreach",
    "domain": "Marketing & Growth",
    "href": "/marketing/occasions",
    "legacyRoles": null,
    "sortOrder": 116
  },
  {
    "key": "marketing.occasions.overview",
    "parentKey": "marketing.occasions",
    "kind": "SCREEN",
    "label": "Occasions due",
    "domain": "Marketing & Growth",
    "href": "/marketing/occasions",
    "legacyRoles": null,
    "sortOrder": 117
  },
  {
    "key": "marketing.outreach",
    "parentKey": "marketing.occasions",
    "kind": "SCREEN",
    "label": "Contact history",
    "domain": "Marketing & Growth",
    "href": "/marketing/outreach",
    "legacyRoles": null,
    "sortOrder": 118
  },
  {
    "key": "marketing.outreach.optouts",
    "parentKey": "marketing.occasions",
    "kind": "SCREEN",
    "label": "Do not contact",
    "domain": "Marketing & Growth",
    "href": "/marketing/outreach/optouts",
    "legacyRoles": null,
    "sortOrder": 119
  },
  {
    "key": "marketing.whatsapp",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "WhatsApp",
    "domain": "Marketing & Growth",
    "href": "/marketing/whatsapp",
    "legacyRoles": null,
    "sortOrder": 120
  },
  {
    "key": "marketing.messaging",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Email & SMS",
    "domain": "Marketing & Growth",
    "href": "/marketing/messaging",
    "legacyRoles": null,
    "sortOrder": 121
  },
  {
    "key": "marketing.referral",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Referral",
    "domain": "Marketing & Growth",
    "href": "/marketing/referral",
    "legacyRoles": null,
    "sortOrder": 122
  },
  {
    "key": "marketing.loyalty",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Loyalty points",
    "domain": "Marketing & Growth",
    "href": "/marketing/loyalty",
    "legacyRoles": null,
    "sortOrder": 123
  },
  {
    "key": "marketing.ads",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Ad numbers",
    "domain": "Marketing & Growth",
    "href": "/marketing/ads",
    "legacyRoles": null,
    "sortOrder": 124
  },
  {
    "key": "marketing.tracking",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Tracking codes",
    "domain": "Marketing & Growth",
    "href": "/marketing/tracking",
    "legacyRoles": null,
    "sortOrder": 125
  },
  {
    "key": "marketing.seo",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "SEO",
    "domain": "Marketing & Growth",
    "href": "/marketing/seo",
    "legacyRoles": null,
    "sortOrder": 126
  },
  {
    "key": "marketing.seo.overview",
    "parentKey": "marketing.seo",
    "kind": "SCREEN",
    "label": "Where we stand",
    "domain": "Marketing & Growth",
    "href": "/marketing/seo",
    "legacyRoles": null,
    "sortOrder": 127
  },
  {
    "key": "marketing.seo?tab=pages",
    "parentKey": "marketing.seo",
    "kind": "SCREEN",
    "label": "Pages",
    "domain": "Marketing & Growth",
    "href": "/marketing/seo?tab=pages",
    "legacyRoles": null,
    "sortOrder": 128
  },
  {
    "key": "marketing.seo?tab=redirects",
    "parentKey": "marketing.seo",
    "kind": "SCREEN",
    "label": "Old links",
    "domain": "Marketing & Growth",
    "href": "/marketing/seo?tab=redirects",
    "legacyRoles": null,
    "sortOrder": 129
  },
  {
    "key": "marketing.seo?tab=settings",
    "parentKey": "marketing.seo",
    "kind": "SCREEN",
    "label": "Site-wide",
    "domain": "Marketing & Growth",
    "href": "/marketing/seo?tab=settings",
    "legacyRoles": null,
    "sortOrder": 130
  },
  {
    "key": "marketing.settings",
    "parentKey": "marketing",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Marketing & Growth",
    "href": "/marketing/settings",
    "legacyRoles": null,
    "sortOrder": 131
  },
  {
    "key": "finance",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Finance",
    "domain": "Finance",
    "href": "/finance",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 132
  },
  {
    "key": "finance.overview",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "Finance",
    "href": "/finance",
    "legacyRoles": null,
    "sortOrder": 133
  },
  {
    "key": "finance.accounts",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Money accounts",
    "domain": "Finance",
    "href": "/finance/accounts",
    "legacyRoles": null,
    "sortOrder": 134
  },
  {
    "key": "finance.chart",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Chart of accounts",
    "domain": "Finance",
    "href": "/finance/chart",
    "legacyRoles": null,
    "sortOrder": 135
  },
  {
    "key": "finance.expenses",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Expenses",
    "domain": "Finance",
    "href": "/finance/expenses",
    "legacyRoles": null,
    "sortOrder": 136
  },
  {
    "key": "finance.income",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Money in & moving",
    "domain": "Finance",
    "href": "/finance/income",
    "legacyRoles": null,
    "sortOrder": 137
  },
  {
    "key": "finance.partners",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Partners",
    "domain": "Finance",
    "href": "/finance/partners",
    "legacyRoles": null,
    "sortOrder": 138
  },
  {
    "key": "finance.recurring",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Monthly bills",
    "domain": "Finance",
    "href": "/finance/recurring",
    "legacyRoles": null,
    "sortOrder": 139
  },
  {
    "key": "finance.staff",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Staff advance & salary",
    "domain": "Finance",
    "href": "/finance/staff",
    "legacyRoles": null,
    "sortOrder": 140
  },
  {
    "key": "finance.carrier",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Cash with carriers",
    "domain": "Finance",
    "href": "/finance/carrier",
    "legacyRoles": null,
    "sortOrder": 141
  },
  {
    "key": "finance.assets",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Assets & loans",
    "domain": "Finance",
    "href": "/finance/assets",
    "legacyRoles": null,
    "sortOrder": 142
  },
  {
    "key": "finance.reports",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Finance",
    "href": "/finance/reports",
    "legacyRoles": null,
    "sortOrder": 143
  },
  {
    "key": "finance.drift",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Books vs reality",
    "domain": "Finance",
    "href": "/finance/drift",
    "legacyRoles": null,
    "sortOrder": 144
  },
  {
    "key": "finance.vat",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "VAT challan (Mushak 6.3)",
    "domain": "Finance",
    "href": "/finance/vat",
    "legacyRoles": null,
    "sortOrder": 145
  },
  {
    "key": "finance.ledger",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Ledger",
    "domain": "Finance",
    "href": "/finance/ledger",
    "legacyRoles": null,
    "sortOrder": 146
  },
  {
    "key": "finance.journal",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Manual journal",
    "domain": "Finance",
    "href": "/finance/journal",
    "legacyRoles": null,
    "sortOrder": 147
  },
  {
    "key": "finance.settings",
    "parentKey": "finance",
    "kind": "SCREEN",
    "label": "Settings",
    "domain": "Finance",
    "href": "/finance/settings",
    "legacyRoles": null,
    "sortOrder": 148
  },
  {
    "key": "intelligence",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Intelligence",
    "domain": "Intelligence",
    "href": "/intelligence",
    "legacyRoles": null,
    "sortOrder": 149
  },
  {
    "key": "intelligence.overview",
    "parentKey": "intelligence",
    "kind": "SCREEN",
    "label": "Executive dashboard",
    "domain": "Intelligence",
    "href": "/intelligence",
    "legacyRoles": null,
    "sortOrder": 150
  },
  {
    "key": "intelligence.analytics",
    "parentKey": "intelligence",
    "kind": "SCREEN",
    "label": "Analytics",
    "domain": "Intelligence",
    "href": "/intelligence/analytics",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 151
  },
  {
    "key": "intelligence.reports",
    "parentKey": "intelligence",
    "kind": "SCREEN",
    "label": "Reports",
    "domain": "Intelligence",
    "href": "/intelligence/reports",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 152
  },
  {
    "key": "intelligence.kpis",
    "parentKey": "intelligence",
    "kind": "SCREEN",
    "label": "Targets & KPIs",
    "domain": "Intelligence",
    "href": "/intelligence/kpis",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 153
  },
  {
    "key": "intelligence.forecast",
    "parentKey": "intelligence",
    "kind": "SCREEN",
    "label": "Forecast & market",
    "domain": "Intelligence",
    "href": "/intelligence/forecast",
    "legacyRoles": [
      "OWNER",
      "MANAGER"
    ],
    "sortOrder": 154
  },
  {
    "key": "administration",
    "parentKey": null,
    "kind": "MODULE",
    "label": "Administration",
    "domain": "System",
    "href": "/administration",
    "legacyRoles": [
      "OWNER"
    ],
    "sortOrder": 155
  },
  {
    "key": "administration.overview",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Overview",
    "domain": "System",
    "href": "/administration",
    "legacyRoles": null,
    "sortOrder": 156
  },
  {
    "key": "administration.access",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Access control",
    "domain": "System",
    "href": "/administration/access",
    "legacyRoles": null,
    "sortOrder": 157
  },
  {
    "key": "settings.people",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "People & accounts",
    "domain": "System",
    "href": "/settings/people",
    "legacyRoles": null,
    "sortOrder": 158
  },
  {
    "key": "settings.audit",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Activity & audit",
    "domain": "System",
    "href": "/settings/audit",
    "legacyRoles": null,
    "sortOrder": 159
  },
  {
    "key": "administration.company",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Company settings",
    "domain": "System",
    "href": "/administration/company",
    "legacyRoles": null,
    "sortOrder": 160
  },
  {
    "key": "administration.settings",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "All settings",
    "domain": "System",
    "href": "/administration/settings",
    "legacyRoles": null,
    "sortOrder": 161
  },
  {
    "key": "administration.backup",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Backup & restore",
    "domain": "System",
    "href": "/administration/backup",
    "legacyRoles": null,
    "sortOrder": 162
  },
  {
    "key": "administration.sessions",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Signed in now",
    "domain": "System",
    "href": "/administration/sessions",
    "legacyRoles": null,
    "sortOrder": 163
  },
  {
    "key": "administration.integrations",
    "parentKey": "administration",
    "kind": "SCREEN",
    "label": "Integrations & keys",
    "domain": "System",
    "href": "/administration/integrations",
    "legacyRoles": null,
    "sortOrder": 164
  },
  {
    "key": "administration.integrations.overview",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "All keys",
    "domain": "System",
    "href": "/administration/integrations",
    "legacyRoles": null,
    "sortOrder": 165
  },
  {
    "key": "administration.integrations.payment",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "Payment gateways",
    "domain": "System",
    "href": "/administration/integrations/payment",
    "legacyRoles": null,
    "sortOrder": 166
  },
  {
    "key": "administration.integrations.courier",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "Courier & delivery",
    "domain": "System",
    "href": "/administration/integrations/courier",
    "legacyRoles": null,
    "sortOrder": 167
  },
  {
    "key": "administration.integrations.messaging",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "Messaging",
    "domain": "System",
    "href": "/administration/integrations/messaging",
    "legacyRoles": null,
    "sortOrder": 168
  },
  {
    "key": "administration.integrations.social",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "Social & ads",
    "domain": "System",
    "href": "/administration/integrations/social",
    "legacyRoles": null,
    "sortOrder": 169
  },
  {
    "key": "administration.integrations.analytics",
    "parentKey": "administration.integrations",
    "kind": "SCREEN",
    "label": "Tracking & analytics",
    "domain": "System",
    "href": "/administration/integrations/analytics",
    "legacyRoles": null,
    "sortOrder": 170
  },
  {
    "key": "settings.me",
    "parentKey": null,
    "kind": "MODULE",
    "label": "My password & PIN",
    "domain": "System",
    "href": "/settings/me",
    "legacyRoles": null,
    "sortOrder": 171
  }
];
