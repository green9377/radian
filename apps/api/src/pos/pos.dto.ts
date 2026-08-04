/*
  POS module DTOs (RADIAN_POS_MODULE_ARCHITECTURE.md).
  Plain interfaces — the project uses no class-validator / global ValidationPipe.
*/

export type PosTender = 'cash' | 'bkash' | 'nagad' | 'card';

export interface OpenShiftDto {
  registerId?: string;
  cashierName: string;
  openingFloatPaisa?: number;
  actorName?: string;
}

export interface CloseShiftDto {
  countedCashPaisa: number;
  note?: string;
  actorName?: string;
}

export interface CashMovementDto {
  kind: 'PAYOUT' | 'DROP' | 'ADJUSTMENT';
  amountPaisa: number; // signed for ADJUSTMENT; positive amount for PAYOUT/DROP (removed)
  note?: string;
  actorName?: string;
}

export interface PosSaleLineDto {
  productId: string;
  qty: number;
  unitPaisa?: number; // override; else product offer price
}

export interface PosPaymentDto {
  method: PosTender;
  amountPaisa: number;
}

export interface CreatePosSaleDto {
  shiftId?: string; // else the current open shift is used
  registerId?: string;
  branchId?: string;

  // customer — optional for a fully-paid walk-in; required when there is a due
  customerId?: string;
  customerName?: string;
  customerPhone?: string;

  isGift?: boolean;

  lines: PosSaleLineDto[];

  discountPaisa?: number;
  discountApprovedBy?: string; // set when the cart discount is over the category cap

  adjustmentPaisa?: number; // signed round-off / extra charge (DEC-POS-015)
  adjustmentNote?: string;
  taxRateBps?: number; // VAT rate in basis points (DEC-POS-016)

  payMode: 'full' | 'partial';
  payments: PosPaymentDto[];

  actorName?: string;
}

export interface CollectDueDto {
  orderId: string;
  payments: PosPaymentDto[];
  actorName?: string;
}

export interface DiscountRuleInput {
  categoryId?: string | null;
  productId?: string | null;
  maxPercent: number;
  requiresApproval: boolean;
}

export interface UpdatePosSettingsDto {
  openingFloatDefaultPaisa?: number;
  defaultTaxRateBps?: number;
  giftReceiptHidePrice?: boolean;
  defaultCreditLimitPaisa?: number;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
}

export interface CreateRegisterDto {
  code?: string;
  name: string;
  branchId?: string;
}
