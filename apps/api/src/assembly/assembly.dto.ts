/*
  Assembly v2 — DTO shapes. RADIAN_ASSEMBLY_MODULE_ARCHITECTURE.md
  (redesigned with the owner 23 Jul 2026, DEC-ASM-011…016).
  Quantities = qtyMilli Int · money = paisa Int · no floats (core_principles).
*/

export type TemplateWriteDto = {
  name?: string;
  imageUrl?: string | null;
  note?: string | null;
  isActive?: boolean;
  /** REPLACES the whole line set when present. qty per ONE piece, component's own unit. */
  lines?: { componentItemId: string; qtyMilli: number }[];
  actorName?: string;
};

export type ProductionStartDto = {
  templateId: string;
  /** planned pieces (milli — whole pieces normally) */
  qtyMilli: number;
  assignedTo?: string;
  sourceWarehouseId?: string;
  /** DEC-ASM-014 — when the work actually started (ISO); default now */
  startedAt?: string;
  note?: string;
  /** DEC-ASM-016 quick build — finish in the same save */
  quick?: {
    finishedQtyMilli: number;
    /** when it actually ended (ISO); default now */
    finishedAt?: string;
    durationMin?: number;
    lines?: { componentItemId: string; usedQtyMilli: number; wastedQtyMilli: number }[];
  };
  actorName?: string;
};

export type ProductionFinishDto = {
  finishedQtyMilli: number;
  /** when it actually ended (ISO); default now */
  finishedAt?: string;
  durationMin?: number;
  /** missing line → used = picked, wasted = 0 */
  lines?: { componentItemId: string; usedQtyMilli: number; wastedQtyMilli: number }[];
  note?: string;
  actorName?: string;
};

export type ProductionTransferDto = {
  /** the finished Item chosen NOW (DEC-ASM-011) — must be MAKE_TO_STOCK */
  targetItemId: string;
  warehouseId?: string;
  actorName?: string;
};
