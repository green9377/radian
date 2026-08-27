/* Finance module DTOs — RADIAN_FINANCE_MODULE_ARCHITECTURE.md v1.1 */

export interface AccountWriteDto {
  code?: string;
  name?: string;
  groupName?: string | null;
  type?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  isMoneyAccount?: boolean;
  payMethod?: string | null;
  costBehavior?: 'FIXED' | 'VARIABLE' | null;
  openingBalancePaisa?: number;
  note?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface SettingsWriteDto {
  goLiveDate?: string | null;
  fiscalYearStartMonth?: number;
  defaultCashAccountId?: string | null;
  expenseApprovalThresholdPaisa?: number;
  paymentApprovalThresholdPaisa?: number;
  refundApprovalThresholdPaisa?: number;
  wastageApprovalThresholdPaisa?: number;
  labourBonusPercentBp?: number;
  assetThresholdPaisa?: number;
  autoPostEnabled?: boolean;
  lastClosedDate?: string | null;
  vatEnabled?: boolean;
  vatRateBps?: number;
  vatInclusivePricing?: boolean;
  businessBin?: string | null;
  /* the rest of what a Mushak 6.3 challan must carry about us (G3) */
  businessName?: string | null;
  businessAddress?: string | null;
  businessVatCircle?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  riderCashLimitPaisa?: number;
  /* DEC-FIN-029/030 — the gateway's terms, editable because they are the
     gateway's to change (house rule 7). The rate only WATCHES; the charge
     booked on a payment is always the gateway's own figure. */
  gatewayPayoutMinPaisa?: number;
  gatewayFeeRateBps?: number;
}

export interface ReconcileDto {
  accountId: string;
  countedBalancePaisa: number;
  asOfDate?: string;
  note?: string;
  actorName?: string;
}

export interface PostOpeningDto {
  actorName?: string;
  entryDate?: string;
}

export interface ExpenseWriteDto {
  spentAt?: string;
  accountId?: string;
  paidFromId?: string;
  amountPaisa?: number;
  payeeName?: string | null;
  note?: string | null;
  attachmentUrl?: string | null;
  partnerId?: string | null;
  branchId?: string | null;
  /** MKT-D05 — optional Marketing tag. Finance still owns the money; Marketing
      only reads the sum back. Null is a perfectly good answer. */
  campaignId?: string | null;
  actorName?: string;
}

export interface IncomeWriteDto {
  earnedAt?: string;
  accountId?: string;
  receivedInId?: string;
  amountPaisa?: number;
  payerName?: string | null;
  note?: string | null;
  branchId?: string | null;
  actorName?: string;
}

export interface TransferWriteDto {
  movedAt?: string;
  fromId?: string;
  toId?: string;
  amountPaisa?: number;
  feePaisa?: number;
  note?: string | null;
  actorName?: string;
}

export interface PartnerWriteDto {
  name?: string;
  kind?: 'CAPITAL' | 'LABOUR' | 'BOTH';
  sharePercentBp?: number;
  monthlySalaryPaisa?: number;
  phone?: string | null;
  note?: string | null;
  joinedAt?: string;
  isActive?: boolean;
}

export interface PartnerTxnDto {
  partnerId: string;
  kind: 'CAPITAL_IN' | 'CAPITAL_RETURN' | 'DRAWING' | 'SALARY';
  amountPaisa: number;
  happenedAt?: string;
  accountId?: string; // money account the cash moved through
  note?: string | null;
  actorName?: string;
}

export interface ApprovalActionDto {
  actorName?: string;
  reason?: string;
}

export interface RecurringWriteDto {
  name?: string;
  accountId?: string;
  paidFromId?: string;
  amountPaisa?: number;
  dayOfMonth?: number;
  startsOn?: string;
  endsOn?: string | null;
  note?: string | null;
  isActive?: boolean;
  actorName?: string;
}

/*  HR-D06 — the owner's rule: "no advance and no salary unless the person is
    already on the employee list". So these two carry an employeeId, not a name.
    employeeName is gone from the request on purpose; the server fills the ledger
    dimension from the Employee row, which is why the duplicate-name problem
    (Rakib / rakib / Rakib Hasan) can no longer be created. */
export interface StaffAdvanceDto {
  employeeId?: string;
  amountPaisa?: number;
  accountId?: string;
  happenedAt?: string;
  note?: string | null;
  actorName?: string;
}

export interface StaffSalaryDto {
  employeeId?: string;
  grossPaisa?: number;
  recoverAdvancePaisa?: number;
  accountId?: string;
  period?: string;
  happenedAt?: string;
  note?: string | null;
  actorName?: string;
}

export interface ManualJournalDto {
  entryDate?: string;
  narration?: string;
  actorName?: string;
  lines: LineInput[];
}

/** one side of a manual/system journal entry (internal — never exposed as Dr/Cr in UI) */
export interface LineInput {
  accountCode?: string;
  accountId?: string;
  /** the name as it was on the day — history, never rewritten (FIN-RULE-003) */
  employeeName?: string | null;
  /** HR-D06 — the real person behind that name. Null on rows written before HR. */
  employeeId?: string | null;
  debitPaisa?: number;
  creditPaisa?: number;
  partnerId?: string | null;
  orderId?: string | null;
  itemId?: string | null;
  occasion?: string | null;
  zone?: string | null;
  channelId?: string | null;
  note?: string | null;
}

export interface PostEntryInput {
  sourceType:
    | 'ORDER'
    | 'PAYMENT'
    | 'RETURN'
    | 'POS_SHIFT'
    | 'INVENTORY'
    | 'PURCHASE'
    | 'SUPPLIER_PAYMENT'
    | 'DELIVERY'
    | 'REMITTANCE'
    | 'EXPENSE'
    | 'INCOME'
    | 'TRANSFER'
    | 'PARTNER'
    | 'ASSET'
    | 'PREPAID'
    | 'LOAN'
    | 'RECONCILE'
    | 'PROFIT_DIST'
    | 'VAT'
    | 'OPENING'
    | 'MANUAL'
    | 'AFFILIATE';
  sourceId?: string | null;
  /** DEC-FIN-023 — idempotency; same key twice = silently skipped */
  sourceKey?: string | null;
  entryDate?: Date | string;
  narration: string;
  branchId?: string | null;
  carrierId?: string | null;
  reversesId?: string | null;
  isManual?: boolean;
  actorName?: string | null;
  lines: LineInput[];
}
