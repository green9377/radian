/*
  Supplier module DTOs — RADIAN_SUPPLIER_MODULE_ARCHITECTURE.md (23 Jul 2026).
  Money = paisa Int everywhere (SUP-R10).
*/

export interface SupplierListQuery {
  search?: string; // name / nickname / phone
  typeId?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
  due?: '1'; // "With due only" toggle
  sort?: 'name' | 'due' | 'recent';
  dir?: 'asc' | 'desc';
}

export interface SupplierCreateDto {
  name: string;
  typeId: string; // SUP-R01 — the only two required fields
  nickname?: string;
  phone?: string;
  confirmDuplicatePhone?: boolean; // SUP-R01 — warn path
  contactPerson?: string;
  market?: string;
  address?: string;
  photoUrl?: string;
  paymentTerms?: string;
  payoutInfo?: string;
  notifyPhone?: string;
  notifyChannel?: 'WHATSAPP' | 'SMS' | 'OFF';
  notifyMode?: 'MANUAL' | 'AUTO';
  leadTimeHours?: number;
  notes?: string;
  /** DEC-SUP-010 — one tick, both workspaces (supplier AND vendor) */
  dualRole?: boolean;
  // DEC-SUP-005 — optional opening due
  openingDuePaisa?: number;
  openingAsOf?: string;
  openingNote?: string;
  actorName?: string;
}

export type SupplierPatch = Partial<Omit<SupplierCreateDto, 'openingDuePaisa' | 'openingAsOf' | 'openingNote'>> & {
  status?: 'ACTIVE' | 'INACTIVE';
  // opening due may be SET later only if never set before (SUP-R04)
  openingDuePaisa?: number;
  openingAsOf?: string;
  openingNote?: string;
  actorName?: string;
};

/** DEC-SUP-006 — supplier-level payment with optional manual allocation override */
export interface SupplierPayDto {
  amountPaisa: number;
  method: 'CASH' | 'BKASH' | 'NAGAD' | 'BANK' | 'CARD' | 'OTHER';
  paidAt?: string;
  note?: string;
  /** omit → auto oldest-first (opening due, then purchases by date).
   *  provide → the confirm screen's hand-adjusted split. purchaseId null = opening due. */
  allocations?: { purchaseId: string | null; amountPaisa: number }[];
  actorName?: string;
}

export interface SupplierAdjustDto {
  amountPaisa: number; // signed — positive raises due, negative lowers it
  note: string; // required — an unexplained correction is not a correction
  actorName?: string;
}

export interface SupplierTypeDto {
  name: string;
  sortOrder?: number;
  /** DEC-SUP-009 — behaviour flag: true → the Vendors workspace */
  isFulfillment?: boolean;
  actorName?: string;
}

export interface LinkNamesDto {
  names: string[]; // free-text supplierName values to attach to this supplier
  actorName?: string;
}
