import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PaymentMethod, PaymentSessionStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';
import { Public } from '../auth/auth.guard';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';
import { AdministrationModule } from '../administration/administration.module';
import { IntegrationsService } from '../administration/integrations.service';
import { MessagingModule } from '../messaging/messaging.controller';
import { OrderMessagesService } from '../messaging/order-messages.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  SSLCOMMERZ — the storefront's online payment, sandbox first.

  Owner, 3 Aug 2026: *"ssl commerz-এর API connect করো, demo হিসাবে থাকুক,
  then সব ঠিক করলে আমরা real ssl commerce add করব."* So the code is the real
  integration and only the credentials are the demo ones: `SSLCOMMERZ_IS_LIVE`
  picks the host, nothing else changes on the day the live store id arrives.

  ── THE FLOW ────────────────────────────────────────────────────────────────
   1. `POST /shop/payment/session`  — order already exists (unpaid). We ask
      SSLCommerz for a session and hand the browser a `GatewayPageURL`.
   2. customer pays on SSLCommerz's own page — no card data ever touches us.
   3. SSLCommerz calls `POST /shop/payment/ipn` server-to-server, AND
      redirects the browser to `/shop/payment/return/:kind`.
   4. we call SSLCommerz BACK (`validate` with `val_id`) and only then write
      the payment onto the order.

  ⚠️ STEP 4 IS THE WHOLE POINT, AND SKIPPING IT IS THE CLASSIC WAY TO GET
  ROBBED. The success redirect arrives in the CUSTOMER'S browser, which means
  anyone can type that URL. Trusting it marks orders paid for free. The order
  is only ever marked paid from an answer SSLCommerz gives US, on OUR request,
  over OUR connection.

  ⚠️ AND THE AMOUNT IS CHECKED AGAINST `PaymentSession.amountPaisa`, frozen
  when the session opened — not against the order's total as it stands now. If
  staff edit an order while the customer is on the gateway, comparing against
  the new total would let a ৳500 payment settle a ৳5,000 order.
  ═══════════════════════════════════════════════════════════════════════════
*/

const LIVE_BASE = 'https://securepay.sslcommerz.com';
const SANDBOX_BASE = 'https://sandbox.sslcommerz.com';

/** SSLCommerz's own public sandbox pair — safe to ship, worthless in the wild */
const SANDBOX_FALLBACK = { id: 'testbox', pass: 'qwerty' };

interface InitResponse {
  status?: string;
  failedreason?: string;
  sessionkey?: string;
  GatewayPageURL?: string;
}

interface ValidationResponse {
  status?: string; // VALID | VALIDATED | INVALID_TRANSACTION | ...
  tran_id?: string;
  val_id?: string;
  amount?: string;
  currency?: string;
  bank_tran_id?: string;
  card_type?: string;
  error?: string;
}

@Injectable()
export class SslCommerzService {
  private readonly log = new Logger('SSLCommerz');

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly integrations: IntegrationsService,
    private readonly orderMessages: OrderMessagesService,
  ) {}

  /*
    ═══ চাবি ADMIN থেকে — ৪ আগস্ট ২০২৬ (মালিকের নিয়ম: সব customizable) ═══

    Administration → Integrations → Payment → SSLCommerz-এ Store ID/password
    বসালে আর `Live` টিক দিলে সেটাই চলে — `.env` fallback মাত্র, আর দুটোই খালি
    হলে sandbox-এর public testbox। `isLive`-ও সারি থেকেই আসে: sandbox-চাবি
    দিয়ে live চালানোর দুর্ঘটনা admin-এর এক checkbox-এই আটকায়।
  */
  private async resolvedCreds(): Promise<{ id: string; pass: string; live: boolean }> {
    try {
      const row = await this.integrations.credentials('PAYMENT', 'SSLCOMMERZ');
      if (row?.found && row.isEnabled && row.clientId && row.clientSecret) {
        return { id: row.clientId, pass: row.clientSecret, live: row.isLive };
      }
    } catch { /* integrations unreachable — env below */ }
    const live = String(process.env.SSLCOMMERZ_IS_LIVE ?? '').toLowerCase() === 'true';
    return {
      id: process.env.SSLCOMMERZ_STORE_ID || (live ? '' : SANDBOX_FALLBACK.id),
      pass: process.env.SSLCOMMERZ_STORE_PASSWORD || (live ? '' : SANDBOX_FALLBACK.pass),
      live,
    };
  }

  private baseOf(live: boolean): string {
    return live ? LIVE_BASE : SANDBOX_BASE;
  }

  /** where the browser comes back to; the API's own address, not the shop's */
  private apiBase(): string {
    return (
      process.env.PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      `http://localhost:${process.env.PORT || 4000}`
    ).replace(/\/$/, '');
  }
  private webBase(): string {
    return (process.env.PUBLIC_WEB_URL || 'http://localhost:3000').replace(/\/$/, '');
  }

  /* ---- what is still owed, by order number ---- */

  /**
   * For /pay/{orderNo}. No phone is asked for — this is a way back in, and
   * every extra field loses people. Nothing personal is returned either: only
   * the order number and what is due.
   */
  async amountDue(orderNoIn: string) {
    const orderNo = (orderNoIn ?? '').trim().toUpperCase();
    if (!orderNo) throw new BadRequestException('order number required');

    const order = await this.prisma.db.order.findFirst({
      where: { orderNo, deletedAt: null },
      select: {
        id: true, orderNo: true, totalPaisa: true, paidPaisa: true,
        refundPaisa: true, salesStatus: true, paymentMethod: true,
      },
    });
    if (!order) return { found: false as const };

    const duePaisa = Math.max(0, order.totalPaisa - (order.paidPaisa - order.refundPaisa));
    return {
      found: true as const,
      orderNo: order.orderNo,
      duePaisa,
      paid: duePaisa <= 0,
      cancelled: order.salesStatus === 'cancelled',
      // COD is paid to the rider, so there is nothing to take online.
      isCod: order.paymentMethod === PaymentMethod.cod,
    };
  }

  /** Straight to the gateway from an order number. */
  async createSessionByNo(orderNoIn: string) {
    const orderNo = (orderNoIn ?? '').trim().toUpperCase();
    const order = await this.prisma.db.order.findFirst({
      where: { orderNo, deletedAt: null },
      select: { id: true, salesStatus: true },
    });
    if (!order) throw new BadRequestException('order not found');
    if (order.salesStatus === 'cancelled')
      throw new BadRequestException('this order was cancelled');
    return this.createSession(order.id);
  }

  /* ══════════════════ 1. open a session ══════════════════ */

  async createSession(orderId: string) {
    const order = await this.prisma.db.order.findFirst({
      where: { id: orderId },
      include: { customer: { select: { name: true, phone: true, email: true } } },
    });
    if (!order) throw new BadRequestException('order not found');

    const outstanding = Math.max(0, order.totalPaisa - (order.paidPaisa - order.refundPaisa));
    if (outstanding <= 0) throw new BadRequestException('this order is already paid');

    const { id, pass, live } = await this.resolvedCreds();
    if (!id || !pass)
      throw new BadRequestException(
        'SSLCommerz is not configured — Administration → Integrations → Payment',
      );

    /*  Our id, not theirs, and unique on our side — so a retry cannot be
        confused with the first attempt and a replayed IPN is detectable.  */
    const tranId = `${order.orderNo}-${Date.now().toString(36).toUpperCase()}`;

    const session = await this.prisma.db.paymentSession.create({
      data: { tranId, orderId: order.id, amountPaisa: outstanding },
    });

    const api = this.apiBase();
    const form = new URLSearchParams({
      store_id: id,
      store_passwd: pass,
      /*  ⚠️ TAKA, not paisa. SSLCommerz takes a decimal amount; everything
          inside Radian is integer paisa. This one line is the boundary, and
          it is the only place the conversion happens.  */
      total_amount: (outstanding / 100).toFixed(2),
      currency: 'BDT',
      tran_id: tranId,
      success_url: `${api}/shop/payment/return/success`,
      fail_url: `${api}/shop/payment/return/fail`,
      cancel_url: `${api}/shop/payment/return/cancel`,
      ipn_url: `${api}/shop/payment/ipn`,

      cus_name: order.senderName || order.customer.name,
      cus_email: order.senderEmail || order.customer.email || 'noreply@radian.com.bd',
      cus_phone: order.senderPhone || order.customer.phone,
      cus_add1: order.address,
      cus_city: order.zone === 'DHAKA' ? 'Dhaka' : 'Bangladesh',
      cus_country: 'Bangladesh',

      /*
        ⚠️ `shipping_method` ANYTHING OTHER THAN "NO" MAKES THE WHOLE `ship_*`
        BLOCK MANDATORY, and SSLCommerz rejects the session with
        "'ship_name' is missing" rather than ignoring it. Radian always
        delivers, so the block is filled rather than switched off.

        ⚠️ The RECIPIENT, not the buyer. On a gift order — most of them — the
        parcel goes to somebody else entirely, and the gateway's record of who
        received it should say so. `senderName` is the fallback for self-buys.
      */
      shipping_method: 'Courier',
      ship_name: order.recipientName || order.senderName || order.customer.name,
      ship_add1: order.address,
      ship_city: order.zone === 'DHAKA' ? 'Dhaka' : 'Bangladesh',
      ship_state: order.zone === 'DHAKA' ? 'Dhaka' : 'Bangladesh',
      /*  SSLCommerz wants a postcode and Bangladesh addresses are written
          without one. "1000" is Dhaka GPO — a real code, and honest as a
          placeholder in a field the courier never reads.  */
      ship_postcode: '1000',
      ship_country: 'Bangladesh',

      num_of_item: '1',
      product_name: `Radian order ${order.orderNo}`,
      product_category: 'Gift',
      product_profile: 'physical-goods',
    });

    const res = await fetch(`${this.baseOf(live)}/gwprocess/v4/api.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const json = (await res.json()) as InitResponse;

    if (json.status !== 'SUCCESS' || !json.GatewayPageURL) {
      await this.prisma.db.paymentSession.update({
        where: { id: session.id },
        data: { status: PaymentSessionStatus.FAILED, raw: json as object },
      });

      const reason = json.failedreason ?? json.status ?? 'no reason given';
      this.log.error(`init failed for ${order.orderNo}: ${reason}`);

      /*  ⚠️ THE MOST LIKELY CAUSE, NAMED IN THE LOG — 25 Aug 2026.
          The regression suite hit "Store Credential Error Or Store is
          De-active" on the demo. The credentials were not missing; they were
          the LIVE pair sitting behind a switch set to Sandbox, and a live
          Store ID simply does not exist on sandbox.sslcommerz.com.

          One switch and two boxes can disagree silently, and the only symptom
          is a shopper who cannot pay. So the log says it in as many words
          rather than leaving the next person to guess.  */
      if (/credential|de-active|deactive/i.test(reason)) {
        this.log.error(
          `SSLCommerz refused the store id "${id}" on the ${live ? 'LIVE' : 'SANDBOX'} gateway. ` +
            'A live Store ID does not work on sandbox, and a sandbox one does not work on live. ' +
            'Check Administration → Integrations → Payment gateways: the Sandbox/Live switch must ' +
            'match the pair in the boxes. Clearing both boxes on Sandbox falls back to ' +
            "SSLCommerz's public testbox, which always works.",
        );
      }

      /*  ⚠️ THE CUSTOMER NEVER READS THE GATEWAY'S OWN WORDS. This threw
          `json.failedreason` straight at the shopper, so somebody who had
          filled in the whole checkout was told "Store Credential Error Or
          Store is De-active" — a sentence about OUR configuration, in a
          vocabulary that is not theirs, with nothing they can do about it.

          They get something they can act on. The real reason is in the log
          above and in `PaymentSession.raw`, where the shop can find it.  */
      throw new BadRequestException(
        'We could not open the payment page just now. Please try again in a moment — ' +
          'your order is saved, and nothing has been charged.',
      );
    }

    return {
      tranId,
      amountPaisa: outstanding,
      sandbox: !live,
      gatewayUrl: json.GatewayPageURL,
    };
  }

  /* ══════════════════ 2. settle, from OUR request only ══════════════════ */

  /**
   * @returns the session's new status, so both the IPN and the browser return
   *   can report the same verdict without either of them deciding it.
   *
   * ⚠️ IDEMPOTENT ON PURPOSE. SSLCommerz sends the IPN and redirects the
   * browser, and both land here — often within the same second. The first one
   * to move the row off INITIATED wins; the second finds it already SUCCESS
   * and returns, so the order is never paid twice.
   */
  async settle(valId: string, tranIdHint?: string): Promise<PaymentSessionStatus> {
    const { id, pass, live } = await this.resolvedCreds();
    const url =
      `${this.baseOf(live)}/validator/api/validationserverAPI.php` +
      `?val_id=${encodeURIComponent(valId)}` +
      `&store_id=${encodeURIComponent(id)}&store_passwd=${encodeURIComponent(pass)}&format=json`;

    const res = await fetch(url);
    const v = (await res.json()) as ValidationResponse;

    const tranId = v.tran_id || tranIdHint;
    if (!tranId) throw new BadRequestException('validation returned no tran_id');

    const session = await this.prisma.db.paymentSession.findFirst({ where: { tranId } });
    if (!session) throw new BadRequestException('unknown transaction');

    /*  Already decided by whichever of IPN/redirect arrived first.  */
    if (session.status !== PaymentSessionStatus.INITIATED) return session.status;

    const ok = v.status === 'VALID' || v.status === 'VALIDATED';
    if (!ok) {
      await this.prisma.db.paymentSession.update({
        where: { id: session.id },
        data: { status: PaymentSessionStatus.FAILED, valId, raw: v as object },
      });
      return PaymentSessionStatus.FAILED;
    }

    /*  ⚠️ Against the FROZEN amount — see the header. Taka string back to
        integer paisa, rounded, because "1500.00" is what arrives and
        floating-point multiplication of money is how ৳15 goes missing.  */
    const paidPaisa = Math.round(parseFloat(v.amount ?? '0') * 100);
    if (v.currency && v.currency !== 'BDT') {
      await this.prisma.db.paymentSession.update({
        where: { id: session.id },
        data: { status: PaymentSessionStatus.FAILED, valId, raw: v as object },
      });
      this.log.error(`currency mismatch on ${tranId}: ${v.currency}`);
      return PaymentSessionStatus.FAILED;
    }
    if (paidPaisa < session.amountPaisa) {
      /*  Underpayment is NOT quietly accepted, and it is not thrown away
          either — the money is real. The session is marked SUCCESS and the
          short amount recorded, which leaves the order part-paid and visible
          on the admin's outstanding list, where a human belongs.  */
      this.log.warn(
        `short payment on ${tranId}: expected ${session.amountPaisa}p, got ${paidPaisa}p`,
      );
    }

    await this.prisma.db.$transaction(async (tx) => {
      await tx.paymentSession.update({
        where: { id: session.id },
        data: {
          status: PaymentSessionStatus.SUCCESS,
          valId,
          bankTranId: v.bank_tran_id,
          cardType: v.card_type,
          raw: v as object,
          settledAt: new Date(),
        },
      });
    });

    /*  Outside the transaction, deliberately: `addPayment` owns the money
        arithmetic on an order (increment, not overwrite — ORD-REV-2) and runs
        its own transaction. Calling it from inside this one would nest two
        transactions on the same rows for no gain.  */
    await this.orders.addPayment(session.orderId, {
      kind: 'PAYMENT',
      amountPaisa: Math.max(1, paidPaisa),
      method: PaymentMethod.online,
      reference: v.bank_tran_id || tranId,
      note: `SSLCommerz ${v.card_type ?? ''}`.trim(),
      actorName: 'SSLCommerz',
    });

    return PaymentSessionStatus.SUCCESS;
  }

  /** cancel/fail redirect — records the outcome, never touches the order */
  async mark(tranId: string, status: PaymentSessionStatus, raw: unknown) {
    const s = await this.prisma.db.paymentSession.findFirst({ where: { tranId } });
    if (!s || s.status !== PaymentSessionStatus.INITIATED) return;
    await this.prisma.db.paymentSession.update({
      where: { id: s.id },
      data: { status, raw: (raw ?? {}) as object },
    });

    /*
      The order exists and only the money is missing — the easiest kind to win
      back. Fire and forget: the gateway callback must answer quickly, and a
      slow reply makes SSLCommerz retry the whole thing.
    */
    void this.orderMessages
      .queuePaymentFailed(s.orderId)
      .then(() => this.orderMessages.sendDue(5))
      .catch(() => undefined);
  }

  async orderNoFor(tranId?: string): Promise<string | null> {
    if (!tranId) return null;
    const s = await this.prisma.db.paymentSession.findFirst({
      where: { tranId },
      select: { order: { select: { orderNo: true } } },
    });
    return s?.order.orderNo ?? null;
  }

  redirect(kind: string, orderNo: string | null): string {
    const web = this.webBase();
    if (kind === 'success' && orderNo) return `${web}/order-success?id=${orderNo}`;
    const q = orderNo ? `?id=${orderNo}` : '';
    return `${web}/checkout${q}${q ? '&' : '?'}payment=${kind}`;
  }
}

@Controller('shop/payment')
export class PaymentController {
  constructor(private readonly svc: SslCommerzService) {}

  @Public()
  @Post('session')
  session(@Body() body: { orderId: string }) {
    if (!body?.orderId) throw new BadRequestException('orderId required');
    return this.svc.createSession(body.orderId);
  }

  /**
   * Server-to-server. This is the one SSLCommerz retries, so it is the one
   * that actually guarantees settlement — the browser redirect below is a
   * convenience that a closed laptop lid would otherwise lose.
   */
  @Public()
  @Post('ipn')
  async ipn(@Body() body: Record<string, string>) {
    if (body?.val_id) {
      const status = await this.svc.settle(body.val_id, body.tran_id);
      return { ok: true, status };
    }
    if (body?.tran_id && body?.status) {
      await this.svc.mark(
        body.tran_id,
        body.status === 'FAILED'
          ? PaymentSessionStatus.FAILED
          : PaymentSessionStatus.CANCELLED,
        body,
      );
    }
    return { ok: true };
  }

  /**
   * ⚠️ POST *and* GET. SSLCommerz posts a form to these URLs, but a customer
   * pressing Back, or a gateway falling back to a redirect, arrives as a GET.
   * A 404 at this moment looks to the customer exactly like losing their money.
   */
  @Public()
  @Post('return/:kind')
  async returnPost(
    @Param('kind') kind: string,
    @Body() body: Record<string, string>,
    @Res() res: Response,
  ) {
    return res.redirect(303, await this.resolve(kind, body));
  }

  @Public()
  @Get('return/:kind')
  async returnGet(
    @Param('kind') kind: string,
    @Query() q: Record<string, string>,
    @Res() res: Response,
  ) {
    return res.redirect(303, await this.resolve(kind, q));
  }

  private async resolve(kind: string, p: Record<string, string>) {
    if (kind === 'success' && p?.val_id) {
      /*  Fail-soft: if validation cannot be reached the customer still lands
          somewhere sensible, and the IPN — which SSLCommerz retries — settles
          the order without them.  */
      try {
        await this.svc.settle(p.val_id, p.tran_id);
      } catch {
        /* intentionally swallowed — see above */
      }
    } else if (p?.tran_id) {
      await this.svc.mark(
        p.tran_id,
        kind === 'cancel' ? PaymentSessionStatus.CANCELLED : PaymentSessionStatus.FAILED,
        p,
      );
    }
    return this.svc.redirect(kind, await this.svc.orderNoFor(p?.tran_id));
  }

  /* The two calls the /pay page makes. */
  @Public()
  @Get('due/:orderNo')
  due(@Param('orderNo') orderNo: string) {
    return this.svc.amountDue(orderNo);
  }

  @Public()
  @Post('session-by-no')
  sessionByNo(@Body() body: { orderNo: string }) {
    return this.svc.createSessionByNo(body?.orderNo ?? '');
  }

  /** the storefront polls this on /order-success while the IPN lands */
  @Public()
  @Get('status/:tranId')
  async status(@Param('tranId') tranId: string) {
    const orderNo = await this.svc.orderNoFor(tranId);
    return { tranId, orderNo };
  }
}

@Module({
  imports: [PrismaModule, OrdersModule, AdministrationModule, MessagingModule],
  providers: [SslCommerzService],
  controllers: [PaymentController],
  exports: [SslCommerzService],
})
export class PaymentModule {}
