import {
  ReturnResolution,
  ReturnRefundMethod,
  ReturnRestockAction,
} from '@prisma/client';

/** one line of goods being returned (a slice of an OrderLine) */
export interface ReturnLineInput {
  orderLineId: string;
  qty: number;
  restockAction?: ReturnRestockAction; // default: READYMADE→RESTOCK, CRAFTED→WRITE_OFF (DEC-RTN-007)
}

/** DEC-RTN-017 — one line of goods going back OUT to the customer */
export interface ReplacementLineInput {
  itemId?: string | null;
  productId?: string | null;
  name: string;
  qty: number;
  unitPaisa?: number;
}

export interface CreateReturnDto {
  orderId: string;
  reasonId?: string;
  reasonNote?: string;
  resolution?: ReturnResolution; // default REFUND (DEC-RTN-006)
  refundMethod?: ReturnRefundMethod; // default = reason.defaultRefundMethod ?? ORIGINAL
  refundReference?: string;
  compensationPaisa?: number; // PARTIAL_COMPENSATION payout amount
  note?: string;
  lines: ReturnLineInput[];
  /** REPLACEMENT — what goes out; empty means "the same goods again" */
  replacements?: ReplacementLineInput[];
  /** STORE_CREDIT — how much the shop gives (DEC-RTN-018) */
  creditAskPaisa?: number;
  actorName?: string;
  /** set by the controller from the signed-in user, never trusted from the body */
  actorRole?: string;
  /**
   * audit 11 Sep 2026 #30 — open it as a draft instead of submitting it now.
   * A draft executes nothing and is finished later through
   * `POST /returns/:id/submit`, which re-runs the same validation.
   */
  asDraft?: boolean;
}

/** audit 11 Sep 2026 #31/#32 — who is acting, and why (reject/cancel need a reason) */
export interface ReturnActorDto {
  actorName?: string;
  /** set by the controller from the signed-in session, never from the body */
  actorRole?: string;
  /** required on reject and cancel; stored on the return and on its timeline */
  reason?: string;
  /** accepted as an alias for `reason`, because the old screen sent `note` */
  note?: string;
}

export interface CompleteReturnDto {
  refundMethod?: ReturnRefundMethod; // last-minute override
  /** DEC-GBL-006 — which account the payout left from */
  refundAccountId?: string;
  refundReference?: string;
  actorName?: string;
  /**
   * audit 11 Sep 2026 #12 — what the screen believes it is paying out. The
   * server never TRUSTS it: it only ever narrows the payout, and anything
   * above the computed cap is refused outright rather than quietly clamped,
   * so a screen that has drifted is told it is wrong instead of paying a
   * different number than the one the staff member read.
   */
  payoutPaisa?: number;
}

export interface ListReturnQuery {
  search?: string;
  /** the shorter name the rest of the admin uses; same six-column match */
  q?: string;
  status?: string;
  page?: string;
  pageSize?: string;
  /** createdAt window, YYYY-MM-DD read as Dhaka's day (or a full ISO instant) */
  from?: string;
  to?: string;
  /// DEC-RTN-016 — which door the return came in through. NOT a column on
  /// SalesReturn: it is read off the order's fulfillmentType (DEC-POS-001),
  /// so there is still exactly one returns table and one total. The admin
  /// panel offers a website door and a counter door; both read this list.
  /// Anything but 'online'/'counter' is ignored and the whole book is returned.
  channel?: string;
}

export interface ReturnReasonDto {
  code?: string;
  label: string;
  requiresApproval?: boolean;
  defaultRefundMethod?: ReturnRefundMethod;
  isActive?: boolean;
  sortOrder?: number;
}

export interface ReturnSettingsDto {
  returnWindowDays?: number;
  approvalThresholdPaisa?: number;
  restockDefaultPerishable?: boolean;
  /** DEC-RTN-015 — how much of one bill store credit may pay for (bps; 10000 = all) */
  storeCreditMaxBillBps?: number;
}
