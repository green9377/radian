import { ensureSingleton } from '../common/singleton';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

/*
  CONTENT / CMS — CMS-D01.

  The storefront's prose lives in hand-written TypeScript files, each with a
  note from whoever built it: "⇄ SWAP HERE — CMS এলে fetch() হবে". This is that
  swap.

  Worth being blunt about why this is not decoration: **the shop cannot legally
  take money without privacy, terms, refund and shipping pages**, and
  SSLCommerz will not approve a merchant account without them. So this sits
  between here and the storefront going live, not after it. The readiness check
  below exists to say exactly which of them is still missing.

  CMS-D02 — a legal page is unpublished, never deleted. A privacy policy that
  disappears takes with it the record of what was promised to customers who
  were shopping while it was up.
*/

/** the four the law and the payment gateway both want */
const REQUIRED_LEGAL: { slug: string; title: string; why: string }[] = [
  { slug: 'privacy-policy', title: 'Privacy Policy', why: 'What customer data is kept, and why' },
  { slug: 'terms-conditions', title: 'Terms & Conditions', why: 'The agreement every order is made under' },
  { slug: 'return-refund-policy', title: 'Return & Refund Policy', why: 'Flowers are perishable — this has to be explicit' },
  { slug: 'shipping-policy', title: 'Shipping & Delivery Policy', why: 'Zones, times, and what happens when nobody is home' },
];

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

/** rough, and honest about being rough — 200 words a minute */
const readingMinutes = (html: string) =>
  Math.max(1, Math.round(stripHtml(html).split(/\s+/).filter(Boolean).length / 200));

function stripHtml(html: string): string {
  return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
}

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ================= pages ================= */

  /** The four legal pages are created empty on first look, so the list shows
      what is missing instead of showing nothing at all. */
  /*  CON-REV-1 (30 Jul 2026) — this used `upsert`, and its own comment justified that
      by saying it was "for the same reason the settings singletons use it".

      That reasoning is the one `common/singleton.ts` exists to refute. Quoting it:

        "WHY `upsert` ALONE DOES NOT FIX IT. Kickoff §8 says 'singleton findUnique →
         create is wrong, use upsert', and three modules were changed to upsert on that
         advice, with comments saying the gap was now closed. It is not. Prisma only
         compiles an upsert down to a single atomic `INSERT … ON CONFLICT DO UPDATE`
         under some conditions; otherwise it still emits SELECT-then-INSERT and the gap
         is exactly where it was. The advice was right about the disease and wrong about
         the cure."

      So this is not simply another instance of the bug — it is the **disproved cure
      propagating into a new file after it had already been disproved**, carrying a
      comment that cites it as settled. That is how a wrong idea outlives its own
      correction: it gets written down as a reason.

      Worth saying plainly: the rest of this file gets the harder thing RIGHT. Its slug
      clash checks use the raw client (`this.prisma.contentPage.findUnique`), so a
      soft-deleted page's address is correctly seen as taken — the exact discipline that
      Customer and Product were both missing until CUS-REV-2 / PRD-REV-1.

      `update: {}` semantics are preserved: an existing page is never touched. */
  async ensureLegal() {
    for (const r of REQUIRED_LEGAL) {
      await ensureSingleton(
        () => this.prisma.contentPage.findUnique({ where: { slug: r.slug } }),
        () => this.prisma.contentPage.create({
          data: { slug: r.slug, title: r.title, kind: 'LEGAL', excerpt: r.why, isPublished: false },
        }),
      );
    }
  }

  async pages(q: { kind?: string; search?: string } = {}) {
    await this.ensureLegal();
    const where: Prisma.ContentPageWhereInput = {};
    if (q.kind) where.kind = q.kind as 'LEGAL' | 'INFO';
    if (q.search?.trim())
      where.OR = [
        { title: { contains: q.search.trim(), mode: 'insensitive' } },
        { slug: { contains: q.search.trim(), mode: 'insensitive' } },
      ];
    const rows = await this.prisma.db.contentPage.findMany({
      where,
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { title: 'asc' }],
    });
    return rows.map((p) => ({
      ...p,
      words: stripHtml(p.bodyHtml ?? '').split(/\s+/).filter(Boolean).length,
      required: REQUIRED_LEGAL.some((r) => r.slug === p.slug),
    }));
  }

  async page(id: string) {
    const p = await this.prisma.db.contentPage.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Page not found');
    return p;
  }

  async createPage(dto: Record<string, unknown>, actorName: string) {
    const title = String(dto.title ?? '').trim();
    if (!title) throw new BadRequestException('A page needs a title');
    const slug = slugify(String(dto.slug ?? '') || title);
    const clash = await this.prisma.contentPage.findUnique({ where: { slug } });
    if (clash) throw new BadRequestException(`The address "${slug}" is already used`);

    const row = await this.prisma.db.contentPage.create({
      data: {
        slug,
        title,
        kind: (dto.kind as 'LEGAL' | 'INFO') ?? 'INFO',
        bodyHtml: (dto.bodyHtml as string) ?? null,
        excerpt: (dto.excerpt as string) ?? null,
        isPublished: !!dto.isPublished,
        actorName,
      },
    });
    await this.audit.record({
      entityType: 'ContentPage', entityId: row.id, action: 'CREATE', actorName,
      changes: { title, slug },
    });
    return row;
  }

  async updatePage(id: string, dto: Record<string, unknown>, actorName: string) {
    const before = await this.page(id);
    const data: Prisma.ContentPageUpdateInput = { actorName };

    if (dto.title !== undefined) {
      const t = String(dto.title).trim();
      if (!t) throw new BadRequestException('A page needs a title');
      data.title = t;
    }
    if (dto.slug !== undefined) {
      /*  CMS-D02 — a legal page's address is quoted in the terms customers
          agreed to and in the payment gateway's records. Renaming it silently
          breaks both. */
      if (before.kind === 'LEGAL' && REQUIRED_LEGAL.some((r) => r.slug === before.slug))
        throw new BadRequestException('A required legal page keeps its address — other places point at it');
      const s = slugify(String(dto.slug));
      if (s !== before.slug) {
        const clash = await this.prisma.contentPage.findUnique({ where: { slug: s } });
        if (clash) throw new BadRequestException(`The address "${s}" is already used`);
        data.slug = s;
      }
    }
    if (dto.bodyHtml !== undefined) data.bodyHtml = String(dto.bodyHtml ?? '') || null;
    if (dto.excerpt !== undefined) data.excerpt = String(dto.excerpt ?? '').trim() || null;
    if (dto.isPublished !== undefined) data.isPublished = !!dto.isPublished;
    if (dto.showInFooter !== undefined) data.showInFooter = !!dto.showInFooter;
    if (dto.sortOrder !== undefined) data.sortOrder = Math.round(Number(dto.sortOrder) || 0);
    if (dto.metaTitle !== undefined) data.metaTitle = String(dto.metaTitle ?? '').trim() || null;
    if (dto.metaDescription !== undefined)
      data.metaDescription = String(dto.metaDescription ?? '').trim() || null;
    if (dto.ogImageUrl !== undefined) data.ogImageUrl = String(dto.ogImageUrl ?? '').trim() || null;
    if (dto.noIndex !== undefined) data.noIndex = !!dto.noIndex;

    /*  Publishing an empty legal page is worse than not having one: it looks
        like a promise and says nothing. */
    const willPublish = data.isPublished === true || (dto.isPublished === undefined && before.isPublished);
    const body = (data.bodyHtml as string | null) ?? before.bodyHtml;
    if (willPublish && before.kind === 'LEGAL' && stripHtml(body ?? '').trim().length < 40)
      throw new BadRequestException('An empty legal page cannot be published — write it first');

    const row = await this.prisma.db.contentPage.update({ where: { id }, data });
    await this.audit.record({
      entityType: 'ContentPage', entityId: id, action: 'UPDATE', actorName,
      changes: { title: row.title, published: row.isPublished },
    });
    return row;
  }

  async removePage(id: string, actorName: string) {
    const p = await this.page(id);
    if (p.kind === 'LEGAL' && REQUIRED_LEGAL.some((r) => r.slug === p.slug))
      throw new BadRequestException(
        'A required legal page is switched off, never removed — the record of what was promised has to stay (CMS-D02)',
      );
    await this.prisma.db.contentPage.update({ where: { id }, data: { deletedAt: new Date(), actorName } });
    await this.audit.record({ entityType: 'ContentPage', entityId: id, action: 'DELETE', actorName });
    return { id, deleted: true };
  }

  /* ================= journal ================= */

  async posts(q: { search?: string; published?: string } = {}) {
    const where: Prisma.JournalPostWhereInput = {};
    if (q.published === '1') where.isPublished = true;
    if (q.published === '0') where.isPublished = false;
    if (q.search?.trim()) where.title = { contains: q.search.trim(), mode: 'insensitive' };
    const rows = await this.prisma.db.journalPost.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return rows.map((p) => ({
      ...p,
      words: stripHtml(p.bodyHtml ?? '').split(/\s+/).filter(Boolean).length,
    }));
  }

  async post(id: string) {
    const p = await this.prisma.db.journalPost.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Post not found');
    return p;
  }

  async createPost(dto: Record<string, unknown>, actorName: string) {
    const title = String(dto.title ?? '').trim();
    if (!title) throw new BadRequestException('A post needs a title');
    const slug = slugify(String(dto.slug ?? '') || title);
    const clash = await this.prisma.journalPost.findUnique({ where: { slug } });
    if (clash) throw new BadRequestException(`The address "${slug}" is already used`);

    const row = await this.prisma.db.journalPost.create({
      data: {
        slug, title,
        excerpt: (dto.excerpt as string) ?? null,
        coverUrl: (dto.coverUrl as string) ?? null,
        bodyHtml: (dto.bodyHtml as string) ?? null,
        author: (dto.author as string) ?? 'Radian',
        actorName,
      },
    });
    await this.audit.record({ entityType: 'JournalPost', entityId: row.id, action: 'CREATE', actorName, changes: { title } });
    return row;
  }

  async updatePost(id: string, dto: Record<string, unknown>, actorName: string) {
    const before = await this.post(id);
    const data: Prisma.JournalPostUpdateInput = { actorName };

    if (dto.title !== undefined) {
      const t = String(dto.title).trim();
      if (!t) throw new BadRequestException('A post needs a title');
      data.title = t;
    }
    if (dto.slug !== undefined) {
      const s = slugify(String(dto.slug));
      if (s !== before.slug) {
        const clash = await this.prisma.journalPost.findUnique({ where: { slug: s } });
        if (clash) throw new BadRequestException(`The address "${s}" is already used`);
        data.slug = s;
        /*  The old address is about to stop working. Marketing → SEO → Old
            links is where that is fixed, and this is the moment somebody would
            forget, so say it in the message rather than let the link die quietly. */
      }
    }
    if (dto.excerpt !== undefined) data.excerpt = String(dto.excerpt ?? '').trim() || null;
    if (dto.coverUrl !== undefined) data.coverUrl = String(dto.coverUrl ?? '').trim() || null;
    if (dto.author !== undefined) data.author = String(dto.author ?? '').trim() || null;
    if (dto.bodyHtml !== undefined) {
      const html = String(dto.bodyHtml ?? '');
      data.bodyHtml = html || null;
      data.readMinutes = html ? readingMinutes(html) : null;
    }
    if (dto.metaTitle !== undefined) data.metaTitle = String(dto.metaTitle ?? '').trim() || null;
    if (dto.metaDescription !== undefined) data.metaDescription = String(dto.metaDescription ?? '').trim() || null;
    if (dto.ogImageUrl !== undefined) data.ogImageUrl = String(dto.ogImageUrl ?? '').trim() || null;
    if (dto.noIndex !== undefined) data.noIndex = !!dto.noIndex;

    if (dto.isPublished !== undefined) {
      const pub = !!dto.isPublished;
      data.isPublished = pub;
      // first publish stamps the date; unpublishing does not erase it
      if (pub && !before.publishedAt) data.publishedAt = new Date();
    }

    const row = await this.prisma.db.journalPost.update({ where: { id }, data });
    await this.audit.record({
      entityType: 'JournalPost', entityId: id, action: 'UPDATE', actorName,
      changes: { title: row.title, published: row.isPublished },
    });
    return { ...row, slugChanged: !!data.slug, oldSlug: data.slug ? before.slug : null };
  }

  async removePost(id: string, actorName: string) {
    await this.prisma.db.journalPost.update({ where: { id }, data: { deletedAt: new Date(), actorName } });
    await this.audit.record({ entityType: 'JournalPost', entityId: id, action: 'DELETE', actorName });
    return { id, deleted: true };
  }

  /* ================= FAQ ================= */

  async faqs(q: { group?: string } = {}) {
    const where: Prisma.FaqEntryWhereInput = {};
    if (q.group) where.groupName = q.group;
    return this.prisma.db.faqEntry.findMany({
      where,
      orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async saveFaq(id: string | null, dto: Record<string, unknown>, actorName: string) {
    const question = String(dto.question ?? '').trim();
    if (!question) throw new BadRequestException('A question is required');
    const data = {
      groupName: String(dto.groupName ?? 'General').trim() || 'General',
      question,
      answerHtml: String(dto.answerHtml ?? '') || null,
      sortOrder: Math.round(Number(dto.sortOrder) || 0),
      isPublished: dto.isPublished === undefined ? true : !!dto.isPublished,
      actorName,
    };
    if (id) {
      const row = await this.prisma.db.faqEntry.update({ where: { id }, data });
      await this.audit.record({ entityType: 'FaqEntry', entityId: id, action: 'UPDATE', actorName });
      return row;
    }
    const row = await this.prisma.db.faqEntry.create({ data });
    await this.audit.record({ entityType: 'FaqEntry', entityId: row.id, action: 'CREATE', actorName });
    return row;
  }

  async removeFaq(id: string, actorName: string) {
    await this.prisma.db.faqEntry.update({ where: { id }, data: { deletedAt: new Date(), actorName } });
    await this.audit.record({ entityType: 'FaqEntry', entityId: id, action: 'DELETE', actorName });
    return { id, deleted: true };
  }

  /* ================= is the shop allowed to sell yet? ================= */

  /*  This is the reason the module exists, so it gets its own answer rather
      than being something somebody has to work out by looking at a list. */
  async readiness() {
    await this.ensureLegal();
    const pages = await this.prisma.db.contentPage.findMany({
      where: { slug: { in: REQUIRED_LEGAL.map((r) => r.slug) } },
    });
    const byslug = new Map(pages.map((p) => [p.slug, p]));

    const items = REQUIRED_LEGAL.map((r) => {
      const p = byslug.get(r.slug);
      const words = stripHtml(p?.bodyHtml ?? '').split(/\s+/).filter(Boolean).length;
      return {
        slug: r.slug,
        title: r.title,
        why: r.why,
        id: p?.id ?? null,
        written: words >= 40,
        words,
        published: !!p?.isPublished,
        ready: !!p?.isPublished && words >= 40,
      };
    });

    return {
      items,
      ready: items.every((i) => i.ready),
      missing: items.filter((i) => !i.ready).length,
    };
  }

  /* ================= what the storefront reads ================= */

  async publicPage(slug: string) {
    const p = await this.prisma.db.contentPage.findFirst({ where: { slug, isPublished: true } });
    if (!p) throw new NotFoundException('Page not found');
    return p;
  }

  async publicFooter() {
    return this.prisma.db.contentPage.findMany({
      where: { isPublished: true, showInFooter: true },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: { slug: true, title: true, kind: true },
    });
  }

  /**
   * published FAQ, group-অনুযায়ী সাজানো — /faq পাতা এটাই আঁকে।
   * group-এর ক্রম = group-এর প্রথম প্রশ্নের sortOrder, যাতে admin-এ টেনে
   * সাজালে পাতাতেও সেই ক্রমই থাকে।
   */
  async publicFaqs() {
    const rows = await this.prisma.db.faqEntry.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { groupName: true, question: true, answerHtml: true },
    });
    const groups: { name: string; items: { q: string; aHtml: string }[] }[] = [];
    for (const r of rows) {
      let g = groups.find((x) => x.name === r.groupName);
      if (!g) {
        g = { name: r.groupName, items: [] };
        groups.push(g);
      }
      g.items.push({ q: r.question, aHtml: r.answerHtml ?? '' });
    }
    return groups;
  }

  async publicJournal(slug?: string) {
    if (slug) {
      const p = await this.prisma.db.journalPost.findFirst({ where: { slug, isPublished: true } });
      if (!p) throw new NotFoundException('Post not found');
      return p;
    }
    return this.prisma.db.journalPost.findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: 'desc' },
      take: 50,
      select: {
        slug: true, title: true, excerpt: true, coverUrl: true,
        author: true, publishedAt: true, readMinutes: true,
      },
    });
  }

  /** grouped the way the storefront's accordion wants it */
  async publicFaq() {
    const rows = await this.prisma.db.faqEntry.findMany({
      where: { isPublished: true },
      orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }],
    });
    const groups = new Map<string, { q: string; a: string }[]>();
    for (const r of rows) {
      const list = groups.get(r.groupName) ?? [];
      list.push({ q: r.question, a: r.answerHtml ?? '' });
      groups.set(r.groupName, list);
    }
    return [...groups.entries()].map(([title, items]) => ({ title, items }));
  }
}
