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
  /**
   * ⚠️ THE WELCOME OFFER'S BLIND SPOT — 25 Aug 2026.
   *
   * OFR-R02 says a FIRST_ORDER offer needs `ordersCount == 0`. A shopper who
   * has never bought here has no Customer ROW at all, so `customerId` is
   * absent and the offer was refused with "needs an identified customer" —
   * the one person a welcome offer exists for is the one person the quote
   * could not see.
   *
   * The order then created the customer, found ordersCount 0, and applied the
   * discount. So the shop QUOTED ৳3,500 and CHARGED ৳2,950. The regression
   * suite caught it as a MONEY MISMATCH, which is exactly what it was.
   *
   * This is set by the storefront when a phone number was given and no
   * customer exists under it. That is not a guess about the future — a phone
   * with no customer row has ordered zero times, which is precisely what
   * OFR-R02 asks. Nothing here changes what is CHARGED; it makes the quote
   * tell the truth about it.
   *
   * ⚠️ Never set from the admin or POS: staff always have a real customer.
   */
  firstOrderEligible?: boolean;
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
