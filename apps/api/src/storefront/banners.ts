import {
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
import { BannerPlacement, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  Banner admin — hero slider, promo strip, announcement bar.

  Owner's decision, 30 Jul 2026: he manages these himself. Eid, Valentine's and
  Mother's Day each move the hero, and routing that through a developer every
  season guarantees a stale homepage.

  The public read lives in `shop.ts` with the rest of the storefront surface.
  This file is the admin side only, and is closed by the global AuthGuard.
  ═══════════════════════════════════════════════════════════════════════════
*/

const ENTITY = 'Banner';

export interface BannerDto {
  placement: BannerPlacement;
  zone?: string | null;
  eyebrow?: string | null;
  titleMain?: string | null;
  titleAccent?: string | null;
  lead?: string | null;
  cta1Label?: string | null;
  cta1Href?: string | null;
  cta2Label?: string | null;
  cta2Href?: string | null;
  proof?: string[];
  float1Icon?: string | null;
  float1Title?: string | null;
  float1Sub?: string | null;
  float2Icon?: string | null;
  float2Title?: string | null;
  float2Sub?: string | null;
  imageUrl?: string | null;
  mobileImageUrl?: string | null;
  float1Show?: boolean;
  float2Show?: boolean;
  liveFrom?: string | null;
  liveTo?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(placement?: string) {
    const where: Prisma.BannerWhereInput = {};
    if (placement) where.placement = placement as BannerPlacement;
    return this.prisma.db.banner.findMany({
      where,
      orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.db.banner.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Banner not found');
    return row;
  }

  async create(dto: BannerDto) {
    const row = await this.prisma.db.banner.create({ data: toData(dto) });
    await this.log(row.id, 'CREATE', dto.actorName, label(row));
    return row;
  }

  async update(id: string, dto: Partial<BannerDto>) {
    await this.findOne(id);
    const row = await this.prisma.db.banner.update({ where: { id }, data: toData(dto) });
    await this.log(id, 'UPDATE', dto.actorName, label(row));
    return row;
  }

  /**
   * Soft delete, like everything else here.
   *
   * It matters more than usual for banners: they are seasonal, and "delete last
   * Eid's banner" is regularly followed eleven months later by "where did last
   * Eid's banner go". A row that is only hidden can be brought back.
   */
  async remove(id: string, actorName = 'Admin') {
    const row = await this.findOne(id);
    await this.prisma.db.banner.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.log(id, 'DELETE', actorName, label(row));
    return { ok: true };
  }

  private log(id: string, action: 'CREATE' | 'UPDATE' | 'DELETE', actorName = 'Admin', text: string) {
    return this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action,
      actorName,
      changes: { label: text },
    });
  }
}

function label(row: { placement: string; titleMain: string | null }) {
  return `${row.placement} — ${row.titleMain ?? 'untitled'}`;
}

/** Empty strings from a form field mean "cleared", not "the text is ''". */
const blankToNull = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : (v as string | null | undefined);

function toData(dto: Partial<BannerDto>): Prisma.BannerUncheckedCreateInput {
  const d = {
    placement: dto.placement,
    zone: blankToNull(dto.zone),
    eyebrow: blankToNull(dto.eyebrow),
    titleMain: blankToNull(dto.titleMain),
    titleAccent: blankToNull(dto.titleAccent),
    lead: blankToNull(dto.lead),
    cta1Label: blankToNull(dto.cta1Label),
    cta1Href: blankToNull(dto.cta1Href),
    cta2Label: blankToNull(dto.cta2Label),
    cta2Href: blankToNull(dto.cta2Href),
    proof: dto.proof,
    float1Icon: blankToNull(dto.float1Icon),
    float1Title: blankToNull(dto.float1Title),
    float1Sub: blankToNull(dto.float1Sub),
    float2Icon: blankToNull(dto.float2Icon),
    float2Title: blankToNull(dto.float2Title),
    float2Sub: blankToNull(dto.float2Sub),
    imageUrl: blankToNull(dto.imageUrl),
    mobileImageUrl: blankToNull(dto.mobileImageUrl),
    float1Show: dto.float1Show,
    float2Show: dto.float2Show,
    liveFrom: dto.liveFrom ? new Date(dto.liveFrom) : dto.liveFrom === null ? null : undefined,
    liveTo: dto.liveTo ? new Date(dto.liveTo) : dto.liveTo === null ? null : undefined,
    sortOrder: dto.sortOrder,
    isActive: dto.isActive,
  };
  // Drop untouched keys so a PATCH of one field does not blank the rest.
  return Object.fromEntries(
    Object.entries(d).filter(([, v]) => v !== undefined),
  ) as Prisma.BannerUncheckedCreateInput;
}

@Injectable()
export class StorefrontSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    // upsert, not findFirst — a fresh database or a restored backup must not
    // leave the screen with nothing to edit.
    return this.prisma.db.storefrontSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });
  }

  /**
   * ⚠️ EVERY FIELD IS OPTIONAL AND ONLY WRITTEN WHEN SENT. The first version
   * took `heroRotateSeconds` alone and always wrote it, so any screen touching
   * another setting would have reset the slider to a default it never asked
   * about.
   *
   * `shopChipTitle`/`shopChipSub` — the small card floating over the shop
   * photograph ("Dhanmondi, Dhaka / Watch your gift arranged by hand"). The
   * schema has carried them since the day the words were pulled out of the
   * component, and the API has been serving them all along; there was simply
   * no screen to type them into, so the owner could not change his own
   * address (found 11 Aug 2026). Blank clears the card rather than leaving
   * an empty white box on the photo.
   */
  update(dto: {
    heroRotateSeconds?: number;
    announcementAuto?: boolean;
    shopChipTitle?: string | null;
    shopChipSub?: string | null;
    pdpUnderBuyText?: string | null;
    pdpUnderBuyPreorderText?: string | null;
  }) {
    const data: {
      heroRotateSeconds?: number;
      announcementAuto?: boolean;
      shopChipTitle?: string | null;
      shopChipSub?: string | null;
      pdpUnderBuyText?: string | null;
      pdpUnderBuyPreorderText?: string | null;
    } = {};
    if (dto.heroRotateSeconds !== undefined) data.heroRotateSeconds = clampSeconds(dto.heroRotateSeconds);
    // the announcement line with no banner live: describe the service, or draw nothing
    if (dto.announcementAuto !== undefined) data.announcementAuto = Boolean(dto.announcementAuto);
    if (dto.shopChipTitle !== undefined) data.shopChipTitle = String(dto.shopChipTitle ?? '').trim() || null;
    if (dto.shopChipSub !== undefined) data.shopChipSub = String(dto.shopChipSub ?? '').trim() || null;
    // DEC-PRD-052 — the line under Buy Now; blank returns the built-in wording
    if (dto.pdpUnderBuyText !== undefined) data.pdpUnderBuyText = String(dto.pdpUnderBuyText ?? '').trim() || null;
    if (dto.pdpUnderBuyPreorderText !== undefined) data.pdpUnderBuyPreorderText = String(dto.pdpUnderBuyPreorderText ?? '').trim() || null;

    return this.prisma.db.storefrontSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...data },
      update: data,
    });
  }
}

/**
 * 2–30 seconds.
 *
 * Below two the slider is unreadable and looks broken; above thirty most
 * visitors never see the second slide, which quietly wastes the banner the
 * owner spent time making.
 */
function clampSeconds(v: number | undefined): number {
  if (!v || Number.isNaN(v)) return 6;
  return Math.min(30, Math.max(2, Math.round(v)));
}

@Controller('banners')
export class BannersController {
  constructor(
    private readonly svc: BannersService,
    private readonly settings: StorefrontSettingsService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.settings.get();
  }
  @Patch('settings')
  patchSettings(
    @Body() dto: { heroRotateSeconds?: number; announcementAuto?: boolean; shopChipTitle?: string | null; shopChipSub?: string | null },
  ) {
    return this.settings.update(dto);
  }

  @Get()
  list(@Query('placement') placement?: string) {
    return this.svc.list(placement);
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }
  @Post()
  create(@Body() dto: BannerDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<BannerDto>, @Headers('x-actor-name') actor?: string) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}

@Module({
  providers: [BannersService, StorefrontSettingsService],
  controllers: [BannersController],
  exports: [StorefrontSettingsService],
})
export class BannersModule {}
