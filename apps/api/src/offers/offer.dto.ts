/* Pricing & Offers DTOs — RADIAN_OFFERS_MODULE_ARCHITECTURE.md (DEC-OFR-001…009) */

export type OfferShapeIn =
  | 'SITEWIDE'
  | 'CATEGORY'
  | 'PRODUCT'
  | 'FIRST_ORDER'
  | 'PAYMENT'
  | 'FREE_DELIVERY';

export type OfferMechanismIn = 'AUTOMATIC' | 'COUPON';
export type OfferDiscountTypeIn = 'PERCENT' | 'FLAT' | 'FREE_DELIVERY';

export interface OfferWriteDto {
  name: string;
  internalNote?: string;
  publicTitle?: string;
  benefitLine?: string;
  description?: string;

  mechanism?: OfferMechanismIn;
  shape?: OfferShapeIn;
  code?: string; // COUPON only — uppercased by the service

  discountType?: OfferDiscountTypeIn;
  discountValue?: number; // PERCENT=bp · FLAT=paisa (DEC-OFR-009)

  maxDiscountPaisa?: number | null;
  minSpendPaisa?: number | null;
  perCustomerLimit?: number | null;
  totalLimit?: number | null;

  categoryId?: string | null; // shape=CATEGORY
  productIds?: string[]; // shape=PRODUCT (m2m set)
  paymentMethod?: string | null; // shape=PAYMENT

  combinable?: boolean;
  priority?: number;
  scarcity?: boolean;
  bonusLines?: string[];
  guaranteeText?: string | null;

  startsAt?: string | null; // ISO
  endsAt?: string | null;

  submit?: boolean; // draft → submit for gate check (DEC-OFR-004)
  actorName?: string;
}

export interface ListOfferQuery {
  search?: string;
  status?: string;
  mechanism?: string;
  shape?: string;
  page?: string;
  pageSize?: string;
}

/* ---- quote engine (OFR-R01…R10) ---- */

export interface QuoteLineIn {
  productId: string;
  qty: number;
  unitPaisa?: number; // optional override (staff order) — else product offer price
}

export interface QuoteDto {
  customerId?: string;
  lines: QuoteLineIn[];
  deliveryPaisa?: number;
  paymentMethod?: string;
  couponCode?: string;
}

export interface QuoteApplied {
  offerId: string;
  offerNo: string;
  name: string;
  mechanism: OfferMechanismIn;
  shape: OfferShapeIn;
  code?: string | null;
  discountPaisa: number;
  freeDelivery: boolean;
}

export interface QuoteResult {
  subtotalPaisa: number;
  discountPaisa: number; // Σ applied (money only — freeDelivery separate)
  deliveryWaivedPaisa: number;
  applied: QuoteApplied[];
  couponError?: string; // human reason when the typed code did not apply (OFR-R08)
  skipped: { name: string; reason: string }[]; // losing candidates (OFR-R07)
}

export interface OfferSettingsDto {
  approvalThresholdBp?: number;
  defaultCombinable?: boolean;
}
