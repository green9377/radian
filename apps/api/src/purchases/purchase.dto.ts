/*
  Purchase module — DTO surface.
  Architecture: RADIAN_PURCHASE_MODULE_ARCHITECTURE.md (locked 22 Jul 2026).
  Plain TS types, same style as item.dto.ts — validation happens in the service
  so every rule can cite its DEC-PUR id in one place.
*/

export type PayMethodDto = 'CASH' | 'BKASH' | 'NAGAD' | 'BANK' | 'CARD' | 'OTHER';

export interface PurchaseLineDto {
  itemId: string;
  unitId: string;
  qtyMilli: number; // thousandths — 24 stems = 24000
  unitPricePaisa: number; // per ONE unit, paisa
}

export interface PurchaseCreateDto {
  /** DEC-PUR-003 / DEC-SUP-007 — snapshot text; supplierId is the link now */
  supplierName: string;
  supplierPhone?: string;
  /** Supplier master FK (DEC-SUP-007). Optional — legacy free-text still works. */
  supplierId?: string;
  purchaseDate?: string; // ISO; default now
  supplierReceiptNo?: string;
  attachmentUrl?: string; // receipt photo, data URL interim
  notes?: string;
  discountPaisa?: number;
  /** rounding/bargain adjustment — may be negative (39,920 → 39,900) or positive */
  adjustmentPaisa?: number;
  /** DEC-PUR-012 — supplier VAT rate in basis points (750 = 7.5%) */
  taxRateBps?: number;
  lines: PurchaseLineDto[];

  /**
   * DEC-PUR-001 — mode picks the entry door:
   *   'QUICK'   → status RECEIVED, lines fully received (the market-morning case)
   *   'ADVANCE' → status ADVANCE_PAID, nothing received; payment required
   */
  mode?: 'QUICK' | 'ADVANCE';

  /** optional first payment recorded in the same save (Biznify Direct-Bill style) */
  payment?: { amountPaisa: number; method: PayMethodDto; note?: string };

  /** PUR-R07 guardrail — must be true to accept a wild average-cost jump */
  confirmCost?: boolean;

  actorName?: string;
}

export interface PurchasePatch {
  supplierName?: string;
  supplierPhone?: string;
  purchaseDate?: string;
  supplierReceiptNo?: string;
  attachmentUrl?: string;
  notes?: string;
  discountPaisa?: number;
  actorName?: string;
}

export interface ReceiveDto {
  /** omit lines → receive everything outstanding */
  lines?: { lineId: string; qtyMilli: number }[];
  confirmCost?: boolean;
  actorName?: string;
}

export interface PaymentDto {
  amountPaisa: number;
  method: PayMethodDto;
  /** DEC-GBL-006 — which account the money left from */
  accountId?: string;
  paidAt?: string;
  note?: string;
  actorName?: string;
}

export interface ReturnCreateDto {
  purchaseId: string;
  reason?: string;
  lines: { purchaseLineId: string; qtyMilli: number }[];
  actorName?: string;
}

export interface PurchaseListQuery {
  search?: string; // purchaseNo / supplierName
  status?: string; // ALL | ORDERED | ADVANCE_PAID | RECEIVED | CANCELLED | due
  from?: string;
  to?: string;
  sort?: 'date' | 'total' | 'due' | 'supplier';
  dir?: 'asc' | 'desc';
}
