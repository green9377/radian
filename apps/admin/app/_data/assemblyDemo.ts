/*
  Assembly v2 — demo fallback (§১০.৪ pattern): API down or empty → screens run
  on this with the orange "Demo data" badge, switch back to real data on their own.
  RADIAN_ASSEMBLY_MODULE_ARCHITECTURE.md (redesign 23 Jul 2026).
*/

import type { AsmOverview, AsmProduction, AsmTemplate, AsmWastageReport } from "./api";

const dISO = (daysAgo: number, h = 9, m = 30) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const ROSE = { id: "demo-rose", sku: "ROSE-RED", name: "Red Rose (stick)", imageUrl: null, isStockTracked: true, itemType: "RAW", unit: { name: "Lily Stick", shortCode: "stick" } };
const RIBBON = { id: "demo-ribbon", sku: "RIB-GOLD", name: "Gold Ribbon", imageUrl: null, isStockTracked: true, itemType: "PACKAGING", unit: { name: "Metre", shortCode: "m" } };
const BOX = { id: "demo-box", sku: "BOX-LUX", name: "Luxury Gift Box (empty)", imageUrl: null, isStockTracked: true, itemType: "PACKAGING", unit: { name: "Piece", shortCode: "pc" } };
const CHOC = { id: "demo-choc", sku: "CHOC-FER", name: "Ferrero Rocher 16pc", imageUrl: null, isStockTracked: true, itemType: "RAW", unit: { name: "Piece", shortCode: "pc" } };
const GYPSY = { id: "demo-gypsy", sku: "GYP-WHT", name: "White Gypsy (stick)", imageUrl: null, isStockTracked: true, itemType: "RAW", unit: { name: "Gypsy Stick", shortCode: "gstick" } };

export const DEMO_ASM_TEMPLATES: AsmTemplate[] = [
  {
    id: "tpl-romantic", name: "Romantic Bouquet", imageUrl: null,
    note: "Valentine best-seller", isActive: true, estCostPaisa: 82500,
    _count: { productions: 3 },
    lines: [
      { id: "t1", componentItemId: ROSE.id, qtyMilli: 12000, sortOrder: 0, unitCostPaisa: 1500, componentItem: ROSE },
      { id: "t2", componentItemId: GYPSY.id, qtyMilli: 4000, sortOrder: 1, unitCostPaisa: 800, componentItem: GYPSY },
      { id: "t3", componentItemId: BOX.id, qtyMilli: 1000, sortOrder: 2, unitCostPaisa: 25000, componentItem: BOX },
      { id: "t4", componentItemId: CHOC.id, qtyMilli: 1000, sortOrder: 3, unitCostPaisa: 35000, componentItem: CHOC },
      { id: "t5", componentItemId: RIBBON.id, qtyMilli: 1500, sortOrder: 4, unitCostPaisa: 3000, componentItem: RIBBON },
    ],
  },
  {
    id: "tpl-basket", name: "Premium Gift Basket", imageUrl: null,
    note: null, isActive: true, estCostPaisa: 95000,
    _count: { productions: 1 },
    lines: [
      { id: "t6", componentItemId: BOX.id, qtyMilli: 1000, sortOrder: 0, unitCostPaisa: 25000, componentItem: BOX },
      { id: "t7", componentItemId: CHOC.id, qtyMilli: 2000, sortOrder: 1, unitCostPaisa: 35000, componentItem: CHOC },
    ],
  },
];

export const DEMO_ASM_PRODUCTIONS: AsmProduction[] = [
  {
    id: "prd-3", productionNo: "PRD-000003", templateId: "tpl-romantic", templateName: "Romantic Bouquet",
    qtyMilli: 5000, finishedQtyMilli: 0, status: "IN_PROGRESS",
    assignedTo: "Rifat", actor: "Admin", startedAt: dISO(0, 8, 45), finishedAt: null, durationMin: null,
    sourceWarehouseId: "wh-shop", floorWarehouseId: "wh-floor",
    totalUsedValuePaisa: 0, totalWastedValuePaisa: 0, unitCostPaisa: 0,
    note: "Morning batch", template: { id: "tpl-romantic", name: "Romantic Bouquet", imageUrl: null },
    targetItem: null, lines: [
      { id: "p1", componentItemId: ROSE.id, plannedQtyMilli: 60000, pickedQtyMilli: 60000, usedQtyMilli: 0, wastedQtyMilli: 0, unitCostPaisa: 1500, usedValuePaisa: 0, wastedValuePaisa: 0, componentItem: ROSE },
      { id: "p2", componentItemId: BOX.id, plannedQtyMilli: 5000, pickedQtyMilli: 5000, usedQtyMilli: 0, wastedQtyMilli: 0, unitCostPaisa: 25000, usedValuePaisa: 0, wastedValuePaisa: 0, componentItem: BOX },
    ],
  },
  {
    id: "prd-2", productionNo: "PRD-000002", templateId: "tpl-romantic", templateName: "Romantic Bouquet",
    qtyMilli: 4000, finishedQtyMilli: 4000, status: "FINISHED",
    assignedTo: "Rifat", actor: "Admin", startedAt: dISO(1, 9, 0), finishedAt: dISO(1, 10, 10), durationMin: 70,
    sourceWarehouseId: "wh-shop", floorWarehouseId: "wh-floor",
    totalUsedValuePaisa: 330000, totalWastedValuePaisa: 18000, unitCostPaisa: 82500,
    note: null, template: { id: "tpl-romantic", name: "Romantic Bouquet", imageUrl: null },
    targetItem: null, lines: [
      { id: "p3", componentItemId: ROSE.id, plannedQtyMilli: 48000, pickedQtyMilli: 48000, usedQtyMilli: 46000, wastedQtyMilli: 2000, unitCostPaisa: 1500, usedValuePaisa: 69000, wastedValuePaisa: 3000, componentItem: ROSE },
      { id: "p4", componentItemId: BOX.id, plannedQtyMilli: 4000, pickedQtyMilli: 4000, usedQtyMilli: 4000, wastedQtyMilli: 0, unitCostPaisa: 25000, usedValuePaisa: 100000, wastedValuePaisa: 0, componentItem: BOX },
      { id: "p5", componentItemId: CHOC.id, plannedQtyMilli: 4000, pickedQtyMilli: 4000, usedQtyMilli: 4000, wastedQtyMilli: 0, unitCostPaisa: 35000, usedValuePaisa: 140000, wastedValuePaisa: 0, componentItem: CHOC },
    ],
  },
  {
    id: "prd-1", productionNo: "PRD-000001", templateId: "tpl-basket", templateName: "Premium Gift Basket",
    qtyMilli: 3000, finishedQtyMilli: 3000, status: "TRANSFERRED",
    assignedTo: "Admin", actor: "Admin", startedAt: dISO(2, 15, 0), finishedAt: dISO(2, 15, 25), durationMin: 25,
    sourceWarehouseId: "wh-shop", floorWarehouseId: "wh-floor",
    totalUsedValuePaisa: 285000, totalWastedValuePaisa: 0, unitCostPaisa: 95000,
    targetItemId: "demo-basket-item", transferredAt: dISO(2, 18, 0), note: null,
    template: { id: "tpl-basket", name: "Premium Gift Basket", imageUrl: null },
    targetItem: { id: "demo-basket-item", sku: "BAS-PREM", name: "Premium Gift Basket", imageUrl: null, unit: { shortCode: "pc" } },
    lines: [
      { id: "p6", componentItemId: BOX.id, plannedQtyMilli: 3000, pickedQtyMilli: 3000, usedQtyMilli: 3000, wastedQtyMilli: 0, unitCostPaisa: 25000, usedValuePaisa: 75000, wastedValuePaisa: 0, componentItem: BOX },
      { id: "p7", componentItemId: CHOC.id, plannedQtyMilli: 6000, pickedQtyMilli: 6000, usedQtyMilli: 6000, wastedQtyMilli: 0, unitCostPaisa: 35000, usedValuePaisa: 210000, wastedValuePaisa: 0, componentItem: CHOC },
    ],
  },
];

export function demoAsmProductions(status?: string): AsmProduction[] {
  return status ? DEMO_ASM_PRODUCTIONS.filter((p) => p.status === status) : DEMO_ASM_PRODUCTIONS;
}

export const DEMO_ASM_OVERVIEW: AsmOverview = {
  kpis: {
    runningCount: 1,
    awaitingTransferCount: 1,
    awaitingTransferValuePaisa: 330000,
    runsToday: 1,
    runsMonth: 3,
    producedMonthPaisa: 615000,
    wastedMonthPaisa: 18000,
    templateCount: 2,
  },
  noEntryToday: false,
  running: demoAsmProductions("IN_PROGRESS"),
  finishedAwaiting: demoAsmProductions("FINISHED"),
  byActor: [
    { who: "Rifat", runs: 2, piecesMilli: 9000, costPaisa: 330000, avgMinutes: 70 },
    { who: "Admin", runs: 1, piecesMilli: 3000, costPaisa: 285000, avgMinutes: 25 },
  ],
  topTemplates: [
    { templateId: "tpl-romantic", name: "Romantic Bouquet", runs: 2, piecesMilli: 9000, costPaisa: 330000 },
    { templateId: "tpl-basket", name: "Premium Gift Basket", runs: 1, piecesMilli: 3000, costPaisa: 285000 },
  ],
};

export function demoAsmWastage(days = 30): AsmWastageReport {
  return {
    days,
    totalWastedPaisa: 18000,
    byComponent: [
      { componentItemId: ROSE.id, sku: ROSE.sku, name: ROSE.name, imageUrl: null, unitShort: "stick", qtyMilli: 2000, valuePaisa: 3000 },
      { componentItemId: RIBBON.id, sku: RIBBON.sku, name: RIBBON.name, imageUrl: null, unitShort: "m", qtyMilli: 5000, valuePaisa: 15000 },
    ],
    docs: demoAsmProductions("FINISHED"),
  };
}
