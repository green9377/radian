/*
  Inventory — DTO shapes. RADIAN_INVENTORY_MODULE_ARCHITECTURE.md (locked 22 Jul 2026).
  Quantities = qtyMilli Int (thousandths) · money = paisa Int · no floats (core_principles).
*/

export type OpeningLineDto = {
  itemId: string;
  warehouseId: string;
  qtyMilli: number;
  /** DEC-INV-007 — only honoured when the item has trackExpiry */
  expiryDate?: string;
};

export type OpeningDto = {
  lines: OpeningLineDto[];
  note?: string;
  actorName?: string;
};

export type TransferCreateDto = {
  fromWarehouseId: string;
  toWarehouseId: string;
  lines: { itemId: string; qtyMilli: number }[];
  note?: string;
  actorName?: string;
};

export type IssueCreateDto = {
  kind: 'WASTAGE' | 'GIFT';
  warehouseId: string;
  reason?: string; // পচা / ভাঙা / marketing / সম্পর্ক …
  note?: string;
  lines: { itemId: string; qtyMilli: number }[];
  actorName?: string;
};

export type StocktakeCreateDto = {
  warehouseId: string;
  note?: string;
  lines: { itemId: string; countedQtyMilli: number }[];
  actorName?: string;
};

export type AdjustmentDto = {
  itemId: string;
  warehouseId: string;
  /** signed delta in qtyMilli — positive adds, negative removes */
  deltaQtyMilli: number;
  note?: string;
  actorName?: string;
};

export type SettingsPatch = {
  defaultSaleWarehouseId?: string;
  defaultReceiveWarehouseId?: string;
  allowPerOrderWarehouse?: boolean;
  negativeStockPolicy?: 'ALLOW_WARN' | 'BLOCK';
  /** DEC-ASM-003 — Assembly's defaults (nullable → fallback chain to SHOP) */
  defaultAssemblyComponentWarehouseId?: string | null;
  defaultAssemblyFinishedWarehouseId?: string | null;
  /** DEC-ASM-012 — the Assembly floor warehouse (lazy-created if null) */
  assemblyFloorWarehouseId?: string | null;
  actorName?: string;
};

export type MovementListQuery = {
  itemId?: string;
  warehouseId?: string;
  reason?: string;
  days?: string;
  take?: string;
};

export type StockBoardQuery = {
  search?: string;
  warehouseId?: string;
  /** all | low | negative | expiring */
  filter?: string;
};
