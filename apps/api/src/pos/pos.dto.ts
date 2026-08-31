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

/**
 * P7-2 (owner, 31 Aug 2026) — *"jkhon ja dorkar hobe cash theke ber krbe
 * expance diye"*: money may leave the till whenever it is needed, and every
 * withdrawal is recorded as an expense with a heading, so it lands in Finance
 * as a cost. Nothing leaves the drawer silently.
 *
 * DROP is the other half — cash moved to the bank or the safe. That is not a
 * cost, it is the same money in another place, so it becomes a Finance
 * transfer rather than an expense.
 */
export interface PosCashOutDto {
  kind: 'EXPENSE' | 'DROP';
  amountPaisa: number;
  /** which cash the notes came out of — needed only when the shop keeps more than one */
  fromAccountId?: string;
  /** EXPENSE — the heading it is spent under (a Finance EXPENSE account) */
  accountId?: string;
  /** DROP — where the cash is going (a Finance money account: bank, safe) */
  toAccountId?: string;
  payeeName?: string;
  note?: string;
  actorName?: string;
}

export interface CashMovementDto {
  kind: 'PAYOUT' | 'DROP' | 'ADJUSTMENT';
  amountPaisa: number; // signed for ADJUSTMENT; positive amount for PAYOUT/DROP (removed)
  note?: string;
  actorName?: string;
}

/**
 * DEC-POS-018 (owner, 20 Aug 2026) — the counter sells ITEMS.
 *
 * `itemId` is the way in. `productId` stays only so that a till or receipt built
 * before this change keeps working; nothing new should send it.
 */
export interface PosSaleLineDto {
  itemId?: string;
  productId?: string; // legacy — a website product sold at the counter
  qty: number;
  unitPaisa?: number; // override; else the item's counter price
  /**
   * DEC-POS-024 — the unit this line is sold in. Only the item's own unit or
   * its DIRECT base is accepted (the same two the dropdown offers, DEC-PUR-013
   * mirrored to the counter). Omitted = the item's own unit. `qty` and
   * `unitPaisa` are both in THIS unit; stock converts by the exact factor.
   */
  unitId?: string;
}

export interface PosPaymentDto {
  method: PosTender;
  amountPaisa: number;
  /** DEC-GBL-006 — which bKash number / bank account took it, when there are several */
  accountId?: string;
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

  /**
   * DEC-POS-019 (owner, 21 Aug) — which channel brought this sale in. The counter
   * is not only walk-ins: the same staff sells over Facebook, WhatsApp and the
   * phone, and the money still lands in the drawer. Empty = the POS channel.
   */
  channelId?: string;

  /** DEC-POS-020 — the bill's own date; today when empty, never the future */
  saleDate?: string;
  /** DEC-POS-020 — who sold it; whoever is signed in when empty */
  salespersonName?: string;
  /** DEC-POS-020 — a line of words about this sale, kept on the order */
  note?: string;

  /**
   * DEC-POS-022 (owner, 21 Aug) — an ADVANCE order: the customer orders today
   * and takes the goods on `promisedFor`. Three rules, his:
   *   · the stock leaves on the day it is handed over, not today
   *   · whatever he pays today is an advance; the rest is a due
   *   · it waits on POS → Advance orders until "Hand over"
   */
  advance?: { promisedFor: string };

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
  /** DEC-POS-021 — the methods the counter may take; empty = all */
  enabledMethods?: string[];
}

export interface CreateRegisterDto {
  code?: string;
  name: string;
  branchId?: string;
}
