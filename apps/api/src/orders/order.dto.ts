import {
  PaymentMethod,
  PaymentTxnKind,
  OrderPhotoKind,
  DeliveryZone,
} from '@prisma/client';

export interface OrderLineInput {
  productId: string;
  qty: number;
  sizeLabel?: string;
  unitPaisa?: number; // override; নইলে product offer price
  bundleLabel?: string;
  addonLabels?: string[];
  persoText?: string;
  /**
   * DEC-PRD-061 — the customer's own photograph for this line, already stored
   * by `POST /media/upload/perso-photo`. A URL, never a file: checkout should
   * not be holding an upload open, and a failed picture must not take the
   * whole basket with it.
   */
  persoImageUrl?: string;
  /**
   * The discount sitting on this line — DEC-PRD-018's bundle discount arrives
   * here from the storefront.
   *
   * ⚠️ It used to be 0 always. Giving a bundle discount then meant sending a
   * lowered `unitPaisa`, and that made the receipt lie about what the goods
   * cost — the customer read a ৳1,170 bouquet while the shop had sold a
   * ৳1,299 one. Price and discount are separate now, exactly as they are for a
   * discount a staff member types in.
   */
  discountPaisa?: number;
  /** which screen this line was added from — the add-on performance report reads it */
  addedFrom?: 'PRODUCT' | 'CART' | 'CHECKOUT';
  /**
   * DEC-PRD-014 — which colour/flavour is being sold. Given, Preparing's
   * stock −qty comes out of THIS VARIANT's field and not the product's,
   * because when variants exist the truth of the stock lives there and every
   * screen shows their sum.
   */
  variantId?: string;
  /** a snapshot — renaming the colour later must not change an old receipt */
  variantLabel?: string;
  /** কোন AddOn-গুলো, id-তে — stock-নিয়মের চাবি (মালিকের রায়, ৪ আগস্ট) */
  addonIds?: string[];
  // name / bg / productType product থেকে freeze হবে (snapshot, contract)
}

export interface CreateOrderDto {
  customerId: string;
  channelId: string;

  /**
   * রসিদে ক্রেতার যে পরিচয় লেখা হবে — checkout-এ **যা টাইপ করা হয়েছে**।
   *
   * ⚠️ না দিলে Customer-এর CRM নামই বসে (admin-এর order form কোনো নাম টাইপ
   * করায় না, তাই ওখানে এটাই ঠিক)। আগে storefront-এর টাইপ করা নামও ফেলে
   * দিয়ে CRM নাম বসানো হতো — মালিকের রায়, ৩ আগস্ট ২০২৬: *"sender আর
   * receiver সবার information-ই আসা লাগবে; যে module থেকেই আসুক, data তো
   * আসতে হবে।"* রসিদ = order-এর মুহূর্তের সত্যি; CRM-এর নাম CRM-এ থাকে।
   */
  senderName?: string;
  senderPhone?: string;
  senderEmail?: string;

  isGift?: boolean;
  recipientName?: string;
  recipientPhone?: string;
  recipientCustomerId?: string;
  giftMessage?: string;
  anonymousGift?: boolean;
  photoUpdates?: boolean;

  zone: DeliveryZone;
  address: string;
  deliveryNotes?: string;
  methodLabel?: string;
  date?: string;
  slotLabel?: string;
  etaLabel?: string;

  paymentMethod?: PaymentMethod; // online | cod
  couponCode?: string;
  discountPaisa?: number;
  /** DEC-OFR-003 — false switches the offer engine off for this order (default on) */
  applyOffers?: boolean;
  /** DEC-DLV-002 — FK into the Delivery masters; methodLabel/slotLabel stay the snapshot */
  deliveryMethodId?: string;
  deliverySlotId?: string;
  deliveryPaisa?: number;
  deliveryWaivedPaisa?: number;

  lines: OrderLineInput[];
  internalNote?: string;
  actorName?: string;

  /**
   * MKT-D02 — order-টা কীভাবে এল, কাঁচা অবস্থায়। Sales-এর ঘর, Marketing পড়ে।
   * Schema নিজেই লিখে রেখেছিল: *"Empty until the new storefront forwards
   * them"* — ৪ আগস্ট ২০২৬ থেকে storefront এগুলো পাঠায়।
   */
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  refCode?: string;
}

export interface EditOrderDto {
  recipientName?: string;
  recipientPhone?: string;
  giftMessage?: string;
  address?: string;
  deliveryNotes?: string;
  methodLabel?: string;
  date?: string;
  slotLabel?: string;
  internalNote?: string;

  /* money edits — open until the order closes */
  adjustmentPaisa?: number;
  /** what the adjustment is for — written to the activity log (labels live in the audit trail) */
  adjustmentNote?: string;
  /** delivery charge on this order (Sales owns the snapshot; Delivery owns the policy) */
  deliveryPaisa?: number;
  lineDiscounts?: { lineId: string; discountPaisa: number }[];

  /* item edits — only while gate.items is open (before Delivery starts preparing, DEC-MOD-003) */
  addLines?: OrderLineInput[];
  removeLineIds?: string[];
  lineQty?: { lineId: string; qty: number }[];

  actorName?: string;
}

export interface AddPaymentDto {
  kind: PaymentTxnKind; // ADVANCE | PAYMENT | COD_COLLECTED | REFUND
  amountPaisa: number;
  method?: PaymentMethod;
  /**
   * DEC-GBL-006 — WHICH bKash number or bank account took it. The column has
   * existed since 21 Aug; until 26 Aug nothing on this path ever filled it, so
   * every order payment fell back to the method's default account. Optional
   * because a method with one account has no choice to make.
   */
  accountId?: string;
  /**
   * DEC-FIN-029 — what the channel kept, when the channel says so
   * (SSLCommerz `store_amount`). Null/absent means it did not say; it is never
   * calculated from a rate. See `gatewayFee` in `shop/payment.ts`.
   */
  feePaisa?: number | null;
  reference?: string;
  note?: string;
  actorName?: string;
}

export interface AddPhotoDto {
  kind: OrderPhotoKind; // PREP | DELIVERY (Delivery-owned)
  url?: string;
  bg?: string;
  caption?: string;
  capturedBy?: string;
  actorName?: string;
}

export interface CancelOrderDto {
  reason?: string;
  actorName?: string;
}

export interface ListOrderQuery {
  /** DEC-RTN — include counter (POS) bills; the online lists leave them out */
  includeCounter?: string;
  page?: string;
  pageSize?: string;
  search?: string;
  salesStatus?: string;
  deliveryStatus?: string;
  channelId?: string;
  needsAction?: string; // "true" = salesStatus placed
}
