import {
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
import { Public, Roles, type AuthedRequest } from '../auth/auth.guard';
import { RegistryService } from './registry.service';
import { AccessService } from './access.service';
import { AccessGuard } from './access.guard';
import { PeopleService } from './people.service';
import { CompanyService, type CompanyWriteDto } from './company.service';
import { SystemService } from './system.service';
import { IntegrationsService, type IntKind } from './integrations.service';

/*  ADMINISTRATION — HTTP surface.
    RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md (30 Jul 2026).

    ⚠️ ROUTE ORDER: /positions/:id/access সবসময় /positions-এর নিচে, আর কোনো
    খালি /:id রুট এখানে নেই। Nest-এর সেই ফাঁদ যেটা /purchases, /products,
    /suppliers, /hr আর /marketing-এ ছ'বার ধরা পড়েছে।

    ⚠️ ROLES: পড়ার দুটো রুট (menu, my-access) সবার জন্য খোলা — সাইডবার আঁকতে
    প্রত্যেকের নিজের তালিকা লাগে, আর কেউ সেখানে অন্য কারও কথা দেখে না।
    বাকি সব OWNER-only (ADM-RULE-005): যে পর্দা থেকে অ্যাক্সেস বিলি হয়, সেটা
    বিলি করার ক্ষমতাও বিলি করে।  */
@Controller('administration')
export class AdministrationController {
  constructor(
    private readonly registry: RegistryService,
    private readonly access: AccessService,
    private readonly guard: AccessGuard,
    /*  `people_` because `people` is already the method name below, and Nest
        would happily let the field shadow it into a runtime error.  */
    private readonly people_: PeopleService,
    private readonly company_: CompanyService,
    private readonly system: SystemService,
    private readonly integrations_: IntegrationsService,
  ) {}

  /* ---- সবার জন্য ---- */

  /** সাইডবার এটা পড়বে — নিজের চোখে যা দেখা যায় তার তালিকা (ADM-RULE-001) */
  @Get('my-access')
  async myAccess(@Req() req: AuthedRequest) {
    const id = req.actor?.id;
    if (!id) return {};
    return this.access.effectiveFor(id);
  }

  /* ---- OWNER only (ADM-RULE-005) ---- */

  /** সব module ও পর্দার গাছ — Access পর্দার মাঝের কলাম */
  @Get('registry')
  @Roles('OWNER')
  tree() {
    return this.registry.tree();
  }

  /** ADM-D06 — যেগুলো এসেছে কিন্তু কোনো পদে সিদ্ধান্ত হয়নি। লাল পটির উৎস। */
  @Get('registry/undecided')
  @Roles('OWNER')
  undecided() {
    return this.registry.undecided();
  }

  /**
   * §৭ ধাপ ২ — নীরব ধাপের খাতা। কাকে আটকাত, কিন্তু আটকায়নি।
   *
   * এই তালিকা খালি না হওয়া পর্যন্ত ধাপ ৩-এ (সত্যিই আটকানো) যাওয়া হবে না।
   * ভরে থাকা মানে টিকগুলো এখনো সত্যিকারের কাজের সাথে মেলে না — আর সেটা এখন
   * জানা ভালো, দোকান বন্ধ হয়ে গিয়ে জানার চেয়ে।
   */
  @Get('would-block')
  @Roles('OWNER')
  wouldBlock() {
    return {
      rows: this.guard.report(),
      /*  ⚠️ Routes the guard could not name, and so never checked. An empty
          "would block" list means either the ticks match reality OR the guard
          was not looking — this is what tells the two apart.  */
      unjudged: this.guard.unjudged(),
    };
  }

  @Get('positions')
  @Roles('OWNER')
  positions() {
    return this.access.positions();
  }

  @Post('positions')
  @Roles('OWNER')
  createPosition(
    @Req() req: AuthedRequest,
    @Body() dto: { name: string; note?: string },
  ) {
    return this.access.createPosition(
      dto.name,
      dto.note ?? null,
      req.actor?.name ?? 'unknown',
    );
  }

  @Get('positions/:id/access')
  @Roles('OWNER')
  positionAccess(@Param('id') id: string) {
    return this.access.positionAccess(id);
  }

  /** allowed: null মানে সারিটা তুলে নাও — উপরের যা বলে তাই */
  @Patch('positions/:id/access')
  @Roles('OWNER')
  setAccess(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: { nodeKey: string; allowed: boolean | null },
  ) {
    return this.access.setPositionAccess(
      id,
      dto.nodeKey,
      dto.allowed,
      req.actor?.name ?? 'unknown',
    );
  }

  /* ---- the company itself (ADM-D08) ---- */

  @Get('company')
  @Roles('OWNER')
  company() {
    return this.company_.settings();
  }

  /** what Mushak 6.3 is still waiting for, plus the licence expiry warning */
  @Get('company/readiness')
  @Roles('OWNER')
  companyReadiness() {
    return this.company_.readiness();
  }

  @Patch('company')
  @Roles('OWNER')
  saveCompany(@Req() req: AuthedRequest, @Body() dto: CompanyWriteDto) {
    return this.company_.update(dto, req.actor?.name ?? 'unknown');
  }

  /* ---- people (OWNER only) ---- */

  @Get('people')
  @Roles('OWNER')
  people() {
    return this.people_.people();
  }

  /** add somebody by email — they set their own password from the link */
  @Post('people/invite')
  @Roles('OWNER')
  invite(
    @Req() req: AuthedRequest,
    @Body() dto: { name?: string; email?: string; positionId?: string | null },
  ) {
    return this.people_.invite(dto, req.actor?.name ?? 'unknown');
  }

  @Post('people/:id/resend')
  @Roles('OWNER')
  resend(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.people_.resendInvite(id, req.actor?.name ?? 'unknown');
  }

  /** ⚠️ password only — the PIN is never resettable from a link (ADM-RULE-006) */
  @Post('people/:id/reset-link')
  @Roles('OWNER')
  resetLink(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.people_.resetLink(id, req.actor?.name ?? 'unknown');
  }

  @Patch('people/:id/position')
  @Roles('OWNER')
  assign(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: { positionId: string | null },
  ) {
    return this.people_.assignPosition(id, dto.positionId, req.actor?.name ?? 'unknown');
  }

  @Get('people/:id/overrides')
  @Roles('OWNER')
  overrides(@Param('id') id: string) {
    return this.people_.overrides(id);
  }

  @Patch('people/:id/overrides')
  @Roles('OWNER')
  setOverride(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: { nodeKey: string; allowed: boolean | null },
  ) {
    return this.people_.setOverride(
      id, dto.nodeKey, dto.allowed, req.actor?.name ?? 'unknown',
    );
  }

  /* ---- integrations, split by what they do (ADM-D09) ---- */

  /**
   * ⚠️ Secrets come back MASKED — last four characters only. A key in a JSON
   * response is a key in the browser cache, in a screenshot, and in the logs.
   */
  @Get('integrations')
  @Roles('OWNER')
  integrations() {
    return this.integrations_.overview();
  }

  /** what Ecommerce will ask: can the website actually take money? */
  @Get('integrations/payment-readiness')
  @Roles('OWNER')
  paymentReadiness() {
    return this.integrations_.paymentReadiness();
  }

  /**
   * ⚠️ A field left OUT is left alone; a field sent EMPTY is cleared. The screen
   * only shows a mask, so if blank meant "clear", opening the page and pressing
   * Save would wipe every secret on it.
   */
  @Patch('integrations/:kind/:provider')
  @Roles('OWNER')
  saveIntegration(
    @Req() req: AuthedRequest,
    @Param('kind') kind: IntKind,
    @Param('provider') provider: string,
    @Body() dto: Record<string, never>,
  ) {
    return this.integrations_.save(kind, provider, dto, req.actor?.name ?? 'unknown');
  }

  /*  একটা সংরক্ষিত secret পুরোটা দেখা। মালিকের সিদ্ধান্ত ৬ আগস্ট: "unhide
      করলে যেন দেখা যায়" — বারবার Meta/SSLCommerz-এ ফিরে গিয়ে চাবি কপি করে
      আনা কষ্টকর, আর সেটাই বাস্তব ব্যবহারের সবচেয়ে বড় বাধা ছিল।

      ⚠️ তবু চাবি overview-তে ফেরে না, ফেরে এখানে — চোখে চাপলে তবেই, একটা
      করে। কারণ পাতা খুললেই সব চাবি JSON-এ চলে গেলে সেটা ব্রাউজারের cache-এ,
      screenshot-এ আর log-এ চলে যেত। এখানে OWNER ছাড়া কেউ পারে না, আর
      প্রতিবার audit-এ ওঠে — কে, কখন, কোন চাবি।  */
  @Get('integrations/:kind/:provider/reveal/:field')
  @Roles('OWNER')
  revealIntegrationField(
    @Req() req: AuthedRequest,
    @Param('kind') kind: IntKind,
    @Param('provider') provider: string,
    @Param('field') field: string,
  ) {
    return this.integrations_.reveal(
      kind, provider, field, req.actor?.name ?? 'unknown',
    );
  }

  @Post('integrations/:kind/:provider/check')
  @Roles('OWNER')
  checkIntegration(
    @Req() req: AuthedRequest,
    @Param('kind') kind: IntKind,
    @Param('provider') provider: string,
    @Body() dto: { ok: boolean; note?: string },
  ) {
    return this.integrations_.recordCheck(
      kind, provider, dto.ok, dto.note ?? '', req.actor?.name ?? 'unknown',
    );
  }

  /* ---- system: sessions, backups, where settings live ---- */

  /**
   * ⚠️ The header is read here, not in the service, so the service never has to
   * be trusted to know which chair the caller is sitting in.
   */
  @Get('sessions')
  @Roles('OWNER')
  sessions(@Req() req: AuthedRequest) {
    return this.system.sessions(this.tokenOf(req));
  }

  @Delete('sessions/:id')
  @Roles('OWNER')
  endSession(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.system.endSession(id, this.tokenOf(req), req.actor?.name ?? 'unknown');
  }

  /** every device for one person — for when an account is known to be compromised */
  @Delete('sessions/user/:userId')
  @Roles('OWNER')
  endAll(@Req() req: AuthedRequest, @Param('userId') userId: string) {
    return this.system.endAllFor(userId, req.actor?.name ?? 'unknown');
  }

  /** read from the audit trail, because the API cannot see the backups folder */
  @Get('backups')
  @Roles('OWNER')
  backups() {
    return this.system.backups();
  }

  /** ⚠️ a map, not a merged table — see the service */
  @Get('settings-map')
  @Roles('OWNER')
  settingsMap() {
    return this.system.settingsMap();
  }

  private tokenOf(req: AuthedRequest) {
    return (req.headers['x-radian-token'] as string | undefined)?.trim();
  }

  /* ---- the link pages — no session, by necessity ---- */

  /**
   * ⚠️ @Public: somebody following an invite or a reset link has no session yet.
   * That is the whole point of the link, and it is why the token is single-use,
   * short-lived, and stored only as a hash.
   */
  @Public()
  @Get('set-password/check')
  checkToken(@Query('token') token?: string) {
    return this.people_.checkToken(token);
  }

  @Public()
  @Post('set-password')
  setPassword(@Body() dto: { token?: string; password?: string }) {
    return this.people_.setPassword(dto.token, dto.password);
  }

  /** answers identically whether the address exists or not — see the service */
  @Public()
  @Post('forgot-password')
  forgot(@Body() dto: { email?: string }) {
    return this.people_.forgot(dto.email);
  }

  @Patch('positions/:id')
  @Roles('OWNER')
  rename(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: { name: string; note?: string },
  ) {
    return this.access.renamePosition(
      id,
      dto.name,
      dto.note ?? null,
      req.actor?.name ?? 'unknown',
    );
  }

  @Delete('positions/:id')
  @Roles('OWNER')
  remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.access.removePosition(id, req.actor?.name ?? 'unknown');
  }
}
