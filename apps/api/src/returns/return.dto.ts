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
}

export interface CompleteReturnDto {
  refundMethod?: ReturnRefundMethod; // last-minute override
  /** DEC-GBL-006 — which account the payout left from */
  refundAccountId?: string;
  refundReference?: string;
  actorName?: string;
}

export interface ListReturnQuery {
  search?: string;
  status?: string;
  page?: string;
  pageSize?: string;
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
}
