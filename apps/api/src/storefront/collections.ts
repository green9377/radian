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
} from '@nestjs/common';
import { CollectionMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  Collections — named shelves of products. Today: the four budget cards.

  Two kinds in one table because a shopper sees no difference — a titled page
  reached from a card. Only how membership is decided differs: a price window
  that maintains itself, or a list the owner keeps.

  ⚠️ The price window compares what the CUSTOMER PAYS, after discount (owner's
  decision, 30 Jul). A ৳1,100 bouquet at 10% off belongs in "Under ৳1,000",
  because ৳990 is the number on the card. Accepted consequence: when the
  discount ends, the product leaves that shelf on its own and nobody is told.

  ⚠️ MEMBERSHIP IS NOT RESOLVED HERE YET. The homepage rail needs the four
  cards, not their contents, and the collection PAGE has not been built. When
  it is, the price filter has to be raw SQL: the paid price is computed from
  `sellingPricePaisa` + `discountType` + `discountValue`, so Prisma cannot
  filter on it. Written down because a half-remembered version of this is how
  a shelf ends up quietly listing the wrong products.
  ═══════════════════════════════════════════════════════════════════════════
*/

const ENTITY = 'Collection';

export interface CollectionDto {
  slug?: string;
  name?: string;
  kicker?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  mode?: CollectionMode;
  minPaisa?: number | null;
  maxPaisa?: number | null;
  accent?: boolean;
  isFeatured?: boolean;
  zone?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.db.collection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.db.collection.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Collection not found');
    return row;
  }

  async create(dto: CollectionDto) {
    const name = dto.name?.trim() || 'New collection';
    const row = await this.prisma.db.collection.create({
      data: { ...clean(dto), name, slug: await this.freeSlug(dto.slug || name) },
    });
    await this.log(row.id, 'CREATE', dto.actorName, row.name);
    return row;
  }

  async update(id: string, dto: CollectionDto) {
    await this.findOne(id);
    const data = clean(dto);
    if (dto.slug !== undefined) data.slug = await this.freeSlug(dto.slug, id);
    const row = await this.prisma.db.collection.update({ where: { id }, data });
    await this.log(id, 'UPDATE', dto.actorName, row.name);
    return row;
  }

  async remove(id: string, actorName = 'Admin') {
    const row = await this.findOne(id);
    await this.prisma.db.collection.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.log(id, 'DELETE', actorName, row.name);
    return { ok: true };
  }

  /**
   * The slug is in the customer's address bar, so a clash cannot be allowed to
   * fail at save time with a database error the owner cannot read. A number is
   * appended instead — "premium", then "premium-2".
   */
  private async freeSlug(raw: string, exceptId?: string): Promise<string> {
    const base =
      raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'collection';
    for (let n = 0; n < 50; n++) {
      const candidate = n === 0 ? base : `${base}-${n + 1}`;
      const taken = await this.prisma.db.collection.findFirst({
        where: { slug: candidate, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new BadRequestException('Could not find a free web address for that name');
  }

  private log(id: string, action: 'CREATE' | 'UPDATE' | 'DELETE', actorName = 'Admin', label: string) {
    return this.audit.record({ entityType: ENTITY, entityId: id, action, actorName, changes: { label } });
  }
}

interface CollectionFields {
  slug?: string;
  name?: string;
  kicker?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  mode?: CollectionMode;
  minPaisa?: number | null;
  maxPaisa?: number | null;
  accent?: boolean;
  isFeatured?: boolean;
  zone?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

function clean(dto: CollectionDto): CollectionFields {
  const d: CollectionFields = {};
  if (dto.name !== undefined) d.name = dto.name.trim();
  if (dto.kicker !== undefined) d.kicker = dto.kicker?.trim() || null;
  if (dto.subtitle !== undefined) d.subtitle = dto.subtitle?.trim() || null;
  if (dto.imageUrl !== undefined) d.imageUrl = dto.imageUrl || null;
  if (dto.mode !== undefined) d.mode = dto.mode;
  if (dto.accent !== undefined) d.accent = dto.accent;
  if (dto.isFeatured !== undefined) d.isFeatured = dto.isFeatured;
  if (dto.zone !== undefined) d.zone = dto.zone || null;
  if (dto.sortOrder !== undefined) d.sortOrder = dto.sortOrder;
  if (dto.isActive !== undefined) d.isActive = dto.isActive;

  /* The screen sends taka; the database stores paisa, like every other money
     column in this system. Converted at the boundary, once, so nothing further
     in has to remember which unit it is holding. */
  if (dto.minPaisa !== undefined) d.minPaisa = dto.minPaisa ?? null;
  if (dto.maxPaisa !== undefined) d.maxPaisa = dto.maxPaisa ?? null;
  return d;
}

@Controller('collections')
export class CollectionsController {
  constructor(private readonly svc: CollectionsService) {}

  @Get()
  list() {
    return this.svc.list();
  }
  @Post()
  create(@Body() dto: CollectionDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CollectionDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}

@Module({
  providers: [CollectionsService],
  controllers: [CollectionsController],
})
export class CollectionsModule {}
