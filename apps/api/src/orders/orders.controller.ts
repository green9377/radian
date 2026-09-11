import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OnlinePaymentsService } from './online-payments.service';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { LostOrdersService } from '../messaging/lost-orders.service';
import type { RecoveryOutcome } from '@prisma/client';
import type {
  CreateOrderDto,
  EditOrderDto,
  AddPaymentDto,
  AddPhotoDto,
  CancelOrderDto,
  FailOrderDto,
  ListOrderQuery,
} from './order.dto';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly svc: OrdersService,
    private readonly online: OnlinePaymentsService,
    /*  Orders -> Lost orders. The SERVICE lives in Messaging, which owns
        CheckoutLead and the recovery log (house rule 4); the ROUTES live here,
        because the screen is an Orders screen — see the note on `lostList`. */
    private readonly lost: LostOrdersService,
  ) {}

  /**
   * ⚠️ WHO DID IT — audit 11 Sep 2026 #26.
   *
   * Every action on this controller was attributed to the word "Admin". The
   * only source was an `x-actor-name` header, the admin panel never sent one,
   * so the fallback fired on every request — and the fallback was a literal.
   * The timeline on every order in the shop read "Admin confirmed", "Admin
   * cancelled", "Admin refunded ৳4,200", for a shop with staff, a manager and
   * an owner. When the money is questioned there is nobody to ask.
   *
   * The header was also the WRONG source even when sent: a header is whatever
   * the caller types. `req.actor` is set by the auth guard from the session
   * token (see access.guard.ts, which reads the same field to decide access),
   * so it is the signed-in person or it is nothing.
   *
   * The header stays as the fallback and only as the fallback — a server-side
   * script or a webhook with no session still has a way to name itself, and it
   * can no longer overrule a real signed-in person.
   */
  private actor(req: AuthedRequest, header?: string): string | undefined {
    return req?.actor?.name ?? header ?? undefined;
  }

  @Get()
  list(@Query() q: ListOrderQuery) {
    return this.svc.list(q);
  }

  /*  ⚠️ DECLARED BEFORE `:id` OR IT NEVER RUNS. `/orders/cancel-rules` would
      otherwise be read as an order whose id is the word "cancel-rules" — the
      trap `product-detail.ts` warns about, one module over.  */
  @Get('cancel-rules')
  cancelRules() {
    return this.svc.getSalesSettings();
  }
  @Roles('OWNER', 'MANAGER')
  @Patch('cancel-rules')
  saveCancelRules(@Body() body: { beforeStartPct?: number; afterStartPct?: number }) {
    return this.svc.saveSalesSettings(body);
  }

  /*  The band tiles on All orders, counted over the whole filtered set rather
      than one page (audit 11 Sep 2026). Takes exactly the same query as `list`
      minus the paging, so the numbers are about the orders on the screen.

      ⚠️ ABOVE `:id`, same trap as its neighbours.  */
  @Get('stats')
  stats(@Query() q: ListOrderQuery) {
    return this.svc.stats(q);
  }

  /*  ---- Orders -> Lost orders (audit 11 Sep 2026 #15) ----

      These three answered at `/messaging/lost*` and nowhere else, while the
      screen lives under Orders and the registry's node for it is `orders.lost`.
      The access guard judges a request by its FIRST PATH SEGMENT, so every one
      of these was being judged as `marketing.messaging`: somebody whose
      template opens Orders but not Messaging was refused their own Lost orders
      page, and somebody with Messaging could read customers' checkout details
      through a door nobody had decided to open.

      Same service, same behaviour, answered where the screen actually is. The
      `/messaging/lost*` routes are deliberately LEFT IN PLACE — they are the
      published shape and something else may still call them; this is an
      addition, not a move.

      ⚠️ ABOVE `:id`, same trap as every other named route on this controller. */
  @Get('lost')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  lostList() {
    return this.lost.list();
  }

  @Get('lost/history')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  lostHistory(@Query('leadId') leadId?: string, @Query('orderId') orderId?: string) {
    return this.lost.history({ leadId, orderId });
  }

  @Post('lost/handle')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  lostHandle(
    @Body() b: { leadId?: string; orderId?: string; outcome: RecoveryOutcome; note?: string },
    @Req() req: AuthedRequest,
  ) {
    return this.lost.handle(b, this.actor(req) ?? 'Admin');
  }

  /*  ---- online payments: the reconcile board (DEC-FIN-029's other half) ----

      ⚠️ ALSO BEFORE `:id`, same trap as cancel-rules above — otherwise
      /orders/online-payments is read as an order whose id is the words
      "online-payments".

      Read-only. `PaymentSession` is written in shop/payment.ts and nowhere
      else; Orders looks at it through the foreign key (house rule 4).  */
  @Get('online-payments')
  onlinePayments(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('take') take?: string,
  ) {
    return this.online.list({ status, q, take: take ? Number(take) : undefined });
  }

  /*  REV-C4 — the order report, counted in the database.

      ⚠️ ABOVE `:id`, the same trap as its two neighbours: otherwise
      /orders/report is read as an order whose id is the word "report".  */
  @Get('report')
  report(@Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.report({ from, to });
  }

  /*  The overview page — same trap, same reason: above `:id`.  */
  @Get('overview')
  overview(@Query('date') date?: string, @Query('range') range?: string) {
    return this.svc.overview({ date, range });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }
  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.svc.timeline(id);
  }
  /** every trip this order made to the gateway — the door from the order */
  @Get(':id/online-payments')
  orderOnlinePayments(@Param('id') id: string) {
    return this.online.forOrder(id);
  }
  @Post()
  create(@Body() dto: CreateOrderDto, @Req() req: AuthedRequest, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: this.actor(req, actor) ?? dto.actorName });
  }
  @Patch(':id')
  edit(@Param('id') id: string, @Body() dto: EditOrderDto, @Req() req: AuthedRequest, @Headers('x-actor-name') actor?: string) {
    return this.svc.edit(id, { ...dto, actorName: this.actor(req, actor) ?? dto.actorName });
  }

  /* status transitions */
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @Req() req: AuthedRequest, @Headers('x-actor-name') actor?: string) {
    return this.svc.confirm(id, this.actor(req, actor) ?? 'Admin');
  }
  @Post(':id/prepare')
  prepare(@Param('id') id: string, @Req() req: AuthedRequest, @Headers('x-actor-name') actor?: string) {
    return this.svc.startPreparing(id, this.actor(req, actor) ?? 'Admin');
  }
  @Post(':id/out-for-delivery')
  out(@Param('id') id: string, @Req() req: AuthedRequest, @Headers('x-actor-name') actor?: string) {
    return this.svc.outForDelivery(id, this.actor(req, actor) ?? 'Admin');
  }
  @Post(':id/delivered')
  delivered(@Param('id') id: string, @Req() req: AuthedRequest, @Headers('x-actor-name') actor?: string) {
    return this.svc.delivered(id, this.actor(req, actor) ?? 'Admin');
  }
  /*  The body is new (audit #19): why it failed, the note, and what staff
      decided. `decision: 'CANCEL'` runs the real cancel path — it used to be
      read and thrown away unless a delivery assignment happened to exist.  */
  @Post(':id/fail')
  fail(@Param('id') id: string, @Body() dto: FailOrderDto, @Req() req: AuthedRequest, @Headers('x-actor-name') actor?: string) {
    const who = this.actor(req, actor) ?? dto?.actorName ?? 'Admin';
    return this.svc.failDelivery(id, who, { ...(dto ?? {}), actorName: who });
  }
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelOrderDto, @Req() req: AuthedRequest, @Headers('x-actor-name') actor?: string) {
    return this.svc.cancel(id, { ...dto, actorName: this.actor(req, actor) ?? dto.actorName });
  }

  /* payment + proof photo */
  @Post(':id/payments')
  addPayment(@Param('id') id: string, @Body() dto: AddPaymentDto, @Req() req: AuthedRequest, @Headers('x-actor-name') actor?: string) {
    return this.svc.addPayment(id, { ...dto, actorName: this.actor(req, actor) ?? dto.actorName });
  }
  /*  ⚠️ There is deliberately NO `:id/courier` route any more (Phase 6, 30 Aug
      2026). It wrote courier fields straight onto the Order and created no
      DeliveryAssignment, so the parcel never reached the board, analytics,
      cost posting or COD reconciliation — a One Data One Owner violation.
      The only way to hand a parcel to a carrier is POST /delivery/assignments,
      which also keeps the legacy Order courier fields in step (DEC-DLV-006). */

  @Post(':id/photos')
  addPhoto(@Param('id') id: string, @Body() dto: AddPhotoDto, @Req() req: AuthedRequest, @Headers('x-actor-name') actor?: string) {
    return this.svc.addPhoto(id, { ...dto, actorName: this.actor(req, actor) ?? dto.actorName });
  }

  @Roles('OWNER', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthedRequest, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, this.actor(req, actor) ?? 'Admin');
  }
}
