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
  /**
   * (POS audit 11 Sep 2026) — a NAME, kept for the receipt and the audit trail.
   * It is no longer what clears the cap: any non-empty string used to do that,
   * and the approver was then thrown away. The cap is cleared by
   * `discountApprovalToken` below, which only this server can issue.
   */
  discountApprovedBy?: string;
  /**
   * (POS audit 11 Sep 2026) — the one-shot token `POST /pos/discount/approve`
   * hands back when a manager's PIN checks out. Required whenever the cart
   * discount (or a negative adjustment) goes over the DEC-POS-006 cap. Burned
   * on use, so one approval clears one bill.
   */
  discountApprovalToken?: string;

  adjustmentPaisa?: number; // signed round-off / extra charge (DEC-POS-015)
  adjustmentNote?: string;
  /**
   * DEC-GBL-002 — READ BUT IGNORED since the POS audit (11 Sep 2026). VAT is one
   * rate for the whole shop and Finance owns it; the till used to send whatever
   * the cashier picked from a four-value dropdown in the browser bundle, so a
   * bill could carry a percentage the books had never heard of. The field is
   * still accepted so an older till does not 400 — the server takes the rate
   * from `PosSetting.defaultTaxRateBps` (which reads Finance) and nothing else.
   */
  taxRateBps?: number;

  payMode: 'full' | 'partial';
  payments: PosPaymentDto[];

  /**
   * DEC-RTN-015 (owner, 31 Aug 2026) — part of this bill paid with the
   * customer's store credit. Not a tender: no money moves, a liability the shop
   * was already carrying is discharged instead. Returns owns the credit ledger
   * and checks the balance and the shop's cap; POS only asks for an amount.
   * Needs an identified customer, for the same reason a due does.
   */
  storeCreditPaisa?: number;

  /**
   * (POS audit 11 Sep 2026, §1 #1) — a uuid the till generates ONCE per attempt
   * and re-sends on every retry of that attempt. A second POST carrying a key
   * this shop has already seen returns the ORIGINAL bill instead of ringing the
   * sale up twice. The guarantee is a unique index on `Order.posIdempotencyKey`,
   * not a lookup, so two parallel double-clicks cannot both pass a check.
   */
  idempotencyKey?: string;

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
  /**
   * DEC-POS-018 / (POS audit 11 Sep 2026 §3 #15) — the counter sells ITEMS, so a
   * cap has to be writable against an item or its stockroom category. The two
   * columns existed on `PosDiscountRule` and `cartDiscountCap` already read
   * them; nothing could ever WRITE them, so every counter cart capped at 100%
   * and the whole DEC-POS-006 feature did nothing.
   */
  itemId?: string | null;
  itemCategoryId?: string | null;
  maxPercent: number;
  requiresApproval: boolean;
}

/**
 * (POS audit 11 Sep 2026 §3 #17) — the over-cap gate, moved off the browser.
 *
 * `MANAGER_PIN = "1234"` shipped in the admin bundle, so the "approval" was a
 * string anybody could read out of the page source. The PIN is now checked on
 * the server against a real OWNER/MANAGER account and the client never holds one.
 */
export interface PosDiscountApproveDto {
  pin: string;
  /** what the cashier is asking for, for the record — percent of the cart */
  requestedPercent?: number;
  actorName?: string;
}

/**
 * (POS audit 11 Sep 2026 §3 #21) — a counter void: the mis-rung bill of five
 * minutes ago, undone in one transaction. Not a refund and not a return — those
 * are Returns' job and keep their approval workflow.
 */
export interface VoidPosSaleDto {
  reason: string;
  actorName?: string;
}

/*  ═══ CANCELLING AN ADVANCE ORDER — owner, 11 Sep 2026 ═══════════════════════

    > *"Anyone can cancel their order from an advance. In that case let it be
    >  cancelled and give the amount back to them."*

    Different from a void, deliberately:
      · a void undoes a bill the shop rang up by mistake, and only while the
        cash box that took the money is still open
      · this is the CUSTOMER changing their mind, which can happen weeks later,
        so the day the advance was taken has long been counted and closed

    Nothing about a percentage is written here. `refundPaisa` comes from the
    screen, pre-filled with everything the customer has paid, and the shop can
    hand back less if it decides to — with the reason recorded beside it. The
    system does not invent a forfeit the owner has not stated.  */
export interface CancelAdvanceDto {
  reason: string;
  /** what to hand back; defaults to everything the customer has paid */
  refundPaisa?: number;
  /*  which till the money leaves from (owner, 11 Sep 2026: "a refund can come
      from cash, bKash, the bank — the person refunding picks"). Wider than
      `PosTender` on purpose: a bank transfer is a legitimate way to hand an
      advance back, and it is not a counter tender.  */
  refundMethod?: 'cash' | 'bkash' | 'nagad' | 'card' | 'bank';
  refundAccountId?: string;
  refundReference?: string;
  actorName?: string;
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
