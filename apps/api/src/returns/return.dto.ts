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
  actorName?: string;
}

export interface CompleteReturnDto {
  refundMethod?: ReturnRefundMethod; // last-minute override
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
