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
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { eraseOrBury } from '../common/erase';

/*
  ═══════════════════════════════════════════════════════════════════════════
  CATEGORY STORY — the product page's trust badges and "What's inside",
  written once.

  DEC-PRD-023, the owner's instruction, 2 August 2026:
  > *"trust badges, what's inside and faq are showing up — but where in the
  >  admin panel do they come from? I never made them anywhere... I want to be
  >  able to create each of them in the admin panel and have the data simply
  >  arrive here. On a trust badge I cannot customise the icon at all."*

  ⚠️ Neither of these had a master until then. The rows came from a template
  HAND-WRITTEN inside the product editor — my choice of icon and my wording.
  He had no way to change either.

  ⚠️ `TrustBadge` (Storefront → Trust) is an entirely different table: the
  homepage strip, whole-site, per zone. This one is the product page, per
  category. The names are close enough to confuse, so it is written down in
  both places.

  The inheritance rule is exactly the one bundles and craft points follow —
  this page needs ONE idea of inheritance, not three:
      written on the category → every product in it gets it
      written on the product  → only there, and it REPLACES the category's

  DEC-PRD-046 (23 Aug 2026) — "What's inside" now comes in NAMED TEMPLATES,
  several per category. Picking one COPIES its rows onto the product; the
  template is a starting point, never a live link.
  ═══════════════════════════════════════════════════════════════════════════
*/

interface BadgeDto {
  categoryId: string;
  /** a built-in name, e.g. "bolt" */
  icon?: string | null;
  /** an uploaded picture — when filled, this is the one that shows */
  iconUrl?: string | null;
  label: string;
  sub?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

interface SpecDto {
  categoryId: string;
  /** DEC-PRD-046 — which named list this row belongs to */
  templateId?: string | null;
  item: string;
  qty: string;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

@Injectable()
export class CategoryStoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ─────────────── trust badges ─────────────── */

  listBadges(categoryId: string) {
    if (!categoryId) throw new BadRequestException('categoryId is required');
    return this.prisma.db.categoryTrustBadge.findMany({
      where: { categoryId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createBadge(dto: BadgeDto) {
    if (!dto.categoryId) throw new BadRequestException('categoryId is required');
    const last = await this.prisma.db.categoryTrustBadge.findFirst({
      where: { categoryId: dto.categoryId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const row = await this.prisma.db.categoryTrustBadge.create({
      data: {
        categoryId: dto.categoryId,
        icon: dto.icon ?? null,
        iconUrl: dto.iconUrl ?? null,
        /*  Allowed to be created with no name — the owner adds the row
            first and writes afterwards. The STOREFRONT does not draw an
            empty one (same as craft points), so an unfinished row costs
            nothing but a warning in the admin.  */
        label: dto.label ?? '',
        sub: dto.sub ?? null,
        sortOrder: dto.sortOrder ?? (last ? last.sortOrder + 1 : 0),
        isActive: dto.isActive ?? true,
      },
    });
    await this.log('CategoryTrustBadge', row.id, 'CREATE', dto.actorName, 'Trust badge added');
    return row;
  }

  async updateBadge(id: string, dto: Partial<BadgeDto>) {
    await this.ensure('categoryTrustBadge', id);

    /*
      ═══════════════════════════════════════════════════════════════════════
      ⚠️ THE ICON WAS SAVED AND THEN IMMEDIATELY ERASED — owner, 9 Aug 2026:
      *"on the category page, giving a badge an icon and saving does not save
      it — go to another tab and it has vanished."*

      The rule is right — one badge shows EITHER a built-in name OR an
      uploaded picture, never both. The way it was written was not. Two
      spreads ran back to back:

          ...(dto.icon    !== undefined ? { icon: dto.icon, iconUrl: null } : {}),
          ...(dto.iconUrl !== undefined ? { iconUrl: dto.iconUrl, icon: null } : {}),

      and the admin sends BOTH keys together — picking "bolt" posts
      `{ icon: "bolt", iconUrl: null }`. The first spread set the icon; the
      second, seeing `iconUrl` present, set `icon: null` again. Later keys
      win in an object literal, so every pick was written and wiped in the
      same statement. The screen looked right until the next fetch.

      One decision, made once, instead of two clauses fighting.
      ═══════════════════════════════════════════════════════════════════════
    */
    const picture = dto.iconUrl?.trim() || null;
    const named = dto.icon?.trim() || null;
    const touchesArt = dto.icon !== undefined || dto.iconUrl !== undefined;
    /*  A picture wins when both arrive — uploading is the more deliberate
        act, and it is the only one that can carry the shop's own artwork.  */
    const art = touchesArt
      ? picture
        ? { iconUrl: picture, icon: null }
        : { icon: named, iconUrl: null }
      : {};

    return this.prisma.db.categoryTrustBadge.update({
      where: { id },
      data: {
        ...art,
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.sub !== undefined ? { sub: dto.sub || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async removeBadge(id: string, actorName = 'Admin') {
    await this.ensure('categoryTrustBadge', id);
    await this.prisma.db.categoryTrustBadge.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.log('CategoryTrustBadge', id, 'DELETE', actorName, 'Trust badge removed');
    return { id, deleted: true };
  }

  /* ─────────────── what's inside · the named lists (DEC-PRD-046) ─────────── */

  /**
   * Every named list this category offers, each with its rows.
   *
   * A category that has rows but no template cannot exist after the
   * migration; the fallback below is only for a category whose rows were
   * written between the deploy and the backfill, and it costs one branch.
   */
  async listTemplates(categoryId: string) {
    if (!categoryId) throw new BadRequestException('categoryId is required');
    return this.prisma.db.categorySpecTemplate.findMany({
      where: { categoryId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        rows: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  async createTemplate(dto: { categoryId: string; name?: string; actorName?: string }) {
    if (!dto.categoryId) throw new BadRequestException('categoryId is required');
    const last = await this.prisma.db.categorySpecTemplate.findFirst({
      where: { categoryId: dto.categoryId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const row = await this.prisma.db.categorySpecTemplate.create({
      data: {
        categoryId: dto.categoryId,
        /*  A blank name is allowed for the same reason a blank badge is: the
            list is made first and named while it is being filled. The product
            screen shows an unnamed one as "Untitled list" rather than a gap.  */
        name: dto.name?.trim() || '',
        sortOrder: last ? last.sortOrder + 1 : 0,
      },
    });
    await this.log('CategorySpecTemplate', row.id, 'CREATE', dto.actorName, 'What’s-inside list added');
    return row;
  }

  async updateTemplate(
    id: string,
    dto: { name?: string; sortOrder?: number; isActive?: boolean; actorName?: string },
  ) {
    const found = await this.prisma.db.categorySpecTemplate.findFirst({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('list not found');
    return this.prisma.db.categorySpecTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /**
   * ⚠️ Its rows go with it — `onDelete: Cascade` on a real delete, and by hand
   * on a bury, because a soft-deleted parent does not hide its children.
   * Nothing that was ever COPIED onto a product is touched: those rows belong
   * to the product now (the owner's rule, 23 Aug).
   */
  async removeTemplate(id: string, actorName = 'Admin') {
    const found = await this.prisma.db.categorySpecTemplate.findFirst({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('list not found');
    await eraseOrBury(
      () => this.prisma.categorySpecTemplate.delete({ where: { id } }),
      async () => {
        await this.prisma.db.categorySpec.updateMany({
          where: { templateId: id, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        await this.prisma.db.categorySpecTemplate.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
      },
      'What’s-inside list',
    );
    await this.log('CategorySpecTemplate', id, 'DELETE', actorName, 'What’s-inside list removed');
    return { id, deleted: true };
  }

  /* ─────────────── what's inside · the rows ─────────────── */

  /**
   * DEC-PRD-046 — `templateId` narrows to one named list. Without it, every
   * row in the category comes back, which is what the old single-list callers
   * ask for and what the storefront's fallback wants.
   */
  listSpecs(categoryId: string, templateId?: string) {
    if (!categoryId) throw new BadRequestException('categoryId is required');
    return this.prisma.db.categorySpec.findMany({
      where: { categoryId, ...(templateId ? { templateId } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createSpec(dto: SpecDto) {
    if (!dto.categoryId) throw new BadRequestException('categoryId is required');
    /*  A row has to live in a named list. If the screen did not say which,
        the category's first list takes it — and if the category has none yet,
        one is made. That is the same shape as before this decision: the
        category has a list, it just now has a name.  */
    let templateId = dto.templateId ?? null;
    if (!templateId) {
      const first = await this.prisma.db.categorySpecTemplate.findFirst({
        where: { categoryId: dto.categoryId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      templateId = first?.id ?? (await this.createTemplate({ categoryId: dto.categoryId, name: 'Standard' })).id;
    }
    const last = await this.prisma.db.categorySpec.findFirst({
      where: { categoryId: dto.categoryId, templateId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const row = await this.prisma.db.categorySpec.create({
      data: {
        categoryId: dto.categoryId,
        templateId,
        item: dto.item ?? '',
        qty: dto.qty ?? '',
        sortOrder: dto.sortOrder ?? (last ? last.sortOrder + 1 : 0),
        isActive: dto.isActive ?? true,
      },
    });
    await this.log('CategorySpec', row.id, 'CREATE', dto.actorName, 'Spec row added');
    return row;
  }

  async updateSpec(id: string, dto: Partial<SpecDto>) {
    await this.ensure('categorySpec', id);
    return this.prisma.db.categorySpec.update({
      where: { id },
      data: {
        ...(dto.item !== undefined ? { item: dto.item } : {}),
        ...(dto.qty !== undefined ? { qty: dto.qty } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async removeSpec(id: string, actorName = 'Admin') {
    await this.ensure('categorySpec', id);
    await eraseOrBury(
      () => this.prisma.categorySpec.delete({ where: { id } }),
      () => this.prisma.db.categorySpec.update({ where: { id }, data: { deletedAt: new Date() } }),
      'Category Spec',
    );
    await this.log('CategorySpec', id, 'DELETE', actorName, 'Spec row removed');
    return { id, deleted: true };
  }

  /* ─────────────── shared ─────────────── */

  private async ensure(model: 'categoryTrustBadge' | 'categorySpec', id: string) {
    const row =
      model === 'categoryTrustBadge'
        ? await this.prisma.db.categoryTrustBadge.findFirst({ where: { id }, select: { id: true } })
        : await this.prisma.db.categorySpec.findFirst({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('row not found');
  }

  private async log(
    entityType: string,
    entityId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    actorName = 'Admin',
    label: string,
  ) {
    await this.audit.record({ entityType, entityId, action, actorName });
    await this.audit.event({ entityType, entityId, kind: 'general', label, actorName });
  }
}

@Controller('category-story')
export class CategoryStoryController {
  constructor(private readonly svc: CategoryStoryService) {}

  @Get('trust')
  listBadges(@Query('categoryId') categoryId: string) {
    return this.svc.listBadges(categoryId);
  }
  @Post('trust')
  createBadge(@Body() dto: BadgeDto, @Headers('x-actor-name') a?: string) {
    return this.svc.createBadge({ ...dto, actorName: dto.actorName ?? a });
  }
  @Patch('trust/:id')
  updateBadge(@Param('id') id: string, @Body() dto: Partial<BadgeDto>) {
    return this.svc.updateBadge(id, dto);
  }
  @Delete('trust/:id')
  removeBadge(@Param('id') id: string, @Headers('x-actor-name') a?: string) {
    return this.svc.removeBadge(id, a ?? 'Admin');
  }

  /*  DEC-PRD-046 — the named lists. Declared before `spec` only so the two
      read together; they are different paths and do not shadow.  */
  @Get('spec-lists')
  listTemplates(@Query('categoryId') categoryId: string) {
    return this.svc.listTemplates(categoryId);
  }
  @Post('spec-lists')
  createTemplate(
    @Body() dto: { categoryId: string; name?: string },
    @Headers('x-actor-name') a?: string,
  ) {
    return this.svc.createTemplate({ ...dto, actorName: a });
  }
  @Patch('spec-lists/:id')
  updateTemplate(
    @Param('id') id: string,
    @Body() dto: { name?: string; sortOrder?: number; isActive?: boolean },
    @Headers('x-actor-name') a?: string,
  ) {
    return this.svc.updateTemplate(id, { ...dto, actorName: a });
  }
  @Delete('spec-lists/:id')
  removeTemplate(@Param('id') id: string, @Headers('x-actor-name') a?: string) {
    return this.svc.removeTemplate(id, a ?? 'Admin');
  }

  @Get('spec')
  listSpecs(
    @Query('categoryId') categoryId: string,
    @Query('templateId') templateId?: string,
  ) {
    return this.svc.listSpecs(categoryId, templateId);
  }
  @Post('spec')
  createSpec(@Body() dto: SpecDto, @Headers('x-actor-name') a?: string) {
    return this.svc.createSpec({ ...dto, actorName: dto.actorName ?? a });
  }
  @Patch('spec/:id')
  updateSpec(@Param('id') id: string, @Body() dto: Partial<SpecDto>) {
    return this.svc.updateSpec(id, dto);
  }
  @Delete('spec/:id')
  removeSpec(@Param('id') id: string, @Headers('x-actor-name') a?: string) {
    return this.svc.removeSpec(id, a ?? 'Admin');
  }
}

@Module({
  providers: [CategoryStoryService],
  controllers: [CategoryStoryController],
})
export class CategoryStoryModule {}
