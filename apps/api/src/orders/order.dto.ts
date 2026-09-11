import { BadRequestException } from '@nestjs/common';
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
   * How this order reaches the customer (9 Sep 2026). Left unsaid it is a
   * DELIVERY, which is what every order was until "collect from shop".
   *
   * ⚠️ PICKUP is what keeps a collected order off the delivery board — the
   * board asks for `fulfillmentType: DELIVERY` — so nothing else had to be
   * taught that no rider is coming.
   */
  fulfillmentType?: 'DELIVERY' | 'PICKUP';

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
   * Money taken in hand at the moment the order is written — the counter's
   * cash, a bKash send read out over the phone.
   *
   * ⚠️ IT IS PART OF THE CREATE TRANSACTION (audit 11 Sep 2026 #28). The admin
   * form used to place the order and then record the payment as a second
   * request; when the second one failed the order sat there unpaid, nobody
   * noticed, and staff typed the whole thing again. Either both land or
   * neither does.
   */
  advancePaisa?: number;
  /** how that advance arrived — defaults to the order's own payment method */
  advanceMethod?: PaymentMethod;
  /** DEC-GBL-006 — WHICH bKash number or bank account took it */
  advanceAccountId?: string;
  advanceReference?: string;

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
  /**
   * Does the customer get the preparation and delivery photographs?
   *
   * ⚠️ It was set once at checkout and could never be changed again — the
   * admin printed "Photo updates are on" and gave nobody a way to turn them
   * off (owner, 8 Sep 2026). It rides the NOTES gate: open for as long as the
   * order is, because the photographs are taken late.
   */
  photoUpdates?: boolean;
  address?: string;
  deliveryNotes?: string;
  methodLabel?: string;
  date?: string;
  slotLabel?: string;
  /**
   * DEC-DLV-002 — the FKs behind the label snapshots.
   *
   * ⚠️ Added 11 Sep 2026 (audit). The Edit screen offered date and slot as
   * free text, so `slotLabel` changed and `deliverySlotId` went on pointing at
   * the slot the order was booked into: the overview counted the parcel in the
   * wrong slot, and a typo ("10 AM - 1PM") grew a slot card of its own. Sending
   * the id alongside the label keeps the two in step; `null` clears it.
   */
  deliveryMethodId?: string | null;
  deliverySlotId?: string | null;
  internalNote?: string;

  /* money edits — open until the order closes */
  adjustmentPaisa?: number;
  /** what the adjustment is for — written to the activity log (labels live in the audit trail) */
  adjustmentNote?: string;
  /** delivery charge on this order (Sales owns the snapshot; Delivery owns the policy) */
  deliveryPaisa?: number;
  lineDiscounts?: { lineId: string; discountPaisa: number }[];

  /**
   * Attach add-ons to an item that is already on the order — audit 11 Sep 2026.
   *
   * ⚠️ An add-on is NOT a line of its own: `OrderLine` hangs off a Product and
   * an add-on is not one. It lives in `OrderLine.addonIds`, which is what
   * Preparing's stock deduction and `cancel()`'s revert both read (owner's
   * ruling, 4 Aug 2026 — an add-on is stock like anything else).
   *
   * The Edit screen used to record an add-on as a nameless number in
   * `adjustmentPaisa`: the card never reached the picking list, its stock was
   * never taken off the shelf, and cancelling the order gave back the flowers
   * but not the card. This puts it where it belongs, and Preparing/edit
   * deducts it exactly like every other add-on.
   *
   * ⚠️ IT DOES NOT CHANGE THE PRICE. What an add-on added after the order was
   * placed should cost is a rule nobody has stated — see "Needs owner
   * confirmation" in notes/B.md. Staff bill for it with a charge if they mean
   * to, which is a deliberate, audited act rather than a silent one.
   */
  lineAddons?: { lineId: string; addonIds: string[] }[];

  /* item edits — only while gate.items is open (before Delivery starts preparing, DEC-MOD-003) */
  addLines?: OrderLineInput[];
  removeLineIds?: string[];
  lineQty?: { lineId: string; qty: number }[];

  actorName?: string;
}

export interface AddPaymentDto {
  /**
   * ADVANCE | PAYMENT | COD_COLLECTED | REFUND.
   *
   * ⚠️ OPTIONAL SINCE 11 SEP 2026 (audit #13). Left unsaid, the service picks
   * it from the order's payment METHOD: online is a PAYMENT, cash on a COD
   * order that settles the bill is COD_COLLECTED, cash that does not settle it
   * is a part PAYMENT. The screen used to default every movement to
   * COD_COLLECTED, which put "COD collected" on online orders and on part
   * payments that still had money owing.
   */
  kind?: PaymentTxnKind;
  /** left at 0/absent: the whole outstanding due, or on a REFUND the net already paid */
  amountPaisa?: number;
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

/**
 * POST /orders/:id/fail — audit 11 Sep 2026 #19.
 *
 * The screen has always asked three questions (why · a note · retry, keep or
 * cancel) and this endpoint took NONE of them: the reason was dropped on the
 * floor and "Cancel order" did nothing at all unless a delivery assignment
 * happened to exist. All three are stored now, and CANCEL runs the real
 * cancel path with its refund ladder.
 */
export interface FailOrderDto {
  /** ReasonMaster id (purpose DELIVERY_FAIL), when one was picked */
  failReasonId?: string;
  /** the label snapshot, or whatever was typed */
  reason?: string;
  note?: string;
  decision?: FailDecision;
  actorName?: string;
}
export type FailDecision = 'RETRY' | 'KEEP' | 'CANCEL';
export const FAIL_DECISIONS: FailDecision[] = ['RETRY', 'KEEP', 'CANCEL'];

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
  /*  Server-side list (audit 11 Sep 2026). Everything the All-orders screen
      used to do to a page of 100 rows in the browser, done in the database
      over the whole set.  */
  /** free text — order no / sender / recipient / phone / address */
  q?: string;
  /** the screen's own segments: placed | fulfilling | confirmed | delivered | due | cancelled */
  seg?: string;
  paymentMethod?: string; // online | cod
  isGift?: string; // "true" | "false"
  zone?: string; // DHAKA | BANGLADESH
  /** placedAt window, YYYY-MM-DD (Dhaka's day) or a full ISO instant */
  from?: string;
  to?: string;
  /** "true" = only orders still owing money */
  due?: string;
}

/* ------------------------------------------------------------------
   VALIDATION — audit 11 Sep 2026 #29.

   ⚠️ WRITTEN BY HAND, DELIBERATELY. The audit's suggestion was
   class-validator DTOs behind a global ValidationPipe, and that is the right
   shape — but `class-validator` and `class-transformer` are NOT dependencies
   of this API (check package.json), these DTOs are `interface`s imported with
   `import type`, and every other module's controller imports them the same
   way. Adding the packages, turning eleven interfaces into classes and
   switching on a global pipe changes the request contract of EVERY module at
   once, which is not a change one module's fix may make on its own.

   So the same guarantees are enforced here, at the door, in plain code:
   nothing negative, nothing fractional where the column is an integer, no
   unknown enum value cast into the database, no blank address or zone. The
   sentences are written for whoever reads them — this throws on the public
   checkout too.

   When the owner decides to adopt class-validator globally, these functions
   are what the decorators have to reproduce; until then they are the rule.
   ------------------------------------------------------------------ */

function fail(msg: string): never {
  throw new BadRequestException(msg);
}

/** an integer number of paisa, never negative, never a fraction */
export function assertPaisa(v: unknown, what: string, opts: { allowNegative?: boolean } = {}): void {
  if (v === undefined || v === null) return;
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what} must be a number of paisa`);
  if (!Number.isInteger(v)) fail(`${what} must be a whole number of paisa (money is counted in paisa, never fractions)`);
  if (!opts.allowNegative && v < 0) fail(`${what} cannot be negative`);
}

function assertText(v: unknown, what: string, max = 2000): void {
  if (v === undefined || v === null) return;
  if (typeof v !== 'string') fail(`${what} must be text`);
  if (v.length > max) fail(`${what} is too long (max ${max} characters)`);
}

function assertOneOf(v: unknown, allowed: readonly string[], what: string): void {
  if (v === undefined || v === null || v === '') return;
  if (typeof v !== 'string' || !allowed.includes(v))
    fail(`${what} must be one of: ${allowed.join(', ')}`);
}

const ZONES = ['DHAKA', 'BANGLADESH', 'COUNTER'] as const;
const METHODS = ['online', 'cod'] as const;
const TXN_KINDS = ['ADVANCE', 'PAYMENT', 'COD_COLLECTED', 'REFUND'] as const;
const PHOTO_KINDS = ['PREP', 'DELIVERY'] as const;

function assertLines(lines: OrderLineInput[] | undefined, what: string): void {
  if (!lines) return;
  if (!Array.isArray(lines)) fail(`${what} must be a list of items`);
  for (const l of lines) {
    if (!l || typeof l.productId !== 'string' || !l.productId.trim())
      fail(`${what}: every item needs a product`);
    if (typeof l.qty !== 'number' || !Number.isInteger(l.qty) || l.qty < 1)
      fail(`${what}: quantity must be a whole number of at least 1`);
    assertPaisa(l.unitPaisa, `${what}: unit price`);
    assertPaisa(l.discountPaisa, `${what}: item discount`);
  }
}

export function validateCreateOrder(dto: CreateOrderDto): void {
  if (!dto || typeof dto !== 'object') fail('order body is missing');
  if (typeof dto.customerId !== 'string' || !dto.customerId.trim()) fail('customerId is required');
  if (typeof dto.channelId !== 'string' || !dto.channelId.trim()) fail('channelId is required');
  if (typeof dto.address !== 'string' || !dto.address.trim())
    fail('A delivery address is required — the rider has to be told where to go.');
  assertText(dto.address, 'address');
  if (!dto.zone) fail('A delivery zone is required — inside Dhaka or nationwide.');
  assertOneOf(dto.zone, ZONES, 'zone');
  assertOneOf(dto.paymentMethod, METHODS, 'paymentMethod');
  assertOneOf(dto.fulfillmentType, ['DELIVERY', 'PICKUP'], 'fulfillmentType');
  assertOneOf(dto.advanceMethod, METHODS, 'advanceMethod');
  if (dto.isGift && !(dto.recipientName ?? '').trim())
    fail('A gift order needs a recipient name — somebody has to be asked for at the door.');
  for (const [v, what] of [
    [dto.discountPaisa, 'discount'],
    [dto.deliveryPaisa, 'delivery charge'],
    [dto.deliveryWaivedPaisa, 'waived delivery'],
    [dto.advancePaisa, 'advance'],
  ] as const) {
    assertPaisa(v, what);
  }
  assertText(dto.senderName, 'senderName', 200);
  assertText(dto.senderPhone, 'senderPhone', 40);
  assertText(dto.recipientName, 'recipientName', 200);
  assertText(dto.recipientPhone, 'recipientPhone', 40);
  assertText(dto.giftMessage, 'giftMessage');
  assertText(dto.deliveryNotes, 'deliveryNotes');
  assertText(dto.internalNote, 'internalNote');
  assertText(dto.couponCode, 'couponCode', 64);
  assertText(dto.date, 'date', 40);
  assertText(dto.slotLabel, 'slotLabel', 120);
  assertText(dto.methodLabel, 'methodLabel', 120);
  if (!Array.isArray(dto.lines) || dto.lines.length === 0) fail('order needs at least one line');
  assertLines(dto.lines, 'items');
}

export function validateEditOrder(dto: EditOrderDto): void {
  if (!dto || typeof dto !== 'object') fail('edit body is missing');
  if (dto.address !== undefined && !String(dto.address).trim())
    fail('The delivery address cannot be emptied — the rider has to be told where to go.');
  /*  ⚠️ adjustmentPaisa MAY be negative: a goodwill discount is an adjustment
      downwards. Everything else may not.  */
  assertPaisa(dto.adjustmentPaisa, 'adjustment', { allowNegative: true });
  assertPaisa(dto.deliveryPaisa, 'delivery charge');
  assertText(dto.address, 'address');
  assertText(dto.deliveryNotes, 'deliveryNotes');
  assertText(dto.internalNote, 'internalNote');
  assertText(dto.adjustmentNote, 'adjustmentNote');
  assertText(dto.recipientName, 'recipientName', 200);
  assertText(dto.recipientPhone, 'recipientPhone', 40);
  assertText(dto.giftMessage, 'giftMessage');
  assertText(dto.date, 'date', 40);
  assertText(dto.slotLabel, 'slotLabel', 120);
  assertText(dto.methodLabel, 'methodLabel', 120);
  assertLines(dto.addLines, 'added items');
  if (dto.removeLineIds !== undefined && !Array.isArray(dto.removeLineIds))
    fail('removeLineIds must be a list');
  for (const q of dto.lineQty ?? []) {
    if (!q || typeof q.lineId !== 'string') fail('lineQty: every entry needs a lineId');
    if (typeof q.qty !== 'number' || !Number.isInteger(q.qty) || q.qty < 1)
      fail('lineQty: quantity must be a whole number of at least 1');
  }
  for (const d of dto.lineDiscounts ?? []) {
    if (!d || typeof d.lineId !== 'string') fail('lineDiscounts: every entry needs a lineId');
    assertPaisa(d.discountPaisa, 'line discount');
  }
  for (const a of dto.lineAddons ?? []) {
    if (!a || typeof a.lineId !== 'string') fail('lineAddons: every entry needs a lineId');
    if (!Array.isArray(a.addonIds)) fail('lineAddons: addonIds must be a list');
  }
}

export function validateAddPayment(dto: AddPaymentDto): void {
  if (!dto || typeof dto !== 'object') fail('payment body is missing');
  assertOneOf(dto.kind, TXN_KINDS, 'kind');
  assertOneOf(dto.method, METHODS, 'method');
  assertPaisa(dto.amountPaisa, 'amount');
  if (dto.feePaisa !== undefined && dto.feePaisa !== null) assertPaisa(dto.feePaisa, 'gateway fee');
  assertText(dto.reference, 'reference', 200);
  assertText(dto.note, 'note');
}

export function validateAddPhoto(dto: AddPhotoDto): void {
  if (!dto || typeof dto !== 'object') fail('photo body is missing');
  assertOneOf(dto.kind, PHOTO_KINDS, 'kind');
  if (!dto.kind) fail('kind is required — PREP or DELIVERY');
  assertText(dto.url, 'url', 2048);
  assertText(dto.caption, 'caption', 500);
}

export function validateFailOrder(dto: FailOrderDto): void {
  if (!dto) return;
  assertOneOf(dto.decision, FAIL_DECISIONS, 'decision');
  assertText(dto.reason, 'reason', 500);
  assertText(dto.note, 'note');
}
