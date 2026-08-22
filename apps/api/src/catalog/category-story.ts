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
  CATEGORY STORY — product page-এর trust badge আর "What's inside", একবার লেখা

  DEC-PRD-023, মালিকের নির্দেশ ২ আগস্ট ২০২৬:
  > *"trust badges, what's inside, faq আসতাছে — কিন্তু এগুলা admin panel-এর
  >  কোথা থেকে আসতাছে? আমি তো কোথাও করি নাই... আমি চাই প্রতিটা admin panel-এ
  >  যেন create করে রাখা যায় আর এখানে যেন just সে data আসে। trust badge-এ
  >  তো আমি কোন icon কিছুই custom করে বানাতে পারছি না।"*

  ⚠️ এতদিন এই দুটোর কোনো master ছিল না। Product editor-এ **হাতে লেখা
  template** থেকে সারি তৈরি হতো — আমার বেছে দেওয়া icon আর শব্দ। মালিকের
  বদলানোর পথ ছিল না।

  ⚠️ `TrustBadge` (Storefront → Trust) সম্পূর্ণ আলাদা টেবিল — ওটা homepage-এর
  strip, গোটা সাইটের, zone ধরে। এটা product page-এর, category ধরে। নাম
  কাছাকাছি বলে গুলিয়ে ফেলা সহজ, তাই দুই জায়গাতেই লিখে রাখা হলো।

  উত্তরাধিকারের নিয়ম bundle আর craft-এর হুবহু একই — এই page-এ একটাই ধারণা
  থাকুক, তিনটে নয়:
      category-তে লেখা → ওই category-র সব product পায়
      product-এ লেখা   → শুধু সেখানে, আর category-রটা **বদলে** বসে
  ═══════════════════════════════════════════════════════════════════════════
*/

interface BadgeDto {
  categoryId: string;
  /** built-in নাম, যেমন "bolt" */
  icon?: string | null;
  /** নিজের আপলোড করা ছবি — ভরা থাকলে এটাই চলে */
  iconUrl?: string | null;
  label: string;
  sub?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

interface SpecDto {
  categoryId: string;
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
        /*  খালি নামে তৈরি হতে দেওয়া হয় — মালিক আগে সারি যোগ করেন, তারপর
            লেখেন। **storefront** খালিটা আঁকে না (craft-এর মতোই), তাই
            অসম্পূর্ণ সারির দাম শুধু admin-এ একটা সতর্কবাণী।  */
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
      *"category page-এ badge-এ icon দিয়ে save করলে সেটা save হয় না, অন্য
      tab-এ গেলেই হাওয়া হয়ে যায়।"*

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

  /* ─────────────── what's inside ─────────────── */

  listSpecs(categoryId: string) {
    if (!categoryId) throw new BadRequestException('categoryId is required');
    return this.prisma.db.categorySpec.findMany({
      where: { categoryId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createSpec(dto: SpecDto) {
    if (!dto.categoryId) throw new BadRequestException('categoryId is required');
    const last = await this.prisma.db.categorySpec.findFirst({
      where: { categoryId: dto.categoryId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const row = await this.prisma.db.categorySpec.create({
      data: {
        categoryId: dto.categoryId,
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

  @Get('spec')
  listSpecs(@Query('categoryId') categoryId: string) {
    return this.svc.listSpecs(categoryId);
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
