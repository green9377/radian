/*
  Inventory demo data — §১০.৪ demo-fallback pattern: API down/empty → screens run
  on this with the orange "Demo data" badge, and flip back to real data by themselves.
  Deliberately messy on purpose (negative row, low rows, a MAKE_TO_ORDER bouquet)
  so Overview/Stock board show real decisions from day one.
*/
import type { ApiWarehouse, InvMovement, InvOverview, InvStockRow } from "./api";

export const DEMO_WAREHOUSES: ApiWarehouse[] = [
  { id: "wh-shop", code: "SHOP", name: "Shop", isActive: true },
  { id: "wh-store", code: "STORE", name: "Storeroom", isActive: true },
];

const row = (
  p: Partial<InvStockRow> & { itemId: string; sku: string; name: string },
): InvStockRow => ({
  imageUrl: null,
  unitName: "Piece",
  unitShort: "pc",
  assemblyMode: "NONE",
  trackExpiry: false,
  reorderLevel: null,
  perWarehouse: [],
  totalQtyMilli: 0,
  unitCostPaisa: 0,
  valuePaisa: 0,
  canBuild: null,
  isNegative: false,
  isLow: false,
  ...p,
});

export const DEMO_INV_STOCK: InvStockRow[] = [
  row({
    itemId: "d-rose", sku: "RAW-ROSE-RED", name: "Red Rose Stem", unitName: "Stem", unitShort: "stem",
    perWarehouse: [
      { warehouseId: "wh-shop", qtyMilli: 120000 },
      { warehouseId: "wh-store", qtyMilli: 80000 },
    ],
    totalQtyMilli: 200000, unitCostPaisa: 1500, valuePaisa: 300000,
    reorderLevel: 100, isLow: false,
  }),
  row({
    itemId: "d-lily", sku: "RAW-LILY-WHT", name: "White Lily Stick", unitName: "Lily Stick", unitShort: "lilystick",
    perWarehouse: [{ warehouseId: "wh-shop", qtyMilli: 18000 }],
    totalQtyMilli: 18000, unitCostPaisa: 9000, valuePaisa: 162000,
    reorderLevel: 30, isLow: true,
  }),
  row({
    itemId: "d-ribbon", sku: "PKG-RIBBON-SATIN", name: "Satin Ribbon", unitName: "Roll", unitShort: "roll",
    perWarehouse: [{ warehouseId: "wh-store", qtyMilli: -2000 }],
    totalQtyMilli: -2000, unitCostPaisa: 12000, valuePaisa: -24000,
    isNegative: true,
  }),
  row({
    itemId: "d-wrap", sku: "PKG-WRAP-BLK", name: "Black Wrapping Paper", unitName: "Sheet", unitShort: "sheet",
    perWarehouse: [
      { warehouseId: "wh-shop", qtyMilli: 40000 },
      { warehouseId: "wh-store", qtyMilli: 110000 },
    ],
    totalQtyMilli: 150000, unitCostPaisa: 800, valuePaisa: 120000,
    reorderLevel: 50,
  }),
  row({
    itemId: "d-choc", sku: "GFT-CHOC-FERRERO", name: "Ferrero Rocher 16pc", unitName: "Box", unitShort: "box",
    perWarehouse: [{ warehouseId: "wh-shop", qtyMilli: 9000 }],
    totalQtyMilli: 9000, unitCostPaisa: 95000, valuePaisa: 855000,
    trackExpiry: true, reorderLevel: 10, isLow: true,
  }),
  row({
    itemId: "d-teddy", sku: "GFT-TEDDY-M", name: "Teddy Bear (Medium)", unitName: "Piece", unitShort: "pc",
    perWarehouse: [{ warehouseId: "wh-store", qtyMilli: 25000 }],
    totalQtyMilli: 25000, unitCostPaisa: 45000, valuePaisa: 1125000,
  }),
  row({
    itemId: "d-bouquet", sku: "FIN-BOUQ-ROM24", name: "Romantic Red Rose Bouquet", unitName: "Piece", unitShort: "pc",
    assemblyMode: "MAKE_TO_ORDER",
    totalQtyMilli: 0, unitCostPaisa: 65000, valuePaisa: 0,
    canBuild: 5, // min(rose 120÷24, wrap 40÷1, ribbon —) — the derived number, never a stock
  }),
  row({
    itemId: "d-giftbox", sku: "FIN-GIFTBOX-A", name: "Artificial Flower Gift Box", unitName: "Piece", unitShort: "pc",
    assemblyMode: "MAKE_TO_STOCK",
    perWarehouse: [{ warehouseId: "wh-shop", qtyMilli: 6000 }],
    totalQtyMilli: 6000, unitCostPaisa: 78000, valuePaisa: 468000,
    reorderLevel: 4,
  }),
];

export function demoInvStock(params?: { search?: string; filter?: string }): InvStockRow[] {
  let rows = DEMO_INV_STOCK;
  const s = (params?.search ?? "").toLowerCase();
  if (s) rows = rows.filter((r) => r.name.toLowerCase().includes(s) || r.sku.toLowerCase().includes(s));
  if (params?.filter === "low") rows = rows.filter((r) => r.isLow);
  if (params?.filter === "negative") rows = rows.filter((r) => r.isNegative);
  return rows;
}

const daysAgo = (n: number, h = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, 15, 0, 0);
  return d.toISOString();
};

export const DEMO_INV_MOVEMENTS: InvMovement[] = [
  { id: "m1", reason: "PURCHASE", qtyMilli: 100000, unitCostPaisa: 1500, valuePaisa: 150000, note: "PUR-000012 · AB Flower", actor: "sobuj", createdAt: daysAgo(0, 8), item: { sku: "RAW-ROSE-RED", name: "Red Rose Stem" }, warehouse: { code: "STORE", name: "Storeroom" } },
  { id: "m2", reason: "TRANSFER", qtyMilli: -60000, unitCostPaisa: 1500, valuePaisa: -90000, note: "TRF-000004", actor: "sobuj", createdAt: daysAgo(0, 9), item: { sku: "RAW-ROSE-RED", name: "Red Rose Stem" }, warehouse: { code: "STORE", name: "Storeroom" } },
  { id: "m3", reason: "TRANSFER", qtyMilli: 60000, unitCostPaisa: 1500, valuePaisa: 90000, note: "TRF-000004", actor: "sobuj", createdAt: daysAgo(0, 9), item: { sku: "RAW-ROSE-RED", name: "Red Rose Stem" }, warehouse: { code: "SHOP", name: "Shop" } },
  { id: "m4", reason: "SALE", qtyMilli: -24000, unitCostPaisa: 1500, valuePaisa: -36000, note: "RAD-58214 · bouquet ×1", actor: "system", createdAt: daysAgo(0, 12), item: { sku: "RAW-ROSE-RED", name: "Red Rose Stem" }, warehouse: { code: "SHOP", name: "Shop" } },
  { id: "m5", reason: "WASTAGE", qtyMilli: -8000, unitCostPaisa: 1500, valuePaisa: -12000, note: "Rotten — morning sorting", actor: "sobuj", createdAt: daysAgo(1, 19), item: { sku: "RAW-ROSE-RED", name: "Red Rose Stem" }, warehouse: { code: "SHOP", name: "Shop" } },
  { id: "m6", reason: "GIFT", qtyMilli: -1000, unitCostPaisa: 65000, valuePaisa: -65000, note: "Corporate client sample", actor: "sobuj", createdAt: daysAgo(2, 16), item: { sku: "FIN-GIFTBOX-A", name: "Artificial Flower Gift Box" }, warehouse: { code: "SHOP", name: "Shop" } },
  { id: "m7", reason: "ADJUSTMENT", qtyMilli: -2000, unitCostPaisa: 12000, valuePaisa: -24000, note: "STK-000002 mismatch", actor: "sobuj", createdAt: daysAgo(3, 20), item: { sku: "PKG-RIBBON-SATIN", name: "Satin Ribbon" }, warehouse: { code: "STORE", name: "Storeroom" } },
  { id: "m8", reason: "OPENING", qtyMilli: 150000, unitCostPaisa: 800, valuePaisa: 120000, note: "Opening count", actor: "sobuj", createdAt: daysAgo(6, 11), item: { sku: "PKG-WRAP-BLK", name: "Black Wrapping Paper" }, warehouse: { code: "STORE", name: "Storeroom" } },
];

export function demoInvMovements(params?: { reason?: string; warehouseId?: string }): InvMovement[] {
  let rows = DEMO_INV_MOVEMENTS;
  if (params?.reason) rows = rows.filter((r) => r.reason === params.reason);
  return rows;
}

const expSoon = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

export const DEMO_INV_OVERVIEW: InvOverview = {
  needsAttention: {
    negative: DEMO_INV_STOCK.filter((r) => r.isNegative),
    negativeCount: 1,
    low: DEMO_INV_STOCK.filter((r) => r.isLow),
    lowCount: 2,
    expiring: [
      { id: "lot1", expiryDate: expSoon(4), qtyMilli: 5000, item: { sku: "GFT-CHOC-FERRERO", name: "Ferrero Rocher 16pc" } },
    ],
  },
  kpis: {
    totalValuePaisa: DEMO_INV_STOCK.reduce((s, r) => s + Math.max(r.valuePaisa, 0), 0),
    itemCount: DEMO_INV_STOCK.length,
    wastageTodayPaisa: 0,
    wastageMonthPaisa: 41200,
    giftMonthPaisa: 65000,
    movementsToday: 4,
  },
};

/* ---- doc demos (Transfer / Issue history) ---- */
import type { InvIssue, InvTransfer } from "./api";

export const DEMO_INV_TRANSFERS: InvTransfer[] = [
  {
    id: "t1", transferNo: "TRF-000004", fromWarehouseId: "wh-store", toWarehouseId: "wh-shop",
    note: "Morning restock", status: "POSTED", actor: "sobuj", createdAt: daysAgo(0, 9),
    lines: [
      { id: "t1a", itemId: "d-rose", qtyMilli: 60000, item: { sku: "RAW-ROSE-RED", name: "Red Rose Stem" } },
      { id: "t1b", itemId: "d-wrap", qtyMilli: 20000, item: { sku: "PKG-WRAP-BLK", name: "Black Wrapping Paper" } },
    ],
  },
  {
    id: "t2", transferNo: "TRF-000003", fromWarehouseId: "wh-store", toWarehouseId: "wh-shop",
    note: null, status: "POSTED", actor: "sobuj", createdAt: daysAgo(1, 9),
    lines: [{ id: "t2a", itemId: "d-teddy", qtyMilli: 5000, item: { sku: "GFT-TEDDY-M", name: "Teddy Bear (Medium)" } }],
  },
];

export const DEMO_INV_ISSUES: InvIssue[] = [
  {
    id: "i1", issueNo: "WST-000006", kind: "WASTAGE", warehouseId: "wh-shop",
    reason: "Rotten", note: "Morning sorting", totalValuePaisa: 12000, status: "POSTED",
    actor: "sobuj", createdAt: daysAgo(1, 19),
    lines: [{ id: "i1a", itemId: "d-rose", qtyMilli: 8000, unitCostPaisa: 1500, valuePaisa: 12000, item: { sku: "RAW-ROSE-RED", name: "Red Rose Stem" } }],
  },
  {
    id: "i2", issueNo: "WST-000005", kind: "WASTAGE", warehouseId: "wh-shop",
    reason: "Dried out", note: null, totalValuePaisa: 27000, status: "POSTED",
    actor: "sobuj", createdAt: daysAgo(2, 19),
    lines: [{ id: "i2a", itemId: "d-lily", qtyMilli: 3000, unitCostPaisa: 9000, valuePaisa: 27000, item: { sku: "RAW-LILY-WHT", name: "White Lily Stick" } }],
  },
  {
    id: "i3", issueNo: "GFT-000002", kind: "GIFT", warehouseId: "wh-shop",
    reason: "Corporate sample", note: "Sent to client office", totalValuePaisa: 65000, status: "POSTED",
    actor: "sobuj", createdAt: daysAgo(2, 16),
    lines: [{ id: "i3a", itemId: "d-giftbox", qtyMilli: 1000, unitCostPaisa: 65000, valuePaisa: 65000, item: { sku: "FIN-GIFTBOX-A", name: "Artificial Flower Gift Box" } }],
  },
];

export function demoInvIssues(kind?: string): InvIssue[] {
  return kind ? DEMO_INV_ISSUES.filter((i) => i.kind === kind) : DEMO_INV_ISSUES;
}

/* ---- report demo ---- */
import type { InvIssueReport } from "./api";

export function demoInvIssueReport(days = 30): InvIssueReport {
  const series: InvIssueReport["series"] = [];
  let w = 0, g = 0;
  for (let n = days - 1; n >= 0; n--) {
    const d = new Date(); d.setDate(d.getDate() - n);
    // seeded-ish variety: rot spikes after weekend + one big gift day
    const dow = d.getDay();
    const wastage = dow === 6 || dow === 0 ? 0 : (dow === 1 ? 32000 : 8000 + (n % 5) * 3000);
    const gift = n === 12 ? 65000 : n % 9 === 0 ? 15000 : 0;
    w += wastage; g += gift;
    series.push({ date: d.toISOString().slice(0, 10), wastagePaisa: wastage, giftPaisa: gift });
  }
  return { days, series, totalWastagePaisa: w, totalGiftPaisa: g };
}

/* ---- stocktake demo ---- */
import type { InvStocktake } from "./api";

export const DEMO_INV_STOCKTAKES: InvStocktake[] = [
  {
    id: "s1", stocktakeNo: "STK-000002", warehouseId: "wh-store", note: "Weekly count",
    status: "APPLIED", appliedAt: daysAgo(3, 20), actor: "sobuj", createdAt: daysAgo(3, 19),
    lines: [
      { id: "s1a", itemId: "d-ribbon", ledgerQtyMilli: 2000, countedQtyMilli: 0, diffValuePaisa: -24000, item: { sku: "PKG-RIBBON-SATIN", name: "Satin Ribbon" } },
      { id: "s1b", itemId: "d-wrap", ledgerQtyMilli: 110000, countedQtyMilli: 110000, diffValuePaisa: 0, item: { sku: "PKG-WRAP-BLK", name: "Black Wrapping Paper" } },
    ],
  },
];
