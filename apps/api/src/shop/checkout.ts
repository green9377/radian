import {
  BadRequestException,
  ConflictException,
  Controller,
  Body,
  Get,
  Module,
  Post,
  Query,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DeliveryZone, PaymentMethod } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';
import { Public } from '../auth/auth.guard';
import { cartTypeSets, methodOkForCart } from '../common/delivery-rule';
import { OffersModule } from '../offers/offers.module';
import { OffersService } from '../offers/offers.service';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';
import { ProductDetailModule, ProductDetailService } from './product-detail';
import type { OrderLineInput } from '../orders/order.dto';
import { WhatsAppCloudModule, WhatsAppCloudService } from '../common/whatsapp-cloud';
import { MessagingModule } from '../messaging/messaging.controller';
import { OrderMessagesService } from '../messaging/order-messages.service';
import { CheckoutLeadsService } from '../messaging/checkout-leads.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  STOREFRONT CHECKOUT — the one door between the shop window and the ledger.

  Until now the storefront had no such door. `CheckoutView.tsx` built an order
  object, wrote it to `localStorage` and pushed to `/order-success`; the admin
  Orders screen never saw it, and `Order` stayed empty on a shop that was
  otherwise live. Everything BELOW this file already existed and was already
  locked — `OrdersService.create` freezes line snapshots, runs the offer
  engine, enforces the COD rules, books workshop capacity at confirm and
  deducts stock at preparing. Nothing here re-decides any of that. This file
  only translates a browser cart into the arguments that service already takes.

  ⚠️ THE ONE RULE THIS FILE EXISTS TO ENFORCE: THE CLIENT NEVER SENDS MONEY.

  The request carries slugs, ids and quantities. Every paisa — size price,
  variant price, bundle discount, add-on price, delivery fee — is read back out
  of the database here. A cart in a browser is a suggestion, not a receipt; the
  same request re-sent with `unitPaisa: 1` must produce the same order at the
  same price, and it does, because no field of that name is read.

  ⚠️ ADD-ON STOCK — RESOLVED by the owner, 4 Aug 2026: *"add-এর জিনিসটা
  inventory-তে আছে কিনা দেখে তবেই sell/process।"* Lines now carry `addonIds`;
  intake refuses a tracked add-on that is short, preparing deducts it, cancel
  reverts it. Untracked (stockQty null) add-ons stay uncounted — that is the
  admin's own switch.

  ⚠️ SLOT CAPACITY — দুই দরজায় দুই নিয়ম, দুটোই মালিকের:
  · STOREFRONT: ভরা slot **বন্ধ** — "next slot দেখাবে, ওই slot-এ order নেবে
    না" (৪ আগস্ট, বরাবরের নিয়ম)। `deliveryFor()` দরজাতেই গোনে।
  · ADMIN: warn-only (DLV-R05, ১ আগস্ট) — ব্যস্ত দিনে মালিক জেনে-বুঝে
    overbook করতে পারেন; গ্রাহক পারেন না।
  ═══════════════════════════════════════════════════════════════════════════
*/

/* ─────────────────── what the browser sends ─────────────────── */

/** one line of `useCartStore`, as it stands in the browser */
export interface CheckoutItemIn {
  slug: string;
  /** DEC-PRD-012 — colour/flavour; absent when the product has no variants */
  variantId?: string;
  sizeId?: string;
  /** DEC-PRD-018 — which of the one bundle list was ticked */
  bundleIds?: string[];
  /** `AddOn` ids — `addonKeys` in the browser store */
  addonIds?: string[];
  persoText?: string;
  qty: number;
}

export interface QuoteIn {
  items: CheckoutItemIn[];
  zone?: 'DHAKA' | 'BANGLADESH' | 'dhaka' | 'bangladesh';
  deliveryMethodId?: string;
  deliverySlotId?: string;
  couponCode?: string;
  paymentMethod?: 'online' | 'cod';
  /**
   * Used ONLY to find an existing customer, so a first-order offer is judged
   * against the person who is actually buying. Never creates anybody.
   */
  phone?: string;
}

export interface PlaceOrderIn extends QuoteIn {
  senderName: string;
  senderPhone: string;
  senderEmail?: string;

  isGift?: boolean;
  recipientName?: string;
  recipientPhone?: string;
  giftMessage?: string;
  anonymousGift?: boolean;
  photoUpdates?: boolean;

  address: string;
  deliveryNotes?: string;
  /** "2026-08-05" — the day the customer chose */
  date?: string;

  /** where the browser should be sent back to after the gateway */
  returnBaseUrl?: string;

  /*  ⚠️ DEC-WA-004 — এই ব্রাউজারের অসমাপ্ত checkout-এর সারিটা কোনটা।
      order হয়ে গেলে ওই সারিটা CONVERTED হয়, নাহলে ১৫ মিনিট পর সদ্য
      order করা গ্রাহকের কাছেই "আপনার cart রাখা আছে" চলে যেত।  */
  clientKey?: string;

  /** MKT-D02 — বিজ্ঞাপন-চিহ্ন, storefront-এর প্রথম দর্শনে ধরা */
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  refCode?: string;

  /**
   * কত টাকা দেবেন বলে গ্রাহক বোতাম চেপেছেন — শেষ quote-এর `totalPaisa`।
   *
   * ⚠️ পাঠালে server এর চেয়ে **বেশি** টাকার order কখনো বানাবে না; বেশি হলে
   * ৪০৯ দিয়ে ফিরিয়ে দেবে, আর পর্দা নতুন দাম দেখিয়ে আবার জিজ্ঞেস করবে।
   *
   * কম হলে বানাবে — কারণ কম হওয়ার একটাই কারণ, order দেওয়ার সাথে সাথে
   * গ্রাহকের account তৈরি হওয়ায় "প্রথম order-এর ছাড়" (OFR-R02) চালু হয়ে
   * যাওয়া। quote-এর সময় তিনি এখনো কেউ নন, তাই ছাড়টা তখন গোনা যায় না।
   * কম দাম কোনো ক্ষতি নয়; বেশি দাম প্রতিশ্রুতি ভাঙা।
   */
  expectedTotalPaisa?: number;
}

/* ─────────────────── what goes back ─────────────────── */

export interface QuoteLineOut {
  slug: string;
  name: string;
  imageUrl: string | null;
  sizeLabel: string | null;
  variantLabel: string | null;
  bundleLabels: string[];
  addonLabels: string[];
  qty: number;
  /** one unit, after the bundle discount, including add-ons */
  unitPaisa: number;
  linePaisa: number;
  /** zone conflict — a Dhaka-only product with the shop set to nationwide */
  held: boolean;
}

export interface QuoteOut {
  lines: QuoteLineOut[];
  /** in the cart but not deliverable to the chosen zone; excluded from money */
  held: QuoteLineOut[];
  /** slugs the catalogue no longer has */
  missing: string[];
  subtotalPaisa: number;
  deliveryPaisa: number;
  deliveryWaivedPaisa: number;
  discountPaisa: number;
  totalPaisa: number;
  /** which offers the engine actually applied, in the shop's own words */
  applied: { name: string; code: string | null; discountPaisa: number; freeDelivery: boolean }[];
  /** why a typed code did not work — shown under the coupon box (OFR-R08) */
  couponError: string | null;
  /** the cart's "spend ৳X more and get…" bar. Null when nothing is in reach. */
  nextReward: NextReward | null;
}

/**
 * The progress bar at the top of the cart.
 *
 * ⚠️ This replaces `FREE_DELIVERY_PROMO` in `_data/promo.ts`, which was a
 * ৳3,000 threshold typed into a file. The owner could not change it, and the
 * cart advertised it whether or not any such offer existed.
 *
 * ⚠️ WHAT IT DELIBERATELY DOES NOT DO. It looks only at SITEWIDE and
 * FREE_DELIVERY offers that apply BY THEMSELVES. A category offer's threshold
 * would be a lie on a cart of the wrong category, and a coupon nobody has been
 * given is not a reward anybody is "away from". Narrow and true beats broad
 * and nearly right on the one number a shopper is being asked to chase.
 */
export interface NextReward {
  thresholdPaisa: number;
  remainingPaisa: number;
  /** what it is worth once reached — 0 for free delivery with no fee chosen */
  savePaisa: number;
  /** the shop's own words for it: publicTitle, else benefitLine, else name */
  label: string;
  /** 0–100 */
  pct: number;
}

/* ─────────────────── DEC-PRD-018, server side ─────────────────── */

/**
 * The same arithmetic as `_data/bundlePricing.ts` in the storefront, and it has
 * to be, because the number this returns is the number the customer just read
 * on the page. Basis points and a single divide at the end, for the same
 * reason it is written that way there: multiplying by 0.1 turns ৳1,299 into
 * ৳1,169.0999999999999 one day and nobody can say which day.
 */
function applyDiscount(paisa: number, type: string, value: number): number {
  if (type === 'FLAT') return Math.max(0, paisa - value);
  if (type === 'PERCENT') return Math.max(0, Math.round((paisa * (10000 - value)) / 10000));
  return paisa;
}

/** 900 → "3:00 PM" — same wording the storefront's slot chips use */
function minLabel(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}

/** an OrderLine-to-be, plus the bits the quote screen wants to show */
interface Resolved {
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  sizeLabel: string | null;
  /** DEC-PRD-014 — stock এই variant-এর ঘর থেকে কাটবে, তাই id-টা line-এ যায় */
  variantId: string | null;
  variantLabel: string | null;
  /** যে AddOn-গুলো সত্যিই এই line-এ আছে (id) — OrderLine-এ যায় */
  addonIdsPicked: string[];
  bundleLabels: string[];
  addonLabels: string[];
  persoText?: string;
  qty: number;
  /** per unit, before the bundle discount */
  grossUnitPaisa: number;
  /** the whole line's share of the bundle discount */
  discountPaisa: number;
  held: boolean;
  /** the bundle picks, each its own order line so stock deducts (DEC-MOD-003) */
  extras: {
    productId: string;
    name: string;
    qty: number;
    unitPaisa: number;
    discountPaisa: number;
  }[];
}

@Injectable()
export class CheckoutService {
  private readonly log = new Logger('Checkout');

  constructor(
    private readonly prisma: PrismaService,
    private readonly details: ProductDetailService,
    private readonly offers: OffersService,
    private readonly orders: OrdersService,
    private readonly whatsapp: WhatsAppCloudService,
    private readonly orderMessages: OrderMessagesService,
    private readonly leads: CheckoutLeadsService,
  ) {}

  /* ══════════════════ 1. price the cart ══════════════════ */

  /**
   * ⚠️ THREE SPELLINGS FOR ONE ZONE, AND THEY MUST ALL LAND IN THE SAME PLACE.
   *
   * The database enum says `BANGLADESH`. `_data/shop.ts` sends `NATIONWIDE`.
   * The browser's own zone store says `bangladesh`, lower case. All three are
   * already in use and none of them is going away, so every entrance has to
   * accept all three.
   *
   * This was written checking `BANGLADESH` only, which meant `?zone=NATIONWIDE`
   * — the exact string the storefront's own `zoneCode()` produces — quietly
   * priced a nationwide cart as if it were inside Dhaka. It never showed up in
   * testing because the self-test sends `DHAKA`.
   */
  private normZone(z: QuoteIn['zone'] | string): DeliveryZone {
    const s = String(z ?? '').toUpperCase();
    return s === 'BANGLADESH' || s === 'NATIONWIDE'
      ? DeliveryZone.BANGLADESH
      : DeliveryZone.DHAKA;
  }

  /**
   * Turn browser cart lines into priced, database-backed lines.
   *
   * ⚠️ One `detail()` per slug, run in parallel — the same shape the cart page
   * already fetches with. A cart is small by nature. If they ever stop being
   * small the answer is a batch endpoint, not a cache here, because a cache is
   * exactly the stale price this whole design exists to avoid.
   */
  private async resolve(items: CheckoutItemIn[], zone: DeliveryZone) {
    if (!items?.length) throw new BadRequestException('cart is empty');

    const addonIds = [...new Set(items.flatMap((i) => i.addonIds ?? []))];
    const slugs = [...new Set(items.map((i) => i.slug))];

    /*  ⚠️ `detail()` answers the PAGE, and a page has no use for a database
        id — so it does not send one. `OrderLine.productId` is a foreign key
        and must have one. Rather than widen the page's contract for the sake
        of one caller, the ids are looked up here, in one query.  */
    const [details, addons, idRows] = await Promise.all([
      Promise.all(items.map((i) => this.details.detail(i.slug).catch(() => null))),
      this.details.addonsByIds(addonIds),
      this.prisma.db.product.findMany({
        where: { slug: { in: slugs } },
        select: { id: true, slug: true },
      }),
    ]);
    const addonById = new Map(addons.map((a) => [a.id, a]));
    const idBySlug = new Map(idRows.map((r) => [r.slug, r.id]));

    const lines: Resolved[] = [];
    const missing: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const d = details[i];
      const productId = idBySlug.get(it.slug);
      if (!d || !productId) {
        missing.push(it.slug);
        continue;
      }

      const qty = Math.max(1, Math.min(20, Math.round(it.qty || 1)));

      /*  size/variant না মিললে প্রথমটা — ঠিক যা storefront-এর resolveCart()
          করে। মালিক একটা মাপ তুলে দিলে cart যেন ভেঙে না পড়ে; দাম নড়ে, আর
          সেটাই সৎ সংকেত।  */
      const size = d.sizes.find((s) => s.id === it.sizeId) ?? d.sizes[0] ?? null;
      const variant = (d.variants ?? []).find((v) => v.id === it.variantId) ?? null;

      /*  variant-এর নিজের দাম থাকলে সেটাই base — PdpView আর resolveCart-এর
          সাথে হুবহু একই শর্ত, তাই তিন জায়গায় তিন দাম হওয়ার পথ নেই।  */
      const basePaisa =
        variant && variant.pricePaisa !== d.pricePaisa
          ? variant.pricePaisa
          : (size?.pricePaisa ?? d.pricePaisa);

      const picks = (d.bundle?.items ?? []).filter((b) =>
        (it.bundleIds ?? []).includes(b.id),
      );
      const picked = (it.addonIds ?? [])
        .map((k) => addonById.get(k))
        .filter((a): a is NonNullable<typeof a> => !!a);
      const addonPaisa = picked.reduce((n, a) => n + a.pricePaisa, 0);

      /*  DEC-PRD-018 — কিছু না নিলে ছাড় নেই। শর্তটা এখানেও, কারণ ছাড়টা
          main product-এর দামের উপরেও বসে, আর তালিকা থেকে কিছু না নিলে
          সেটা বসা মানে তালিকাটা বানানোরই মানে থাকত না।  */
      const beforePaisa = basePaisa + picks.reduce((n, p) => n + p.pricePaisa, 0);
      const savePerUnit =
        d.bundle && picks.length > 0
          ? beforePaisa - applyDiscount(beforePaisa, d.bundle.discountType, d.bundle.discountValue)
          : 0;

      /*
        ছাড়টা main আর bundle line-গুলোর মধ্যে দামের অনুপাতে ভাগ হয়।

        ⚠️ পুরোটা main line-এ বসানো যেত না: ৳100-এর ফুলের সাথে ৳1,000-এর
        কেক নিলে ছাড় main line-এর দামের চেয়েও বড় হয়ে যায়, আর তখন একটা
        line ঋণাত্মক হয়ে বাকি order-এর দাম কমিয়ে দিত।

        ⚠️ শেষ পয়সাটা main line-এ — ভাগ করলে যা বাদ পড়ে। এক পয়সা তুচ্ছ,
        কিন্তু হারিয়ে যাওয়া এক পয়সা মানে রসিদের যোগফল মেলে না, আর সেটাই
        হিসাবরক্ষক প্রথমে দেখেন।
      */
      const totalSave = savePerUnit * qty;
      const extras = picks.map((p) => ({
        productId: p.id,
        name: p.name,
        qty,
        unitPaisa: p.pricePaisa,
        discountPaisa:
          beforePaisa === 0
            ? 0
            : Math.floor((totalSave * p.pricePaisa) / beforePaisa),
      }));
      const mainDiscount = totalSave - extras.reduce((n, e) => n + e.discountPaisa, 0);

      lines.push({
        productId,
        slug: d.slug,
        name: d.name,
        imageUrl: d.images[0] ?? null,
        sizeLabel: size?.label ?? null,
        variantId: variant?.id ?? null,
        variantLabel: variant?.label ?? null,
        addonIdsPicked: picked.map((a) => a.id),
        bundleLabels: picks.map((p) => p.name),
        addonLabels: picked.map((a) => a.name),
        persoText: it.persoText,
        qty,
        /*  add-on ছাড়ের বাইরে — তালিকার জিনিস নয়, আর মালিকের ছাড়টা
            তালিকার নিচে বসানো (DEC-PRD-018)।  */
        grossUnitPaisa: basePaisa + addonPaisa,
        discountPaisa: mainDiscount,
        held: zone === DeliveryZone.BANGLADESH && d.zone === 'dhaka',
        extras,
      });
    }

    return { lines, missing };
  }

  /* ══════════════════ 2. delivery, from the DB ══════════════════ */

  /**
   * The fee is read here and nowhere else. The storefront sends an id.
   *
   * ⚠️ Trusting a `deliveryPaisa` from the browser was the alternative, and it
   * means anybody who can open dev tools delivers for ৳0. It also means the
   * owner changing a fee in the admin changes nothing on the live shop, which
   * is the quieter half of the same bug.
   */
  private async deliveryFor(
    zone: DeliveryZone,
    methodId?: string,
    slotId?: string,
    /** "2026-08-05" — ভরা-slot গোনা এই দিনের জন্য */
    date?: string,
    /** DEC-DLV-011 — cart-এর slug-গুলো; দিলে method-টা সব product-এ চলে কিনা যাচাই হয় */
    cartSlugs?: string[],
  ) {
    if (!methodId) {
      return { method: null, slot: null, feePaisa: 0, label: null as string | null, eta: null as string | null };
    }
    const method = await this.prisma.db.deliveryMethod.findFirst({
      where: { id: methodId, isActive: true },
      include: { type: { select: { id: true, timing: true } } },
    });
    if (!method) throw new BadRequestException('that delivery option is no longer available');
    if (method.zone !== zone)
      throw new BadRequestException(
        `"${method.label}" is not offered for ${zone === DeliveryZone.DHAKA ? 'Dhaka' : 'nationwide'} delivery`,
      );

    /*  DEC-DLV-011 — মালিকের নিয়ম, ৫ আগস্ট: *"multi product thake cart …
        win hobe se method, je method win hole sobgula product delivery
        possible. order kon vag hobe na."* Menu যা-ই দেখাক, দরজায় আবার গোনা
        হয় — নাহলে dev tools-এ id বসিয়ে যে-কোনো speed নেওয়া যেত।  */
    if (cartSlugs?.length) {
      const sets = await cartTypeSets(this.prisma.db, cartSlugs);
      if (!methodOkForCart(method.type?.timing ?? null, method.type?.id ?? null, sets))
        throw new BadRequestException(
          `"${method.label}" cannot deliver everything in this cart — pick a delivery option all items support`,
        );
    }

    let slot: { id: string; label: string } | null = null;
    if (slotId) {
      const row = await this.prisma.db.deliverySlot.findFirst({
        where: { id: slotId, methodId: method.id, isActive: true },
        select: { id: true, label: true, startMin: true, endMin: true, capacityPerDay: true },
      });
      if (!row) throw new BadRequestException('that delivery time is no longer available');

      /*
        ═══ ভরা slot গ্রাহকের জন্য বন্ধ — মালিকের নিয়ম, বরাবরের ═══
        *"slot book হয়ে গেলে বা ভরে গেলে customer-কে next slot দেখাবে; ওই
        slot-এ অবশ্যই order নেবে না।"*

        গোনার অঙ্ক admin-এর `/delivery/slot-load`-এর হুবহু এক — ওই slot-এ,
        ওই দিনে, cancel-নয় এমন order। দুই পর্দা দুই অঙ্কে গুনলে একদিন
        admin বলত "ভরা" আর দোকান বলত "আসুন"।

        ⚠️ শুধু STOREFRONT-এর দরজা block করে। admin-এর নিজের order form
        warn-only-ই থাকে (DLV-R05, মালিক-locked) — ব্যস্ত দিনে মালিক জেনে-বুঝে
        overbook করতে পারবেন; গ্রাহক পারবেন না।

        ⚠️ capacityPerDay null = সীমা বসানো হয়নি = গোনা হয় না।
      */
      if (row.capacityPerDay !== null && date) {
        const booked = await this.prisma.db.order.count({
          where: {
            deliverySlotId: row.id,
            date,
            deletedAt: null,
            salesStatus: { not: 'cancelled' },
          },
        });
        if (booked >= row.capacityPerDay) {
          throw new BadRequestException(
            'That time slot just filled up — please pick the next available slot.',
          );
        }
      }
      /*
        ⚠️ THE LABEL CARRIES ITS WINDOW, AND `promisedBy` DEPENDS ON IT — 3 Aug 2026.

        `Order.promisedBy` is parsed out of `slotLabel` at create
        (`resolvePromisedBy`, DEC-INT-003). A bare "Afternoon" has no time in
        it, so every storefront order was landing as UNMEASURABLE in the
        on-time report — honest, but empty. "Afternoon · 3:00 PM – 9:00 PM"
        parses, and it is also simply a better receipt.
      */
      slot = {
        id: row.id,
        label:
          row.startMin != null && row.endMin != null
            ? `${row.label} · ${minLabel(row.startMin)} – ${minLabel(row.endMin)}`
            : row.label,
      };
    }

    return {
      method,
      slot,
      feePaisa: method.feePaisa,
      label: method.label,
      eta: method.etaLabel,
    };
  }

  /* ══════════════════ 3. the quote ══════════════════ */

  /**
   * What the cart and checkout screens show. Same inputs as `place()`, same
   * arithmetic, no writes — so the number on the button is the number charged.
   */
  async quote(dto: QuoteIn): Promise<QuoteOut> {
    const zone = this.normZone(dto.zone);
    const { lines, missing } = await this.resolve(dto.items ?? [], zone);

    const active = lines.filter((l) => !l.held);
    const held = lines.filter((l) => l.held);

    const delivery = await this.deliveryFor(
      zone,
      dto.deliveryMethodId,
      dto.deliverySlotId,
      undefined,
      active.map((l) => l.slug), // DEC-DLV-011
    );

    const orderLines = this.toOrderLines(active);
    const subtotalPaisa = orderLines.reduce(
      (n, l) => n + l.unitPaisa! * l.qty - (l.discountPaisa ?? 0),
      0,
    );

    /*  Offers are quoted against the person, not the browser: a "first order
        only" offer must know whether this phone has ordered before. Looked up,
        never created — a quote may not leave a customer row behind.  */
    const customer = dto.phone
      ? await this.prisma.db.customer.findFirst({
          where: { phone: dto.phone.trim() },
          select: { id: true },
        })
      : null;

    let discountPaisa = 0;
    let deliveryWaivedPaisa = 0;
    let applied: QuoteOut['applied'] = [];
    let couponError: string | null = null;

    if (orderLines.length) {
      const q = await this.offers.quote({
        customerId: customer?.id,
        /*  Net unit, exactly as `OrdersService.create` now does it — the two
            must feed the engine the same numbers or the quote and the order
            will disagree the moment a bundle discount is on the line. See the
            long note at that call site.  */
        lines: orderLines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPaisa: Math.round(
            (l.unitPaisa * l.qty - (l.discountPaisa ?? 0)) / Math.max(1, l.qty),
          ),
        })),
        deliveryPaisa: delivery.feePaisa,
        paymentMethod: dto.paymentMethod ?? 'online',
        couponCode: dto.couponCode,
      });
      discountPaisa = q.discountPaisa;
      deliveryWaivedPaisa = q.deliveryWaivedPaisa;
      couponError = q.couponError ?? null;
      applied = q.applied.map((a) => ({
        name: a.name,
        code: a.code ?? null,
        discountPaisa: a.discountPaisa,
        freeDelivery: a.freeDelivery,
      }));
    }

    const totalPaisa = Math.max(
      0,
      subtotalPaisa - discountPaisa + delivery.feePaisa - deliveryWaivedPaisa,
    );

    return {
      lines: active.map((l) => this.toQuoteLine(l)),
      held: held.map((l) => this.toQuoteLine(l)),
      missing,
      subtotalPaisa,
      deliveryPaisa: delivery.feePaisa,
      deliveryWaivedPaisa,
      discountPaisa,
      totalPaisa,
      applied,
      couponError,
      /*  Nothing to chase when nothing in the cart can be delivered — an
          all-held cart would otherwise be told to spend ৳3,000 more on an
          order it cannot place.  */
      nextReward: orderLines.length
        ? await this.nextReward(subtotalPaisa, delivery.feePaisa)
        : null,
    };
  }

  /**
   * The nearest automatic offer this cart has not reached yet.
   *
   * ⚠️ NEAREST, not biggest. A bar that says "৳4,700 more for 20% off" when
   * ৳300 more would have got free delivery pushes nobody; it just reads as
   * expensive. The one within reach is the one worth showing.
   */
  private async nextReward(
    subtotalPaisa: number,
    deliveryPaisa: number,
  ): Promise<NextReward | null> {
    const now = new Date();
    const rows = await this.prisma.db.offer.findMany({
      where: {
        status: 'approved',
        mechanism: 'AUTOMATIC',
        shape: { in: ['SITEWIDE', 'FREE_DELIVERY'] },
        minSpendPaisa: { gt: subtotalPaisa },
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { minSpendPaisa: 'asc' },
      take: 1,
      select: {
        name: true,
        publicTitle: true,
        benefitLine: true,
        minSpendPaisa: true,
        discountType: true,
        discountValue: true,
        maxDiscountPaisa: true,
      },
    });
    const o = rows[0];
    if (!o?.minSpendPaisa) return null;

    /*  What it will be worth AT the threshold, not at today's subtotal —
        that is the number the shopper is being asked to reach.  */
    let savePaisa = 0;
    if (o.discountType === 'FREE_DELIVERY') savePaisa = deliveryPaisa;
    else if (o.discountType === 'FLAT') savePaisa = o.discountValue;
    else if (o.discountType === 'PERCENT')
      savePaisa = Math.round((o.minSpendPaisa * o.discountValue) / 10000);
    if (o.maxDiscountPaisa) savePaisa = Math.min(savePaisa, o.maxDiscountPaisa);

    return {
      thresholdPaisa: o.minSpendPaisa,
      remainingPaisa: o.minSpendPaisa - subtotalPaisa,
      savePaisa,
      label: o.publicTitle || o.benefitLine || o.name,
      pct: Math.min(100, Math.round((subtotalPaisa / o.minSpendPaisa) * 100)),
    };
  }

  private toQuoteLine(l: Resolved): QuoteLineOut {
    const gross = l.grossUnitPaisa * l.qty + l.extras.reduce((n, e) => n + e.unitPaisa * e.qty, 0);
    const disc = l.discountPaisa + l.extras.reduce((n, e) => n + e.discountPaisa, 0);
    const linePaisa = gross - disc;
    return {
      slug: l.slug,
      name: l.name,
      imageUrl: l.imageUrl,
      sizeLabel: l.sizeLabel,
      variantLabel: l.variantLabel,
      bundleLabels: l.bundleLabels,
      addonLabels: l.addonLabels,
      qty: l.qty,
      unitPaisa: Math.round(linePaisa / l.qty),
      linePaisa,
      held: l.held,
    };
  }

  /**
   * ⚠️ EVERY BUNDLE PICK BECOMES ITS OWN ORDER LINE, AND THIS IS THE POINT.
   *
   * `startPreparing` deducts stock per `OrderLine.productId` (DEC-MOD-003). A
   * bundle pick folded into the main line's price would therefore be sold and
   * never deducted — the chocolate box leaves the shop and the shelf still says
   * it is there. The receipt is longer this way; the shelf is right.
   *
   * Add-ons cannot get the same treatment: `AddOn` is not a `Product` and
   * `OrderLine.productId` is a foreign key. See the header.
   */
  private toOrderLines(lines: Resolved[]): (OrderLineInput & { unitPaisa: number })[] {
    const out: (OrderLineInput & { unitPaisa: number })[] = [];
    for (const l of lines) {
      out.push({
        productId: l.productId,
        qty: l.qty,
        unitPaisa: l.grossUnitPaisa,
        discountPaisa: l.discountPaisa,
        sizeLabel: l.sizeLabel ?? undefined,
        /*  DEC-PRD-014 — line-টা জানে কোন রঙ বিক্রি হলো, তাই Preparing-এর
            stock −qty সঠিক ঘরে কাটে।  */
        variantId: l.variantId ?? undefined,
        variantLabel: l.variantLabel ?? undefined,
        /*  stock-নিয়মের চাবি — labels রসিদের, এগুলো মজুদের (মালিকের রায়)।  */
        addonIds: l.addonIdsPicked,
        bundleLabel: l.bundleLabels.length ? l.bundleLabels.join(' + ') : undefined,
        addonLabels: l.addonLabels,
        persoText: l.persoText,
        addedFrom: 'PRODUCT',
      });
      for (const e of l.extras) {
        out.push({
          productId: e.productId,
          qty: e.qty,
          unitPaisa: e.unitPaisa,
          discountPaisa: e.discountPaisa,
          bundleLabel: `with ${l.name}`,
          addedFrom: 'PRODUCT',
        });
      }
    }
    return out;
  }

  /* ══════════════════ 4. place it ══════════════════ */

  /**
   * ⚠️ THE ACCOUNT IS MADE FROM THE ORDER, NOT BEFORE IT — owner's ruling,
   * 3 Aug 2026: *"customer তার information দিবে and সে information নিয়ে system
   * automatic account make করবে, তাতে আগে account create verify গুলার ঝামেলা
   * থাকলো না।"*
   *
   * Phone is the identity key (DEC-CUS-002) and it is `@unique`, so the same
   * number ordering a second time lands on the same customer — which is what
   * makes lifetime value, repeat-buyer segments and "first order only" offers
   * true rather than decorative.
   *
   * ⚠️ An existing customer's stored NAME is not overwritten by whatever was
   * typed at checkout. The order carries its own `senderName` snapshot, so the
   * receipt says what the buyer typed while the CRM keeps the name the shop
   * knows them by. One typo at 2am should not rename a regular customer.
   */
  private async findOrCreateCustomer(name: string, phone: string, email?: string) {
    const clean = phone.trim();
    if (!clean) throw new BadRequestException('phone required');
    if (!clean.startsWith('+'))
      throw new BadRequestException('phone must be international (+8801…)');
    if (!name?.trim()) throw new BadRequestException('name required');

    /*  RAW client on purpose. `phone` is @unique across ALL rows including
        soft-deleted ones, so the soft-delete-filtered client would miss a
        trashed customer and then the create below would blow up on a
        constraint the caller cannot see. Same reasoning as
        `CustomersService.ensurePhoneFree`.  */
    const existing = await this.prisma.customer.findUnique({ where: { phone: clean } });
    if (existing) {
      /*  Trashed, and now ordering again. Bringing them back is the only
          honest option: the alternative is a unique-constraint crash on a
          screen the customer is looking at.  */
      if (existing.deletedAt) {
        return this.prisma.db.customer.update({
          where: { id: existing.id },
          data: { deletedAt: null },
        });
      }
      /*  Email is filled in only if it was BLANK — same principle as the name.  */
      if (email?.trim() && !existing.email) {
        return this.prisma.db.customer.update({
          where: { id: existing.id },
          data: { email: email.trim() },
        });
      }
      return existing;
    }

    return this.prisma.db.customer.create({
      data: {
        name: name.trim(),
        phone: clean,
        email: email?.trim() || null,
        /*  ⚠️ false, deliberately. Nothing here proved the number is real —
            the customer typed it. It turns true the day WhatsApp OTP runs, and
            until then the field honestly says "unverified".  */
        whatsappVerified: false,
      },
    });
  }

  async place(dto: PlaceOrderIn) {
    const zone = this.normZone(dto.zone);
    if (!dto.address?.trim()) throw new BadRequestException('delivery address required');

    const { lines } = await this.resolve(dto.items ?? [], zone);
    const active = lines.filter((l) => !l.held);
    if (!active.length)
      throw new BadRequestException(
        'nothing in your cart can be delivered to the selected area',
      );

    const delivery = await this.deliveryFor(
      zone,
      dto.deliveryMethodId,
      dto.deliverySlotId,
      dto.date,
      active.map((l) => l.slug), // DEC-DLV-011
    );

    const channel = await this.prisma.db.channel.findFirst({
      where: { slug: 'website', isActive: true },
    });
    if (!channel)
      throw new BadRequestException('website sales channel is not set up — ask an admin');

    const customer = await this.findOrCreateCustomer(
      dto.senderName,
      dto.senderPhone,
      dto.senderEmail,
    );

    const method =
      dto.paymentMethod === 'cod' ? PaymentMethod.cod : PaymentMethod.online;

    /*
      ⚠️ THE PRICE THE CUSTOMER AGREED TO, CHECKED BEFORE THE ORDER EXISTS.

      Everything else in this file protects the shop from the browser. This one
      protects the customer from the shop: between the moment the total was
      shown and the moment "Place order" was pressed, an offer can expire, the
      owner can change a price, or a delivery fee can be edited — and the
      customer would be charged a number they never saw.

      Only a HIGHER total is refused. Lower happens by design on a first order:
      the account is created a few lines above, which is what makes OFR-R02's
      welcome discount applicable, and it could not have been quoted before the
      customer existed. Nobody is harmed by paying less than they expected.

      ⚠️ Checked HERE, not after `create`. Creating an order and then undoing
      it would leave an order number burnt, an audit entry, and a redemption
      row for an offer nobody used.
    */
    if (typeof dto.expectedTotalPaisa === 'number') {
      const preview = await this.quote({ ...dto, phone: dto.senderPhone });
      if (preview.totalPaisa > dto.expectedTotalPaisa) {
        throw new ConflictException({
          message:
            'The price changed while you were checking out. Please review the new total before paying.',
          expectedTotalPaisa: dto.expectedTotalPaisa,
          totalPaisa: preview.totalPaisa,
        });
      }
    }

    /*
      From here down it is the admin's own order path, unchanged. Stock
      refusal, the offer engine, the COD rules, the order number, the audit
      trail and the activity timeline all happen inside this one call — which
      is the entire reason this file is thin.
    */
    const order = await this.orders.create({
      customerId: customer.id,
      channelId: channel.id,

      /*  রসিদে যা টাইপ করা হয়েছে তা-ই — CRM-এ পুরনো নাম থাকলেও। মালিকের
          রায়, ৩ আগস্ট ২০২৬। CRM-এর নিজের নাম `findOrCreateCustomer`-এর
          নিয়মেই অটুট থাকে।  */
      senderName: dto.senderName,
      senderPhone: dto.senderPhone,
      senderEmail: dto.senderEmail,

      isGift: dto.isGift ?? false,
      recipientName: dto.recipientName,
      recipientPhone: dto.recipientPhone,
      giftMessage: dto.giftMessage,
      anonymousGift: dto.anonymousGift ?? false,
      photoUpdates: dto.photoUpdates ?? true,

      zone,
      address: dto.address.trim(),
      deliveryNotes: dto.deliveryNotes,
      methodLabel: delivery.label ?? undefined,
      date: dto.date,
      slotLabel: delivery.slot?.label,
      etaLabel: delivery.eta ?? undefined,
      deliveryMethodId: delivery.method?.id,
      deliverySlotId: delivery.slot?.id,
      deliveryPaisa: delivery.feePaisa,

      paymentMethod: method,
      couponCode: dto.couponCode,

      /*  MKT-D02 — কে পাঠাল এই order। Campaign/affiliate report-এর কাঁচামাল।  */
      utmSource: dto.utmSource,
      utmMedium: dto.utmMedium,
      utmCampaign: dto.utmCampaign,
      refCode: dto.refCode,

      lines: this.toOrderLines(active),

      /*  ⚠️ "Customer" and not a staff name. This string is what the activity
          timeline shows, and an order that placed itself should not look like
          somebody in the office placed it.  */
      actorName: 'Customer',
    });

    /*
      ═══ THE RECEIVER JOINS THE CUSTOMER'S ADDRESS BOOK — মালিকের রায়, ৩ আগস্ট ═══

      > *"receiver-এর নাম আগে থেকে profile-এ save থাকলে option দেখাবে, সেখান
      >  থেকে select করবে — বা চাইলে নতুন receiver-এর information দেবে।"*

      The picker needs something to pick FROM, so every gift order quietly
      files its receiver under the customer (`Recipient`, DEC-CUS). Matched by
      phone — sending flowers to the same mother twice must not create two
      mothers. The admin's Customer screen shows the list today; the storefront
      picker reads the device's own memory now and this table the day WhatsApp
      OTP login lands (a bare phone number must never unlock someone's address
      book — that would leak every saved name and address to anyone who knows
      one number).

      ⚠️ Fail-soft, deliberately: the order is already placed and paid for.
      A hiccup filing the address book must never surface as a checkout error.
    */
    if (dto.isGift && dto.recipientName?.trim() && dto.recipientPhone?.trim()) {
      try {
        const phone = dto.recipientPhone.trim();
        const existing = await this.prisma.db.recipient.findFirst({
          where: { customerId: customer.id, phone },
        });
        if (!existing) {
          await this.prisma.db.recipient.create({
            data: {
              customerId: customer.id,
              name: dto.recipientName.trim(),
              phone,
              /*  checkout সম্পর্ক জিজ্ঞেস করে না — প্রতিটা বাড়তি প্রশ্নে order
                  ঝরে (D27-এর যুক্তি)। `other` মানে "বলা হয়নি", আর মালিক
                  admin-এ ঠিক করে দিতে পারেন।  */
              relationship: 'other',
              zone,
              /*  উপহারের delivery ঠিকানাই প্রাপকের জানা ঠিকানা।  */
              addressLine: dto.address.trim(),
              note: `Saved from website order ${order.orderNo}`,
            },
          });
        }
      } catch (e) {
        this.log?.warn?.(`recipient save failed for ${order.orderNo}: ${e}`);
      }
    }

    /*  সাইটের প্রতিশ্রুতি — "confirmation on WhatsApp"। fail-soft: বার্তা
        সৌজন্য, order চুক্তি; WhatsApp-এর কোনো ব্যর্থতা checkout আটকায় না।
        `void` — উত্তরের অপেক্ষাও নয়, গ্রাহক ততক্ষণে success page-এ।

        ⚠️ ৬ আগস্ট: সরাসরি পাঠানো থেকে সারিতে তোলা (DEC-WA-005)। কারণ দুটো —
        (১) COD আর prepaid-এর বার্তা এক নয়; COD-তে "আমাদের একজন প্রতিনিধি
            যোগাযোগ করে verify করবেন" বলতে হয়, কারণ টাকা এখনো আসেনি।
        (২) পাঠিয়ে ভুলে যাওয়ার বদলে এখন `OrderMessage`-এ লেখা থাকে, তাই
            "গ্রাহক confirmation পেয়েছিলেন কি না" প্রশ্নের উত্তর থাকে।  */
    void this.orderMessages
      .queueConfirmation(order.id, method === PaymentMethod.cod)
      .then(() => this.orderMessages.sendDue(5))
      .catch((e) => this.log?.warn?.(`confirmation queue failed for ${order.orderNo}: ${e}`));

    /*  এই ব্রাউজারের অসমাপ্ত checkout আর "ছেড়ে যাওয়া" নয় (DEC-WA-004)।
        নাহলে ১৫ মিনিট পর সদ্য order করা গ্রাহকের কাছে "আপনার cart রাখা
        আছে" চলে যেত।  */
    void this.leads
      .markConverted(dto.clientKey, order.id, order.senderPhone)
      .catch(() => undefined);

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      totalPaisa: order.totalPaisa,
      paymentMethod: order.paymentMethod,
      /*  COD needs no gateway; online does, and that is the next step in the
          caller's hands (`/shop/payment/session`).  */
      needsPayment: method === PaymentMethod.online,
    };
  }

  /* ══════════════════ 5. public reads the checkout needs ══════════════════ */

  /**
   * The delivery menu, from the masters. Prices and slots come from here so
   * that the fee shown on the screen and the fee charged on the order are the
   * same row of the same table.
   */
  async deliveryMenu(zoneIn?: string, itemsCsv?: string) {
    const zone = this.normZone(zoneIn as QuoteIn['zone']);
    const rows = await this.prisma.db.deliveryMethod.findMany({
      where: { zone, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { feePaisa: 'asc' }],
      include: {
        type: { select: { id: true, name: true, timing: true } },
        slots: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { startMin: 'asc' }],
          select: {
            id: true,
            label: true,
            startMin: true,
            endMin: true,
            cutoffTime: true,
            capacityPerDay: true,
          },
        },
      },
    });

    /*  DEC-DLV-011 — cart-এর slug এলে zone-এর menu-টা আরেকবার ছাঁকা হয়:
        যে method পুরো cart delivery করতে পারে না, সে তালিকাতেই আসে না।
        slug না এলে (পুরনো caller) আগের zone-only আচরণ।  */
    let list = rows;
    const slugs = (itemsCsv ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (slugs.length) {
      const sets = await cartTypeSets(this.prisma.db, slugs);
      if (sets.length)
        list = rows.filter((m) =>
          methodOkForCart(m.type?.timing ?? null, m.type?.id ?? null, sets),
        );
    }

    return list.map((m) => ({
      id: m.id,
      label: m.label,
      kind: m.kind,
      typeId: m.type?.id ?? null,
      typeName: m.type?.name ?? null,
      /*  TODAY_SLOT | TODAY_ONLY | ANY_DATE_SLOT | FROM_CONFIRM | LEAD_DAYS —
          checkout এটা পড়েই ঠিক করে তারিখ চাইবে, slot চাইবে, নাকি শুধু
          ঘড়ি চালাবে।  */
      timing: m.type?.timing ?? null,
      feePaisa: m.feePaisa,
      etaLabel: m.etaLabel,
      cutoffTime: m.cutoffTime,
      slots: m.slots,
    }));
  }

  /**
   * admin-এর `/delivery/slot-load`-এর public যমজ — একই where, একই অঙ্ক।
   * (checkout-এর "Available/Full" এতদিন hardcoded `booked: 0` পড়ত — mock,
   * তাই ভরা slot-ও "Available" দেখাত আর order নিয়ে নিত।)
   */
  async slotLoad(date: string) {
    if (!date.trim()) return {};
    const orders = await this.prisma.db.order.findMany({
      where: { deletedAt: null, date, deliverySlotId: { not: null }, salesStatus: { not: 'cancelled' } },
      select: { deliverySlotId: true },
    });
    const by: Record<string, number> = {};
    for (const o of orders) if (o.deliverySlotId) by[o.deliverySlotId] = (by[o.deliverySlotId] ?? 0) + 1;
    return by;
  }

  /* ══════════════════ 6. track ══════════════════ */

  /**
   * The delivery timeline for ONE order, unlocked by orderNo + phone together.
   *
   * ⚠️ The stage number is derived from the SAME two status tracks the admin
   * works (DEC-SAL-003), so this page and the admin can never tell different
   * stories. Photo stages are counted by the storefront from `photoUpdates`;
   * here only the operational five are mapped.
   */
  async track(orderNoIn: string, phoneIn: string) {
    const orderNo = orderNoIn.trim().toUpperCase();
    const phone = phoneIn.replace(/[\s\-()]/g, '');
    if (!orderNo || !phone) throw new BadRequestException('order number and phone required');

    const order = await this.prisma.db.order.findFirst({
      where: { orderNo },
      select: {
        orderNo: true, placedAt: true, salesStatus: true, deliveryStatus: true,
        methodLabel: true, slotLabel: true, date: true, etaLabel: true,
        photoUpdates: true, senderPhone: true, recipientPhone: true,
        customer: { select: { phone: true } },
      },
    });

    /*  Sender's phone, the customer's CRM phone, or the receiver's — whoever
        legitimately holds the number also legitimately holds one of these.
        Matched loosely on the trailing 10 digits so "+880 17..." and
        "017..." are the same number.  */
    const tail = (s: string | null | undefined) =>
      (s ?? '').replace(/\D/g, '').slice(-10);
    const ok =
      order &&
      tail(phone).length >= 10 &&
      [order.senderPhone, order.customer?.phone, order.recipientPhone].some(
        (p) => tail(p) === tail(phone),
      );

    /*  ⚠️ The SAME sentence for "no such order" and "wrong phone" — see the
        controller note. Different answers would leak which numbers exist.  */
    if (!ok) throw new BadRequestException('no order found for that number and phone');

    /*  storefront stage order: placed → confirmed → ready → out → delivered
        (photo stages are inserted by the page itself).  */
    let stage = 1; // placed
    if (order.salesStatus === 'confirmed' || order.salesStatus === 'completed') stage = 2;
    if (order.deliveryStatus === 'preparing') stage = 3;
    if (order.deliveryStatus === 'out_for_delivery') stage = 4;
    if (order.deliveryStatus === 'delivered') stage = 5;

    return {
      orderNo: order.orderNo,
      placedAt: order.placedAt.toISOString(),
      stage,
      cancelled: order.salesStatus === 'cancelled',
      methodLabel: order.methodLabel,
      slotLabel: order.slotLabel,
      date: order.date,
      etaLabel: order.etaLabel,
      photoUpdates: order.photoUpdates,
    } satisfies TrackResult;
  }
}

/* ─────────────────── TRACK ORDER ─────────────────── */

/**
 * What a customer may see about their own order — and nothing more.
 *
 * ⚠️ Locked (সোবুজ): the track number may be in the RECEIVER's hand — the
 * page shows the delivery TIMELINE only. No prices, no receipt, no address,
 * no gift message. A surprise must not spoil itself.
 */
export interface TrackResult {
  orderNo: string;
  placedAt: string;
  /** 0..n — how many timeline stages are done, in the storefront's 7-stage order */
  stage: number;
  cancelled: boolean;
  methodLabel: string | null;
  slotLabel: string | null;
  date: string | null;
  etaLabel: string | null;
  photoUpdates: boolean;
}

@Controller('shop')
export class CheckoutController {
  constructor(private readonly svc: CheckoutService) {}

  @Public()
  @Get('delivery/menu')
  menu(@Query('zone') zone?: string, @Query('items') items?: string) {
    /*  DEC-DLV-011 — `items` = cart-এর slug, comma-separated। দিলে menu-তে
        শুধু সেই delivery আসে যেটা cart-এর সব product-এ চলে।  */
    return this.svc.deliveryMenu(zone, items);
  }

  /** কোন slot-এ ওই দিনে কয়টা order — checkout-এর "ভরা" চিহ্নের সত্যিকারের গোনা */
  @Public()
  @Get('delivery/slot-load')
  slotLoad(@Query('date') date?: string) {
    return this.svc.slotLoad(date ?? '');
  }

  @Public()
  @Post('checkout/quote')
  quote(@Body() dto: QuoteIn) {
    return this.svc.quote(dto);
  }

  @Public()
  @Post('checkout')
  place(@Body() dto: PlaceOrderIn) {
    return this.svc.place(dto);
  }

  /**
   * ⚠️ BOTH KEYS OR NOTHING. The order number alone is not identity — it is
   * printed on a card that changes hands. The phone alone is worse. Only the
   * pair unlocks even the timeline, and a miss answers exactly like a
   * nonexistent order, so this endpoint cannot be used to CONFIRM that a
   * given number exists (an enumeration probe learns nothing).
   */
  @Public()
  @Get('track')
  track(@Query('orderNo') orderNo?: string, @Query('phone') phone?: string) {
    return this.svc.track(orderNo ?? '', phone ?? '');
  }
}

@Module({
  imports: [PrismaModule, ProductDetailModule, OffersModule, OrdersModule, WhatsAppCloudModule, MessagingModule],
  providers: [CheckoutService],
  controllers: [CheckoutController],
  exports: [CheckoutService],
})
export class CheckoutModule {}
