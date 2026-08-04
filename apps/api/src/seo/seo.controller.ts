import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Public, Roles, type AuthedRequest } from '../auth/auth.guard';
import { SeoService, type PageKind } from './seo.service';

/*
  SEO — HTTP surface.

  MANAGER and up: writing a page title is everyday shop work, not a money
  action. The one PUBLIC route is what the storefront reads, and it is public
  because the storefront is not signed in and none of it is secret — every
  value in it ends up in the page source anyway.

  ⚠️ ROUTE ORDER: `settings`, `coverage`, `pages`, `redirects`, `public` are
  all static; the only dynamic segments sit under them.
*/
@Controller('seo')
@Roles('OWNER', 'MANAGER')
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  private actor(req: AuthedRequest): string {
    return req.actor?.name ?? 'Admin';
  }

  /** the storefront's copy — no sign-in */
  @Get('public')
  @Public()
  publicConfig() {
    return this.seo.publicConfig();
  }

  @Get('settings')
  settings() {
    return this.seo.settings();
  }

  @Patch('settings')
  saveSettings(@Req() req: AuthedRequest, @Body() dto: Record<string, unknown>) {
    return this.seo.saveSettings(dto, this.actor(req));
  }

  @Get('coverage')
  coverage() {
    return this.seo.coverage();
  }

  @Get('pages')
  pages(@Query() q: { kind?: PageKind; missing?: string; search?: string }) {
    return this.seo.pages(q);
  }

  @Patch('pages/:kind/:id')
  savePage(
    @Req() req: AuthedRequest,
    @Param('kind') kind: PageKind,
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.seo.savePage(kind, id, dto, this.actor(req));
  }

  /* ---------------- redirects ---------------- */

  @Get('redirects')
  redirects(@Query() q: { search?: string }) {
    return this.seo.redirects(q);
  }

  @Post('redirects')
  addRedirect(
    @Req() req: AuthedRequest,
    @Body() dto: { fromPath: string; toPath: string; permanent?: boolean; note?: string },
  ) {
    return this.seo.addRedirect(dto, this.actor(req));
  }

  /** paste a whole list — the move off the old site needs dozens at once */
  @Post('redirects/bulk')
  bulk(@Req() req: AuthedRequest, @Body() dto: { text: string }) {
    return this.seo.bulkRedirects(dto?.text ?? '', this.actor(req));
  }

  @Patch('redirects/:id')
  updateRedirect(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.seo.updateRedirect(id, dto, this.actor(req));
  }

  @Delete('redirects/:id')
  removeRedirect(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.seo.removeRedirect(id, this.actor(req));
  }
}
