import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { ensureSingleton } from '../common/singleton';

/*
  SEO — everything the search engines see, edited from the panel and nowhere
  else (owner, 28 Jul: "sob kichur sathe admin panel connected thakbe, jate 10
  jaygay na jawa lage").

  What this module is:
    · the meta fields on every page that has one, in one place
    · a health list — which pages have nothing written, which titles are too
      long to show in full, which two pages are fighting each other with the
      same title
    · site-wide defaults, so a blank page still gets a sensible title
    · verification tags for Search Console and Bing, so nobody edits code
    · redirects, so renaming a slug does not kill every link to it

  What this module is NOT, and will not pretend to be: rank tracking. "Where do
  we sit for 'flower delivery dhaka'" needs somebody crawling Google every day
  from many places, and nothing built here could answer it honestly. Search
  Console answers it for free and better.

  SEO-D01  meta fields live ON the thing they describe. One row, one page.
  SEO-D02  a singleton holds the defaults.
  SEO-D03  redirects, because the move off radianbd.com will change a great
           many addresses at once and every one Google knows would 404.
*/

/** what Google will actually show before it cuts you off */
const TITLE_MIN = 20;
const TITLE_MAX = 60;
const DESC_MIN = 70;
const DESC_MAX = 160;

export type PageKind = 'product' | 'category' | 'brand';

export interface SeoIssue {
  level: 'wrong' | 'watch';
  what: string;
}

@Injectable()
export class SeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ---------------- settings ---------------- */

  /*  The SEO screen loads coverage and settings together, so it races on a
      fresh database. Upsert alone does not close that gap — see
      common/singleton.ts. */
  async settings() {
    return ensureSingleton(
      () => this.prisma.db.seoSetting.findUnique({ where: { id: 'singleton' } }),
      () => this.prisma.db.seoSetting.create({ data: { id: 'singleton' } }),
    );
  }

  async saveSettings(dto: Record<string, unknown>, actorName: string) {
    await this.settings();
    const data: Prisma.SeoSettingUpdateInput = {};
    const str = (k: string) => (typeof dto[k] === 'string' ? (dto[k] as string).trim() || null : undefined);

    if (dto.titleTemplate !== undefined) {
      const t = String(dto.titleTemplate).trim();
      if (!t.includes('{page}'))
        throw new BadRequestException('The title template must contain {page}, or every page gets the same title');
      data.titleTemplate = t;
    }
    if (dto.siteName !== undefined) data.siteName = String(dto.siteName).trim() || 'Radian';
    if (dto.defaultMetaDescription !== undefined) data.defaultMetaDescription = str('defaultMetaDescription');
    if (dto.defaultOgImageUrl !== undefined) data.defaultOgImageUrl = str('defaultOgImageUrl');
    if (dto.twitterHandle !== undefined) data.twitterHandle = str('twitterHandle');
    if (dto.googleVerification !== undefined) data.googleVerification = str('googleVerification');
    if (dto.bingVerification !== undefined) data.bingVerification = str('bingVerification');
    if (dto.robotsExtra !== undefined) data.robotsExtra = str('robotsExtra');
    if (dto.allowIndexing !== undefined) data.allowIndexing = !!dto.allowIndexing;
    if (dto.sitemapEnabled !== undefined) data.sitemapEnabled = !!dto.sitemapEnabled;

    const row = await this.prisma.db.seoSetting.update({ where: { id: 'singleton' }, data });
    await this.audit.record({
      entityType: 'SeoSetting',
      entityId: 'singleton',
      action: 'UPDATE',
      actorName,
      changes: data as Record<string, unknown>,
    });
    return row;
  }

  /* ---------------- the pages ---------------- */

  async pages(q: { kind?: PageKind; missing?: string; search?: string } = {}) {
    const kind = q.kind ?? 'product';
    const s = q.search?.trim();

    if (kind === 'category') {
      const rows = await this.prisma.db.category.findMany({
        where: s ? { name: { contains: s, mode: 'insensitive' } } : {},
        orderBy: { name: 'asc' },
        select: {
          id: true, slug: true, name: true, description: true, isActive: true,
          metaTitle: true, metaDescription: true, ogTitle: true, ogDescription: true,
          ogImageUrl: true, noIndex: true,
        },
      });
      return this.decorate(rows.map((r) => ({ ...r, kind: 'category' as const, published: r.isActive })), q.missing);
    }

    if (kind === 'brand') {
      const rows = await this.prisma.db.brand.findMany({
        where: s ? { name: { contains: s, mode: 'insensitive' } } : {},
        orderBy: { name: 'asc' },
        select: {
          id: true, slug: true, name: true, description: true, isActive: true,
          metaTitle: true, metaDescription: true,
        },
      });
      return this.decorate(
        rows.map((r) => ({
          ...r, kind: 'brand' as const, published: r.isActive,
          ogTitle: null, ogDescription: null, ogImageUrl: null, noIndex: false,
        })),
        q.missing,
      );
    }

    const rows = await this.prisma.db.product.findMany({
      where: s ? { OR: [{ name: { contains: s, mode: 'insensitive' } }, { slug: { contains: s, mode: 'insensitive' } }] } : {},
      orderBy: [{ isPublished: 'desc' }, { salesCount: 'desc' }],
      take: 600,
      select: {
        id: true, slug: true, name: true, shortDesc: true, isPublished: true, salesCount: true,
        metaTitle: true, metaDescription: true, ogTitle: true, ogDescription: true,
        ogImageUrl: true, noIndex: true,
      },
    });
    return this.decorate(
      rows.map((r) => ({ ...r, kind: 'product' as const, description: r.shortDesc, published: r.isPublished })),
      q.missing,
    );
  }

  /** attach the health verdict, and find pages arguing over the same title */
  private decorate(
    rows: {
      id: string; slug: string; name: string; description: string | null; published: boolean;
      kind: PageKind; metaTitle: string | null; metaDescription: string | null;
      ogTitle: string | null; ogDescription: string | null; ogImageUrl: string | null; noIndex: boolean;
      salesCount?: number;
    }[],
    missingOnly?: string,
  ) {
    const titleCount = new Map<string, number>();
    for (const r of rows) {
      const t = (r.metaTitle ?? '').trim().toLowerCase();
      if (t) titleCount.set(t, (titleCount.get(t) ?? 0) + 1);
    }

    const out = rows.map((r) => {
      const issues: SeoIssue[] = [];
      const title = (r.metaTitle ?? '').trim();
      const desc = (r.metaDescription ?? '').trim();

      if (!title) issues.push({ level: 'wrong', what: 'No title — Google invents one from the page' });
      else {
        if (title.length > TITLE_MAX)
          issues.push({ level: 'watch', what: `Title is ${title.length} characters — Google cuts off around ${TITLE_MAX}` });
        if (title.length < TITLE_MIN)
          issues.push({ level: 'watch', what: `Title is only ${title.length} characters — room going spare` });
        if ((titleCount.get(title.toLowerCase()) ?? 0) > 1)
          issues.push({ level: 'wrong', what: 'Another page has this exact title — they compete with each other' });
      }

      if (!desc) issues.push({ level: 'wrong', what: 'No description — the line under the title in search results' });
      else {
        if (desc.length > DESC_MAX)
          issues.push({ level: 'watch', what: `Description is ${desc.length} characters — cut off around ${DESC_MAX}` });
        if (desc.length < DESC_MIN)
          issues.push({ level: 'watch', what: `Description is only ${desc.length} characters` });
      }

      if (!r.ogImageUrl && r.kind !== 'brand')
        issues.push({ level: 'watch', what: 'No share picture — WhatsApp and Facebook links look bare' });

      if (r.noIndex && r.published)
        issues.push({ level: 'wrong', what: 'Hidden from Google, but live on the site' });

      if (/[A-Z]|\s|_/.test(r.slug))
        issues.push({ level: 'watch', what: `Address "${r.slug}" has capitals, spaces or underscores` });

      const worst = issues.some((i) => i.level === 'wrong') ? 'wrong' : issues.length ? 'watch' : 'ok';
      return { ...r, issues, health: worst as 'ok' | 'watch' | 'wrong' };
    });

    return missingOnly === '1' ? out.filter((r) => r.health !== 'ok') : out;
  }

  /** SEO-D01 — write the meta fields back onto the thing itself */
  async savePage(kind: PageKind, id: string, dto: Record<string, unknown>, actorName: string) {
    const clean = (k: string) =>
      dto[k] === undefined ? undefined : (String(dto[k] ?? '').trim() || null);

    const shared = {
      metaTitle: clean('metaTitle'),
      metaDescription: clean('metaDescription'),
    };
    const wide = {
      ...shared,
      ogTitle: clean('ogTitle'),
      ogDescription: clean('ogDescription'),
      ogImageUrl: clean('ogImageUrl'),
      ...(dto.noIndex === undefined ? {} : { noIndex: !!dto.noIndex }),
    };

    let row: { id: string; name: string };
    if (kind === 'product') row = await this.prisma.db.product.update({ where: { id }, data: wide, select: { id: true, name: true } });
    else if (kind === 'category') row = await this.prisma.db.category.update({ where: { id }, data: wide, select: { id: true, name: true } });
    else if (kind === 'brand') row = await this.prisma.db.brand.update({ where: { id }, data: shared, select: { id: true, name: true } });
    else throw new BadRequestException('Unknown page kind');

    await this.audit.record({
      entityType: kind === 'product' ? 'Product' : kind === 'category' ? 'Category' : 'Brand',
      entityId: id,
      action: 'UPDATE',
      actorName,
      changes: { seo: wide },
    });
    return row;
  }

  /* ---------------- the health summary ---------------- */

  async coverage() {
    const [products, categories, brands] = await Promise.all([
      this.pages({ kind: 'product' }),
      this.pages({ kind: 'category' }),
      this.pages({ kind: 'brand' }),
    ]);
    const count = (rows: { health: string; published: boolean }[]) => ({
      total: rows.length,
      ok: rows.filter((r) => r.health === 'ok').length,
      watch: rows.filter((r) => r.health === 'watch').length,
      wrong: rows.filter((r) => r.health === 'wrong').length,
      liveAndWrong: rows.filter((r) => r.health === 'wrong' && r.published).length,
    });

    const s = await this.settings();
    const setup: SeoIssue[] = [];
    if (!s.allowIndexing)
      setup.push({ level: 'wrong', what: 'The whole site is set to hide from Google' });
    if (!s.defaultMetaDescription)
      setup.push({ level: 'watch', what: 'No fallback description — a page with none has nothing to show' });
    if (!s.defaultOgImageUrl)
      setup.push({ level: 'watch', what: 'No fallback share picture' });
    if (!s.googleVerification)
      setup.push({ level: 'watch', what: 'Search Console is not verified — you cannot see what Google sees' });

    const redirects = await this.prisma.db.seoRedirect.count({ where: { isActive: true } });

    return {
      products: count(products),
      categories: count(categories),
      brands: count(brands),
      setup,
      redirects,
      limits: { titleMin: TITLE_MIN, titleMax: TITLE_MAX, descMin: DESC_MIN, descMax: DESC_MAX },
    };
  }

  /* ---------------- redirects (SEO-D03) ---------------- */

  private tidyPath(v: string): string {
    let p = (v ?? '').trim().split('?')[0].split('#')[0];
    if (!p) throw new BadRequestException('An address is required');
    if (!/^https?:\/\//i.test(p)) {
      if (!p.startsWith('/')) p = `/${p}`;
      p = p.toLowerCase();
      if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    }
    return p;
  }

  async redirects(q: { search?: string } = {}) {
    const where: Prisma.SeoRedirectWhereInput = {};
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ fromPath: { contains: s } }, { toPath: { contains: s } }];
    }
    return this.prisma.db.seoRedirect.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
  }

  async addRedirect(dto: { fromPath: string; toPath: string; permanent?: boolean; note?: string }, actorName: string) {
    const from = this.tidyPath(dto.fromPath);
    const to = this.tidyPath(dto.toPath);
    if (from === to) throw new BadRequestException('That sends the address to itself');

    /*  A chain (a → b, b → c) makes browsers take two hops and Google likes it
        even less. If the destination is itself redirected, point straight at
        the end of the chain instead. */
    const onward = await this.prisma.db.seoRedirect.findFirst({ where: { fromPath: to, isActive: true } });
    const finalTo = onward ? onward.toPath : to;
    if (from === finalTo) throw new BadRequestException('That would send the address round in a circle');

    const existing = await this.prisma.seoRedirect.findUnique({ where: { fromPath: from } });
    if (existing) {
      return this.prisma.db.seoRedirect.update({
        where: { fromPath: from },
        data: { toPath: finalTo, permanent: dto.permanent ?? true, note: dto.note ?? null, isActive: true, deletedAt: null, actorName },
      });
    }

    const row = await this.prisma.db.seoRedirect.create({
      data: { fromPath: from, toPath: finalTo, permanent: dto.permanent ?? true, note: dto.note ?? null, actorName },
    });
    await this.audit.record({ entityType: 'SeoRedirect', entityId: row.id, action: 'CREATE', actorName, changes: { from, to: finalTo } });
    return row;
  }

  async updateRedirect(id: string, dto: Record<string, unknown>, actorName: string) {
    const row = await this.prisma.db.seoRedirect.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Redirect not found');
    const data: Prisma.SeoRedirectUpdateInput = { actorName };
    if (dto.toPath !== undefined) data.toPath = this.tidyPath(String(dto.toPath));
    if (dto.permanent !== undefined) data.permanent = !!dto.permanent;
    if (dto.isActive !== undefined) data.isActive = !!dto.isActive;
    if (dto.note !== undefined) data.note = String(dto.note ?? '').trim() || null;
    return this.prisma.db.seoRedirect.update({ where: { id }, data });
  }

  async removeRedirect(id: string, actorName: string) {
    await this.prisma.db.seoRedirect.update({ where: { id }, data: { deletedAt: new Date(), actorName } });
    await this.audit.record({ entityType: 'SeoRedirect', entityId: id, action: 'DELETE', actorName });
    return { id, deleted: true };
  }

  /** paste a list — the move off radianbd.com will need dozens at once */
  async bulkRedirects(text: string, actorName: string) {
    const lines = (text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let added = 0;
    const failed: string[] = [];
    for (const line of lines) {
      const parts = line.split(/[,\t]|\s{2,}|\s+->\s+|\s+/).filter(Boolean);
      if (parts.length < 2) { failed.push(`${line} — needs an old and a new address`); continue; }
      try {
        await this.addRedirect({ fromPath: parts[0], toPath: parts[1] }, actorName);
        added += 1;
      } catch (e) {
        failed.push(`${line} — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { added, failed, seen: lines.length };
  }

  /* ---------------- what the storefront reads ---------------- */

  /** Public on purpose: the storefront is not signed in, and none of this is
      secret — every value here ends up in the page source anyway. */
  async publicConfig() {
    const s = await this.settings();
    const redirects = await this.prisma.db.seoRedirect.findMany({
      where: { isActive: true },
      select: { fromPath: true, toPath: true, permanent: true },
    });
    return {
      titleTemplate: s.titleTemplate,
      siteName: s.siteName,
      defaultMetaDescription: s.defaultMetaDescription,
      defaultOgImageUrl: s.defaultOgImageUrl,
      twitterHandle: s.twitterHandle,
      googleVerification: s.googleVerification,
      bingVerification: s.bingVerification,
      allowIndexing: s.allowIndexing,
      sitemapEnabled: s.sitemapEnabled,
      robots: this.robotsTxt(s),
      redirects,
    };
  }

  private robotsTxt(s: {
    allowIndexing: boolean;
    robotsExtra: string | null;
    sitemapEnabled: boolean;
  }): string {
    if (!s.allowIndexing) return 'User-agent: *\nDisallow: /';
    const lines = ['User-agent: *', 'Allow: /', 'Disallow: /account', 'Disallow: /checkout', 'Disallow: /cart'];
    if (s.robotsExtra?.trim()) lines.push(s.robotsExtra.trim());
    /*  domain env থেকে (PUBLIC_WEB_URL) — deployment-এর দিন এক ঘরেই বদলায়।  */
    if (s.sitemapEnabled) {
      const site = (process.env.PUBLIC_WEB_URL || 'https://radianbd.com').replace(/\/$/, '');
      lines.push('', `Sitemap: ${site}/sitemap.xml`);
    }
    return lines.join('\n');
  }
}
