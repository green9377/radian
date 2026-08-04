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
   * এই line-এ বসা ছাড় — DEC-PRD-018-এর bundle ছাড় storefront থেকে এখানেই আসে।
   *
   * ⚠️ আগে সবসময় ০ বসত। তখন bundle-এর ছাড় দিতে হলে `unitPaisa` কমিয়ে
   * পাঠানো ছাড়া উপায় ছিল না, আর তাতে রসিদে পণ্যের আসল দামটাই মিথ্যা হয়ে
   * যেত — গ্রাহক দেখতেন ৳১,১৭০ দামের গোলাপ, অথচ দোকান বেচে ৳১,২৯৯-এ।
   * এখন দাম আর ছাড় আলাদা, ঠিক যেমন staff-এর হাতে দেওয়া ছাড়ের বেলায় হয়।
   */
  discountPaisa?: number;
  /** কোন পর্দা থেকে line-টা যোগ হয়েছে — add-on performance report এখান থেকেই আসে */
  addedFrom?: 'PRODUCT' | 'CART' | 'CHECKOUT';
  /**
   * DEC-PRD-014 — কোন রঙ/ফ্লেভার বিক্রি হচ্ছে। দিলে Preparing-এর stock −qty
   * **এই variant-এর** ঘরে কাটে, product-এর ঘরে নয় — কারণ variant থাকলে
   * মজুদের সত্যিটা ওখানেই, আর সব পর্দা ওরই যোগফল দেখায়।
   */
  variantId?: string;
  /** snapshot — মালিক রঙের নাম বদলালেও পুরনো রসিদ যা ছিল তাই থাকে */
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

export interface AssignCourierDto {
  courierName: string;
  courierConsignment?: string;
  courierTrackingUrl?: string;
  actorName?: string;
}

export interface CancelOrderDto {
  reason?: string;
  actorName?: string;
}

export interface ListOrderQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  salesStatus?: string;
  deliveryStatus?: string;
  channelId?: string;
  needsAction?: string; // "true" = salesStatus placed
}
