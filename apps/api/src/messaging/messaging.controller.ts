import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { CheckoutLeadStatus, OtpPurpose } from '@prisma/client';
import { MarketingModule } from '../marketing/marketing.module';
import { OtpService } from './otp.service';
import { EscalationNotifier } from './escalation-notifier.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppCloudModule } from '../common/whatsapp-cloud';
import { Public, Roles, type AuthedRequest } from '../auth/auth.guard';
import { MessageTemplatesService, PLACEHOLDERS, TEMPLATE_KINDS } from './message-templates.service';
import { MessagingSettingsService } from './messaging-settings.service';
import { OrderMessagesService } from './order-messages.service';
import { CheckoutLeadsService, type LeadPing } from './checkout-leads.service';
import { MessagingSweeper } from './messaging.sweeper';
import { WhatsAppTemplatesService } from './whatsapp-templates';
import {
  WhatsAppWebhookController,
  WhatsAppWebhookService,
} from './whatsapp-webhook';
import { MetaWebhookController, MetaWebhookService } from './meta-webhook';
import { MetaPollService } from './meta-poll.service';
import {
  FacebookPageConnectController,
  FacebookPageConnectService,
} from './facebook-page-connect';
import {
  WhatsAppCoexistenceController,
  WhatsAppCoexistenceService,
} from './whatsapp-coexistence';
import { ChannelSender } from './channel-sender.service';
import { AdministrationModule } from '../administration/administration.module';

/*
  Two doors: the storefront's lead endpoints are public, everything else is
  owner or manager only.
*/

@Controller('messaging')
export class MessagingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderMessages: OrderMessagesService,
    private readonly sweeper: MessagingSweeper,
    private readonly settings: MessagingSettingsService,
    private readonly templates: WhatsAppTemplatesService,
    private readonly metaPoll: MetaPollService,
    private readonly wording: MessageTemplatesService,
  ) {}

  private actor(req: AuthedRequest): string {
    return req.actor?.name ?? 'Admin';
  }

  /* The words of every SMS and email (owner, 8 Sep 2026) — written, edited
     and removed here; WhatsApp keeps Meta's templates below. */

  @Get('wording')
  @Roles('OWNER', 'MANAGER')
  async wordingList() {
    const [rows, gaps] = await Promise.all([this.wording.list(), this.wording.gaps()]);
    return { rows, gaps, kinds: TEMPLATE_KINDS, placeholders: PLACEHOLDERS };
  }

  @Post('wording')
  @Roles('OWNER')
  wordingCreate(
    @Body() b: { kind: string; channel: string; name?: string; subject?: string; body?: string; isActive?: boolean },
    @Req() req: AuthedRequest,
  ) {
    return this.wording.create(b, this.actor(req));
  }

  @Patch('wording/:id')
  @Roles('OWNER')
  wordingUpdate(
    @Param('id') id: string,
    @Body() b: { name?: string; subject?: string; body?: string; isActive?: boolean },
    @Req() req: AuthedRequest,
  ) {
    return this.wording.update(id, b, this.actor(req));
  }

  @Delete('wording/:id')
  @Roles('OWNER')
  wordingRemove(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.wording.remove(id, this.actor(req));
  }

  /*
    "Sync now" — go and fetch what Meta never pushed, on every connected
    channel, and say plainly what came back. Reaches 72 hours back, so it also
    repairs a channel that has been silent for days rather than only catching up
    the last few minutes.
  */
  @Post('meta/sync')
  @Roles('OWNER', 'MANAGER')
  async metaSync() {
    return this.metaPoll.syncAll(true);
  }

  @Get('settings')
  @Roles('OWNER', 'MANAGER')
  getSettings() {
    return this.settings.get();
  }

  /** Owner only: one number here starts or stops real messages, and each costs. */
  @Post('settings')
  @Roles('OWNER')
  async saveSettings(@Body() dto: Record<string, unknown>) {
    const num = (v: unknown, min: number, max: number, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n)
        ? Math.min(max, Math.max(min, Math.round(n)))
        : fallback;
    };
    const cur = await this.settings.get();
    const data = {
      recoveryEnabled: Boolean(dto.recoveryEnabled),
      paymentFailedEnabled: Boolean(dto.paymentFailedEnabled),
      // 0 disables the retry; three days later would just look disorganised.
      paymentFailedRetryHours: num(
        dto.paymentFailedRetryHours,
        0,
        72,
        cur.paymentFailedRetryHours,
      ),
      /*  The closed gateway tab (owner, 9 Sep 2026). Five minutes is the floor
          for the same reason as the abandoned checkout below — anything
          shorter messages somebody who is still typing an OTP.  */
      unpaidAfterMinutes: num(dto.unpaidAfterMinutes, 5, 240, cur.unpaidAfterMinutes),
      abandonedEnabled: Boolean(dto.abandonedEnabled),
      // Five minutes is the floor: a bKash or card OTP takes longer than that.
      abandonedAfterMinutes: num(
        dto.abandonedAfterMinutes,
        5,
        1440,
        cur.abandonedAfterMinutes,
      ),
      // Numbers of people who bought nothing are a liability to keep.
      leadRetentionDays: num(
        dto.leadRetentionDays,
        1,
        365,
        cur.leadRetentionDays,
      ),
      sweeperEnabled: Boolean(dto.sweeperEnabled),
      sweeperEveryMinutes: num(
        dto.sweeperEveryMinutes,
        1,
        120,
        cur.sweeperEveryMinutes,
      ),
      supportPhone: String(dto.supportPhone ?? '').trim() || null,
    };
    await this.prisma.db.messagingSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...data },
      update: data,
    });
    return this.settings.get();
  }

  /** Everything sent about one order. */
  @Get('order/:orderId')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  async forOrder(@Param('orderId') orderId: string) {
    return this.prisma.db.orderMessage.findMany({
      where: { orderId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** The list staff call from. */
  @Get('leads')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  async leadList(
    @Query('status') status?: CheckoutLeadStatus,
    @Query('take') take = '100',
  ) {
    return this.prisma.db.checkoutLead.findMany({
      where: { deletedAt: null, ...(status ? { status } : {}) },
      orderBy: { lastSeenAt: 'desc' },
      take: Math.min(Number(take) || 100, 500),
    });
  }

  /** Runs a cycle by hand — the only way to test while the sweeper is off. */
  @Post('sweep')
  @Roles('OWNER')
  sweepNow() {
    return this.sweeper.runOnce();
  }

  /* Templates. Meta approves them; these only submit and report. */

  @Get('templates')
  @Roles('OWNER', 'MANAGER')
  templateStatus() {
    return this.templates.status();
  }

  @Post('templates')
  @Roles('OWNER')
  submitTemplates() {
    return this.templates.submitAll();
  }

  /** Retries one stuck message. */
  @Post('retry')
  @Roles('OWNER')
  async retry(@Body() b: { id: string }) {
    await this.prisma.db.orderMessage.updateMany({
      where: { id: b.id },
      data: { status: 'QUEUED', dueAt: new Date(), error: null },
    });
    return { result: await this.orderMessages.sendOne(b.id) };
  }
}

/* Called by the customer's browser, so it lives under /shop like the rest. */
@Controller('shop')
export class CheckoutLeadController {
  constructor(
    private readonly leads: CheckoutLeadsService,
    private readonly otp: OtpService,
  ) {}

  /*
    The one-time code (DEC-WA-010). Public, because the person asking for it
    has not proved anything yet — that is the entire point of the code.

    OtpService rate-limits per number and never says which channel failed, so
    a public door here does not become a way to probe who has WhatsApp or to
    flood someone's phone.
  */

  @Public()
  @Post('otp/send')
  sendOtp(@Body() b: { phone?: string; purpose?: OtpPurpose }) {
    /*  No email is taken from the browser (8 Sep 2026): the code goes to the
        address ON FILE for the phone, or nowhere — see OtpService.  */
    return this.otp.send({
      phone: b?.phone ?? '',
      purpose: b?.purpose ?? OtpPurpose.CHECKOUT,
    });
  }

  /**
   * Answers only true or false. What a verified code unlocks is decided by
   * the endpoint that needs it (checkout, login, track) — never here.
   */
  @Public()
  @Post('otp/verify')
  verifyOtp(
    @Body() b: { phone?: string; purpose?: OtpPurpose; code?: string },
  ) {
    return this.otp.verify(
      b?.phone ?? '',
      b?.purpose ?? OtpPurpose.CHECKOUT,
      b?.code ?? '',
    );
  }

  /** Public, so nothing sent is trusted: scrub() drops card-shaped keys. */
  @Public()
  @Post('checkout-lead')
  ping(@Body() b: LeadPing) {
    return this.leads.ping(b ?? ({} as LeadPing));
  }

  /**
   * Where the abandoned-cart button lands. No phone is asked for — this is a
   * way back in — and nothing personal is returned.
   */
  @Public()
  @Get('checkout-lead/:id')
  async savedCart(@Param('id') id: string) {
    const l = await this.leads.savedCart(id);
    return l ?? { found: false };
  }
}

@Module({
  imports: [
    PrismaModule,
    WhatsAppCloudModule,
    AdministrationModule,
    MarketingModule,
  ],
  providers: [
    MessagingSettingsService,
    OrderMessagesService,
    CheckoutLeadsService,
    MessagingSweeper,
    WhatsAppTemplatesService,
    WhatsAppWebhookService,
    MetaWebhookService,
    MetaPollService,
    FacebookPageConnectService,
    WhatsAppCoexistenceService,
    OtpService,
    ChannelSender,
    EscalationNotifier,
    MessageTemplatesService,
  ],
  controllers: [
    MessagingController,
    CheckoutLeadController,
    WhatsAppWebhookController,
    MetaWebhookController,
    FacebookPageConnectController,
    WhatsAppCoexistenceController,
  ],
  exports: [
    OrderMessagesService,
    CheckoutLeadsService,
    ChannelSender,
    OtpService,
    EscalationNotifier,
  ],
})
export class MessagingModule {}
