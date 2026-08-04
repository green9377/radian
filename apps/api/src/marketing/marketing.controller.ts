import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { NeedsPin, Public, Roles, type AuthedRequest } from '../auth/auth.guard';
import { CampaignsService } from './campaigns.service';
import { AttributionService } from './attribution.service';
import { AffiliatesService } from './affiliates.service';
import { OutreachService } from './outreach.service';
import { SettingsService } from './settings.service';
import { MarketingAutomationService } from './automation.service';
import { TrackingService } from './tracking.service';
import { ReferralService } from './referral.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsAppCloudService } from '../common/whatsapp-cloud';
import { MessagingService } from './messaging.service';
import { AdsService } from './ads.service';
import { LoyaltyService } from './loyalty.service';
import type {
  AffiliateWriteDto,
  AttributionRunDto,
  AttributionSetDto,
  CampaignListQuery,
  CampaignWriteDto,
  MarketingSettingDto,
  OccasionQuery,
  OptOutDto,
  OutreachLogDto,
  OutreachResultDto,
  PayoutDto,
} from './marketing.dto';

/*
  MARKETING — HTTP surface. RADIAN_MARKETING_MODULE_ARCHITECTURE.md (28 Jul 2026).

  ⚠️ ROUTE ORDER: every static path (`stats`, `settings`, `occasions`,
  `outreach`, `affiliates`, `attribution`) MUST sit above any `:id` route —
  the same Nest trap that has caught /purchases, /products, /suppliers and /hr.

  Access:
    · the module is MANAGER and up. What was spent and what came back is a money
      question, and the occasion list is the customer book by another name.
    · a payout is OWNER + PIN. It is cash leaving the shop to somebody outside it.
  The actor name written to the audit trail and the ledger comes from the
  session (ActorInterceptor), never from a field anybody typed.
*/
@Controller('marketing')
@Roles('OWNER', 'MANAGER')
export class MarketingController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly attribution: AttributionService,
    private readonly affiliates: AffiliatesService,
    private readonly outreach: OutreachService,
    private readonly settings: SettingsService,
    private readonly automationSvc: MarketingAutomationService,
    private readonly tracking: TrackingService,
    private readonly referral: ReferralService,
    private readonly wa: WhatsappService,
    private readonly waCloud: WhatsAppCloudService,
    private readonly messaging: MessagingService,
    private readonly ads: AdsService,
    private readonly loyalty: LoyaltyService,
  ) {}

  private actor(req: AuthedRequest): string {
    return req.actor?.name ?? 'Admin';
  }

  /* ---------------- overview ---------------- */

  @Get('stats')
  async stats() {
    const [campaigns, affiliates, quality] = await Promise.all([
      this.campaigns.stats(),
      this.affiliates.stats(),
      this.attribution.quality(30),
    ]);
    return { campaigns, affiliates, quality };
  }

  /* ---------------- automation (MKT-D14) ---------------- */

  @Get('automation')
  async automation() {
    return {
      last: this.automationSvc.lastRun(),
      history: await this.automationSvc.history(20),
    };
  }

  /** the same sweep the clock runs, on demand */
  @Post('automation/run')
  runAutomation() {
    return this.automationSvc.run('manual');
  }

  /* ---------------- Email & SMS (MKT-D19) ----------------
     Nothing sends until the channel is switched on and a key is saved. The
     keys never come back out of the server. */

  @Get('messaging')
  messagingSettings() {
    return this.messaging.getForAdmin();
  }

  @Get('messaging/status')
  messagingStatus() {
    return this.messaging.status();
  }

  @Patch('messaging')
  saveMessaging(@Req() req: AuthedRequest, @Body() dto: Record<string, unknown>) {
    return this.messaging.update(dto, this.actor(req));
  }

  /** one real message, to prove the key works */
  @Post('messaging/test')
  testMessaging(
    @Req() req: AuthedRequest,
    @Body() dto: { channel: 'EMAIL' | 'SMS'; to?: string },
  ) {
    return this.messaging.test(dto.channel, dto.to, this.actor(req));
  }

  @Get('messaging/history')
  messagingHistory(@Query() q: { channel?: string; status?: string; days?: string }) {
    return this.messaging.history(q);
  }

  /* ---------------- WhatsApp: templates & send lists (MKT-D18) ----------------
     No API needed for any of this. A send still writes an Outreach row, so the
     opt-out rule and the effect report keep working. */

  @Get('whatsapp/templates')
  waTemplates(@Query() q: { purpose?: string }) {
    return this.wa.templates(q);
  }

  @Post('whatsapp/templates')
  waSaveTemplate(@Req() req: AuthedRequest, @Body() dto: Record<string, unknown>) {
    return this.wa.saveTemplate((dto.id as string) || null, dto, this.actor(req));
  }

  @Delete('whatsapp/templates/:id')
  waRemoveTemplate(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.wa.removeTemplate(id, this.actor(req));
  }

  /** how many people match, before anything is created */
  /*  মালিকের এক-click যাচাই: Integrations-এ চাবি বসিয়ে নিজের নম্বরে Meta-র
      pre-approved `hello_world` template। sent:false + configured:true মানে
      চাবি আছে কিন্তু Meta ফিরিয়েছে — log-এ কারণ।  */
  @Post('whatsapp/test-send')
  waTestSend(@Body() b: { to?: string }) {
    if (!b?.to?.trim()) throw new BadRequestException('to (phone) required');
    return this.waCloud.sendTest(b.to.trim());
  }

  @Post('whatsapp/preview')
  waPreview(@Body() dto: Record<string, unknown>) {
    return this.wa.preview(dto);
  }

  @Get('whatsapp/broadcasts')
  waBroadcasts() {
    return this.wa.broadcasts();
  }

  @Post('whatsapp/broadcasts')
  waCreateBroadcast(@Req() req: AuthedRequest, @Body() dto: Record<string, unknown>) {
    return this.wa.createBroadcast(dto, this.actor(req));
  }

  @Get('whatsapp/broadcasts/:id')
  waBroadcast(@Param('id') id: string) {
    return this.wa.broadcast(id);
  }

  @Get('whatsapp/broadcasts/:id/effect')
  waEffect(@Param('id') id: string) {
    return this.wa.effect(id);
  }

  @Delete('whatsapp/broadcasts/:id')
  waRemoveBroadcast(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.wa.removeBroadcast(id, this.actor(req));
  }

  @Post('whatsapp/target/:id/sent')
  waSent(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.wa.markSent(id, this.actor(req));
  }

  @Post('whatsapp/target/:id/skip')
  waSkip(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: { note?: string }) {
    return this.wa.skip(id, dto?.note ?? '', this.actor(req));
  }

  /* ---------------- referral & points (MKT-D16) ----------------
     ⚠️ every path here is static; nothing dynamic shares this level. */

  @Get('referral')
  referralOverview() {
    return this.referral.overview();
  }

  @Get('referral/list')
  referralList(@Query() q: { state?: string; search?: string }) {
    return this.referral.list(q);
  }

  @Get('referral/customer/:customerId')
  referralForCustomer(@Param('customerId') customerId: string) {
    return this.referral.forCustomer(customerId);
  }

  @Post('referral/code/:customerId')
  referralCode(@Param('customerId') customerId: string) {
    return this.referral.codeFor(customerId);
  }

  /** somebody signed up with a code — nothing is earned until they order */
  @Post('referral/join')
  referralJoin(@Req() req: AuthedRequest, @Body() dto: { code: string; friendId: string }) {
    return this.referral.join(dto, this.actor(req));
  }

  /** the sweep, also reachable by hand */
  @Post('referral/run')
  async referralRun() {
    const rewarded = await this.referral.rewardAll();
    const back = await this.referral.reconcile();
    return { ...rewarded, ...back };
  }

  /** points moving by hand — OWNER only, and say why */
  @Post('referral/points/adjust')
  @Roles('OWNER')
  adjustPoints(
    @Req() req: AuthedRequest,
    @Body() dto: { customerId: string; delta: number; note: string },
  ) {
    return this.referral.adjust(dto.customerId, dto.delta, dto.note, this.actor(req));
  }


  /*  `referral/points/redeem` was removed on 29 Jul 2026 — see the note in
      ReferralService. Points are spent one way only now: against an order,
      inside the 20 % cap, at POST loyalty/order/:orderId/redeem below. */

  /* ---------------- tracking (MKT-D15) ---------------- */

  /** the storefront's copy — no sign-in, and the CAPI token is not in it */
  @Get('tracking/public')
  @Public()
  trackingPublic() {
    return this.tracking.publicConfig();
  }

  @Get('tracking')
  tracking_() {
    return this.tracking.getForAdmin();
  }

  @Get('tracking/status')
  trackingStatus() {
    return this.tracking.status();
  }

  @Patch('tracking')
  saveTracking(@Req() req: AuthedRequest, @Body() dto: Record<string, unknown>) {
    return this.tracking.update(dto, this.actor(req));
  }

  /* ---------------- Loyalty (MKT-D21) ---------------- */

  /*  Points on ordinary purchases. Earned on DELIVERED, spent at checkout
      inside a 20 % cap, never on delivery or VAT. The whole scheme is OFF
      until the radianbd.com balances are seeded. */

  @Get('loyalty')
  loyaltyOverview() {
    return this.loyalty.overview();
  }

  @Get('loyalty/holders')
  loyaltyHolders(@Query('take') take?: string) {
    return this.loyalty.holders(parseInt(take ?? '50', 10) || 50);
  }

  @Get('loyalty/customer/:customerId')
  loyaltyHistory(@Param('customerId') customerId: string) {
    return this.loyalty.history(customerId);
  }

  /** how many points may be used on this order, and why not more */
  @Get('loyalty/order/:orderId')
  loyaltyQuote(@Param('orderId') orderId: string) {
    return this.loyalty.quote(orderId);
  }

  /*  Spending points moves money on an order, so it is OWNER + PIN — the same
      bar as an affiliate payout. Earning is automatic and needs no one. */
  @Post('loyalty/order/:orderId/redeem')
  @Roles('OWNER')
  @NeedsPin()
  loyaltyRedeem(
    @Req() req: AuthedRequest,
    @Param('orderId') orderId: string,
    @Body() dto: { points: number },
  ) {
    return this.loyalty.redeemForOrder(orderId, Number(dto?.points), this.actor(req));
  }

  @Post('loyalty/order/:orderId/earn')
  loyaltyEarn(@Req() req: AuthedRequest, @Param('orderId') orderId: string) {
    return this.loyalty.earnForOrder(orderId, this.actor(req));
  }

  @Post('loyalty/adjust')
  @Roles('OWNER')
  @NeedsPin()
  loyaltyAdjust(
    @Req() req: AuthedRequest,
    @Body() dto: { customerId: string; points: number; why: string; opening?: boolean },
  ) {
    return this.loyalty.adjust(
      dto.customerId, Number(dto.points), dto.why, this.actor(req), !!dto.opening,
    );
  }

  @Post('loyalty/reconcile')
  loyaltyReconcile(@Body() dto: { days?: number }) {
    return this.loyalty.reconcile(Math.min(365, Math.max(1, Number(dto?.days) || 30)));
  }

  /* ---------------- Meta ad numbers (MKT-D20) ---------------- */

  /*  Reading only. Nothing here writes a taka — the "put it in the books"
      button hands the figure to the Finance expense form, where a person
      confirms what the bank actually charged (MKT-D05). */

  @Get('ads/summary')
  adsSummary(@Query('days') days?: string) {
    return this.ads.summary(Math.min(365, Math.max(1, parseInt(days ?? '30', 10) || 30)));
  }

  @Post('ads/test')
  adsTest() {
    return this.ads.test();
  }

  @Post('ads/pull')
  adsPull(@Req() req: AuthedRequest, @Body() dto: { days?: number }) {
    return this.ads.pull(
      Math.min(365, Math.max(1, Number(dto?.days) || 30)),
      this.actor(req),
    );
  }

  @Post('ads/link')
  adsLink(
    @Req() req: AuthedRequest,
    @Body() dto: { externalCampaignId: string; campaignId: string | null },
  ) {
    return this.ads.link(dto.externalCampaignId, dto.campaignId || null, this.actor(req));
  }

  /* ---------------- settings ---------------- */

  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Patch('settings')
  saveSettings(@Req() req: AuthedRequest, @Body() dto: MarketingSettingDto) {
    return this.settings.update(dto, this.actor(req));
  }

  /* ---------------- attribution ---------------- */

  @Get('attribution/quality')
  quality(@Query('days') days?: string) {
    return this.attribution.quality(days ? parseInt(days, 10) : 30);
  }

  @Get('attribution/order/:orderId')
  forOrder(@Param('orderId') orderId: string) {
    return this.attribution.forOrder(orderId);
  }

  /** rung 4 — a person decides. Always wins, always audited (MKT-RULE-002). */
  @Patch('attribution/order/:orderId')
  setAttribution(
    @Req() req: AuthedRequest,
    @Param('orderId') orderId: string,
    @Body() dto: AttributionSetDto,
  ) {
    return this.attribution.setManual(orderId, dto, this.actor(req));
  }

  @Post('attribution/run')
  runAttribution(@Body() dto: AttributionRunDto) {
    return this.attribution.runAll(dto?.from);
  }

  /* ---------------- occasions & outreach ---------------- */

  @Get('occasions')
  occasions(@Query() q: OccasionQuery) {
    return this.outreach.dueOccasions(q);
  }

  @Get('outreach')
  outreachHistory(@Query() q: { customerId?: string; days?: string }) {
    return this.outreach.history(q);
  }

  @Get('outreach/effect')
  outreachEffect(@Query('days') days?: string) {
    return this.outreach.effect(days ? parseInt(days, 10) : 90);
  }

  @Post('outreach')
  logOutreach(@Req() req: AuthedRequest, @Body() dto: OutreachLogDto) {
    return this.outreach.log(dto, this.actor(req));
  }

  @Patch('outreach/:id')
  outreachResult(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: OutreachResultDto,
  ) {
    return this.outreach.setResult(id, dto, this.actor(req));
  }

  @Get('optouts')
  optOuts() {
    return this.outreach.optOutList();
  }

  @Post('optouts')
  optOut(@Req() req: AuthedRequest, @Body() dto: OptOutDto) {
    return this.outreach.optOut(dto, this.actor(req));
  }

  @Delete('optouts/:customerId')
  optIn(@Req() req: AuthedRequest, @Param('customerId') customerId: string) {
    return this.outreach.optIn(customerId, this.actor(req));
  }

  /* ---------------- affiliates ---------------- */

  @Get('affiliates')
  listAffiliates(@Query() q: { status?: string; type?: string; search?: string }) {
    return this.affiliates.list(q);
  }

  @Post('affiliates')
  createAffiliate(@Req() req: AuthedRequest, @Body() dto: AffiliateWriteDto) {
    return this.affiliates.create(dto, this.actor(req));
  }

  /* the Affiliates sub-module's own screens. ⚠️ every one of these is a static
     path and MUST stay above `affiliates/:id` below. */

  @Get('affiliates/overview')
  affiliateOverview() {
    return this.affiliates.overview();
  }

  @Get('affiliates/commissions')
  affiliateCommissions(@Query() q: { state?: string; affiliateId?: string }) {
    return this.affiliates.allCommissions(q);
  }

  @Get('affiliates/payouts')
  affiliatePayouts() {
    return this.affiliates.allPayouts();
  }

  /** the nightly sweep, also reachable by hand from the screen */
  @Post('affiliates/accrue')
  accrue() {
    return this.affiliates.accrueAll();
  }

  @Post('affiliates/release')
  release() {
    return this.affiliates.releaseHolds();
  }

  /** cash leaving the building — OWNER, and the PIN every time (MKT-RULE-016) */
  @Post('affiliates/payout')
  @Roles('OWNER')
  @NeedsPin()
  payout(@Req() req: AuthedRequest, @Body() dto: PayoutDto) {
    return this.affiliates.payout(dto, this.actor(req));
  }

  @Get('affiliates/:id')
  getAffiliate(@Param('id') id: string) {
    return this.affiliates.get(id);
  }

  @Patch('affiliates/:id')
  updateAffiliate(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: AffiliateWriteDto,
  ) {
    return this.affiliates.update(id, dto, this.actor(req));
  }

  @Delete('affiliates/:id')
  removeAffiliate(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.affiliates.remove(id, this.actor(req));
  }

  /* ---------------- campaigns (dynamic LAST) ---------------- */

  @Get('campaigns')
  listCampaigns(@Query() q: CampaignListQuery) {
    return this.campaigns.list(q);
  }

  @Post('campaigns')
  createCampaign(@Req() req: AuthedRequest, @Body() dto: CampaignWriteDto) {
    return this.campaigns.create(dto, this.actor(req));
  }

  @Get('campaigns/:id')
  getCampaign(@Param('id') id: string) {
    return this.campaigns.get(id);
  }

  @Patch('campaigns/:id')
  updateCampaign(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: CampaignWriteDto,
  ) {
    return this.campaigns.update(id, dto, this.actor(req));
  }

  @Delete('campaigns/:id')
  removeCampaign(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.campaigns.remove(id, this.actor(req));
  }
}
