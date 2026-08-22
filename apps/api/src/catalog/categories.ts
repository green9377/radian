import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

/*  The storefront's fixed top-level routes (apps/web/app/*). A category slug
    landing on one of these would shadow that page, because categories render
    flat at the root. "p" is the product prefix, "admin" and "shop" are kept
    back for safety.  */
const RESERVED_SLUGS = new Set([
  'about', 'account', 'api', 'cart', 'categories', 'checkout', 'collections',
  'contact', 'delivery-info', 'faq', 'journal', 'occasions', 'order-success',
  'p', 'pay', 'privacy-policy', 'products', 'refund-policy', 'review',
  'reviews', 'search', 'sitemap.xml', 'robots.txt', 'terms', 'track',
  'wishlist', 'admin', 'shop', 'category', 'product',
]);

// admin-configurable category master (DEC-PRD-001), two levels (parentId self-FK)
interface CategoryDto {
  slug: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  description?: string | null;
  summary?: string | null;
  imageUrl?: string | null;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  bannerHeading?: string | null;
  /** heading above the size chooser on a product page — "Bouquet Size" */
  sizeLabel?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
  showOnNavbar?: boolean;
  isFeatured?: boolean;
  actorName?: string;
}

const ENTITY = 'Category';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(q: { parentId?: string; search?: string }) {
    const where: Prisma.CategoryWhereInput = {};
    if (q.parentId === 'root') where.parentId = null;
    else if (q.parentId) where.parentId = q.parentId;
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };
    return this.prisma.db.category.findMany({
      where,
      include: {
        parent: true,
        children: { where: { deletedAt: null } },
        _count: { select: { products: { where: { deletedAt: null } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const c = await this.prisma.db.category.findFirst({
      where: { id },
      include: { parent: true, children: { where: { deletedAt: null } } },
    });
    if (!c) throw new NotFoundException('Category not found');
    return c;
  }

  async create(dto: CategoryDto) {
    await this.ensureSlugFree(dto.slug);
    if (dto.parentId) await this.ensureExists(dto.parentId);
    const c = await this.prisma.db.category.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        description: dto.description,
        summary: dto.summary,
        imageUrl: dto.imageUrl,
        iconUrl: dto.iconUrl,
        bannerUrl: dto.bannerUrl,
        bannerHeading: dto.bannerHeading,
        sizeLabel: dto.sizeLabel,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        ogTitle: dto.ogTitle,
        ogDescription: dto.ogDescription,
        ogImageUrl: dto.ogImageUrl,
        showOnNavbar: dto.showOnNavbar,
        isFeatured: dto.isFeatured,
      },
    });
    await this.log(c.id, 'CREATE', dto.actorName, `Category "${c.name}" created`);
    return c;
  }

  async update(id: string, dto: Partial<CategoryDto>) {
    await this.ensureExists(id);
    if (dto.slug) await this.ensureSlugFree(dto.slug, id);
    if (dto.parentId) {
      if (dto.parentId === id) throw new BadRequestException('category cannot be its own parent');
      await this.ensureExists(dto.parentId);
    }
    const c = await this.prisma.db.category.update({
      where: { id },
      data: {
        slug: dto.slug,
        name: dto.name,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        description: dto.description,
        summary: dto.summary,
        imageUrl: dto.imageUrl,
        iconUrl: dto.iconUrl,
        bannerUrl: dto.bannerUrl,
        bannerHeading: dto.bannerHeading,
        sizeLabel: dto.sizeLabel,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        ogTitle: dto.ogTitle,
        ogDescription: dto.ogDescription,
        ogImageUrl: dto.ogImageUrl,
        showOnNavbar: dto.showOnNavbar,
        isFeatured: dto.isFeatured,
      },
    });
    await this.log(c.id, 'UPDATE', dto.actorName, `Category "${c.name}" updated`);
    return c;
  }

  async remove(id: string, actorName = 'Admin') {
    const c = await this.prisma.db.category.findFirst({
      where: { id },
      include: {
        _count: {
          select: { products: { where: { deletedAt: null } }, children: { where: { deletedAt: null } } },
        },
      },
    });
    if (!c) throw new NotFoundException('Category not found');
    if (c._count.products > 0 || c._count.children > 0)
      throw new BadRequestException('category has products or sub-categories — reassign them first');
    await this.prisma.db.category.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log(id, 'DELETE', actorName, `Category "${c.name}" deleted (soft)`);
    return { id, deleted: true };
  }

  /* ═══════════════ FAQ — D-CAT-03 ═══════════════
     The five or six questions under a category page. Category owns them
     (One Data One Owner): they are deleted with it, they are listed with it,
     and no second module needs to know they exist.

     ⚠️ Sub-categories deliberately have none of their own. The sub-category
     page is the lean one — grid and nothing else (D42/D43) — and asking the
     owner to write six answers for each of forty-four sub-pages is asking for
     forty-four empty sections. A sub-page shows its parent's FAQ or none.
  */

  faqs(categoryId: string) {
    return this.prisma.db.categoryFaq.findMany({
      where: { categoryId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async addFaq(categoryId: string, dto: { question: string; answer: string }, actorName = 'Admin') {
    await this.ensureExists(categoryId);
    if (!dto.question?.trim() || !dto.answer?.trim())
      throw new BadRequestException('a question needs both a question and an answer');
    const last = await this.prisma.db.categoryFaq.findFirst({
      where: { categoryId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const row = await this.prisma.db.categoryFaq.create({
      data: {
        categoryId,
        question: dto.question.trim(),
        answer: dto.answer.trim(),
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    await this.log(categoryId, 'UPDATE', actorName, `FAQ added: "${row.question}"`);
    return row;
  }

  async updateFaq(
    id: string,
    dto: { question?: string; answer?: string; sortOrder?: number; isActive?: boolean },
    actorName = 'Admin',
  ) {
    const row = await this.prisma.db.categoryFaq.findFirst({ where: { id }, select: { categoryId: true } });
    if (!row) throw new NotFoundException('Question not found');
    const saved = await this.prisma.db.categoryFaq.update({
      where: { id },
      data: {
        question: dto.question?.trim(),
        answer: dto.answer?.trim(),
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.log(row.categoryId, 'UPDATE', actorName, `FAQ edited: "${saved.question}"`);
    return saved;
  }

  /** soft delete, like everything else — a question removed by accident is
   *  a paragraph somebody wrote, not a row nobody will miss */
  async removeFaq(id: string, actorName = 'Admin') {
    const row = await this.prisma.db.categoryFaq.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Question not found');
    await this.prisma.db.categoryFaq.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log(row.categoryId, 'UPDATE', actorName, `FAQ removed: "${row.question}"`);
    return { id, deleted: true };
  }

  private async ensureExists(id: string) {
    const c = await this.prisma.db.category.findFirst({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException('Category not found');
  }
  private async ensureSlugFree(slug: string, exceptId?: string) {
    /*  Flat URLs (owner, 22 Aug 2026): a category lives at the ROOT of the
        storefront — radianbd.com/<slug>. The fixed pages live there too, so a
        category named "cart" would shadow the cart. The list mirrors
        apps/web/app's top-level routes; update it when a new page is born.  */
    if (RESERVED_SLUGS.has(slug)) {
      throw new BadRequestException(
        `"${slug}" is a fixed page on the website — pick another slug`,
      );
    }
    const dupe = await this.prisma.db.category.findFirst({ where: { slug }, select: { id: true } });
    if (dupe && dupe.id !== exceptId) throw new BadRequestException(`slug "${slug}" already in use`);
  }
  private async log(id: string, action: 'CREATE' | 'UPDATE' | 'DELETE', actorName = 'Admin', label: string) {
    await this.audit.record({ entityType: ENTITY, entityId: id, action, actorName });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label, actorName });
  }
}

@Controller('categories')
export class CategoriesController {
  constructor(private readonly svc: CategoriesService) {}

  @Get()
  list(@Query('parentId') parentId?: string, @Query('search') search?: string) {
    return this.svc.list({ parentId, search });
  }
  /* FAQ routes come BEFORE `:id`, or ":id" swallows "faqs" */
  @Get(':id/faqs')
  faqs(@Param('id') id: string) {
    return this.svc.faqs(id);
  }
  @Post(':id/faqs')
  addFaq(
    @Param('id') id: string,
    @Body() dto: { question: string; answer: string },
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.addFaq(id, dto, actor ?? 'Admin');
  }
  @Patch('faqs/:faqId')
  updateFaq(
    @Param('faqId') faqId: string,
    @Body() dto: { question?: string; answer?: string; sortOrder?: number; isActive?: boolean },
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.updateFaq(faqId, dto, actor ?? 'Admin');
  }
  @Delete('faqs/:faqId')
  removeFaq(@Param('faqId') faqId: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.removeFaq(faqId, actor ?? 'Admin');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }
  @Post()
  create(@Body() dto: CategoryDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CategoryDto>, @Headers('x-actor-name') actor?: string) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}

@Module({
  providers: [CategoriesService],
  controllers: [CategoriesController],
})
export class CategoriesModule {}
