import { Body, Controller, Delete, Get, Headers, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ContentService } from './content.service';
import { Public } from '../auth/auth.guard';

/*
  ═══════════════════════════════════════════════════════════════════════════
  Content / CMS — the controller and module that never existed.

  `ContentService` has been complete since the Marketing pass: pages, journal
  posts, FAQs, a readiness check, and the storefront reads. It had no
  controller and no module, so none of it was reachable from anywhere —
  recorded in `RADIAN_FINAL_REVISION_TODO.md` §4 and unfinished ever since.

  This is that file. No business logic is added here; it only opens doors that
  were already built.

  ⚠️ It is filed under Storefront/Content, not Marketing, on the owner's
  reading: About Us, Refund Policy, Terms and the journal are the shop's own
  words, not a campaign. It landed under Marketing originally only because SEO
  did.

  ⚠️ And it is not decoration: **bKash and SSLCommerz both want to see a live
  refund policy and terms page before they approve a merchant account**, so
  this sits between here and taking money — not after.
  ═══════════════════════════════════════════════════════════════════════════
*/

@Controller('content')
export class ContentController {
  constructor(private readonly svc: ContentService) {}

  /* ---- pages ---- */
  @Get('pages')
  pages(@Query('kind') kind?: string, @Query('search') search?: string) {
    return this.svc.pages({ kind, search });
  }
  @Get('pages/:id')
  page(@Param('id') id: string) {
    return this.svc.page(id);
  }
  @Post('pages')
  createPage(@Body() dto: Record<string, unknown>, @Headers('x-actor-name') actor = 'Admin') {
    return this.svc.createPage(dto, actor);
  }
  @Patch('pages/:id')
  updatePage(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Headers('x-actor-name') actor = 'Admin') {
    return this.svc.updatePage(id, dto, actor);
  }
  @Delete('pages/:id')
  removePage(@Param('id') id: string, @Headers('x-actor-name') actor = 'Admin') {
    return this.svc.removePage(id, actor);
  }

  /* ---- journal ---- */
  @Get('posts')
  posts(@Query('search') search?: string, @Query('published') published?: string) {
    return this.svc.posts({ search, published });
  }
  @Get('posts/:id')
  post(@Param('id') id: string) {
    return this.svc.post(id);
  }
  @Post('posts')
  createPost(@Body() dto: Record<string, unknown>, @Headers('x-actor-name') actor = 'Admin') {
    return this.svc.createPost(dto, actor);
  }
  @Patch('posts/:id')
  updatePost(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Headers('x-actor-name') actor = 'Admin') {
    return this.svc.updatePost(id, dto, actor);
  }
  @Delete('posts/:id')
  removePost(@Param('id') id: string, @Headers('x-actor-name') actor = 'Admin') {
    return this.svc.removePost(id, actor);
  }

  /* ---- FAQs ---- */
  @Get('faqs')
  faqs(@Query('group') group?: string) {
    return this.svc.faqs({ group });
  }
  @Post('faqs')
  saveFaq(@Body() dto: Record<string, unknown> & { id?: string }, @Headers('x-actor-name') actor = 'Admin') {
    return this.svc.saveFaq(dto.id ?? null, dto, actor);
  }
  @Delete('faqs/:id')
  removeFaq(@Param('id') id: string, @Headers('x-actor-name') actor = 'Admin') {
    return this.svc.removeFaq(id, actor);
  }

  /** which legal pages are still missing — the payment gateways ask for these */
  @Get('readiness')
  readiness() {
    return this.svc.readiness();
  }

  /* ---- what the storefront reads ----
     @Public, and READ-ONLY. Everything above is closed by the global AuthGuard
     and stays that way; these three are the only doors a shopper needs. */
  @Public()
  @Get('public/journal')
  publicJournal(@Query('slug') slug?: string) {
    return this.svc.publicJournal(slug);
  }
  @Public()
  @Get('public/pages/:slug')
  publicPage(@Param('slug') slug: string) {
    return this.svc.publicPage(slug);
  }
  @Public()
  @Get('public/footer-pages')
  publicFooter() {
    return this.svc.publicFooter();
  }

  /*  the /faq page — the admin's FaqEntry editor existed, the storefront's
      page was a static file, and no door connected them. Owner, 4 Aug 2026:
      *"কোনো কিছুই যেন static না হয় — dynamic হওয়া লাগবে আর customizable।"*  */
  @Public()
  @Get('public/faqs')
  publicFaqs() {
    return this.svc.publicFaqs();
  }
}

@Module({
  providers: [ContentService],
  controllers: [ContentController],
  exports: [ContentService],
})
export class ContentModule {}
