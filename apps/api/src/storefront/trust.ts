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
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

/*
  Trust strip admin — the row under the hero.

  Owner's correction, 30 Jul 2026. The homepage audit first filed these as
  "fixed text, no admin needed" and he overruled it. He was right: "2-Hour
  Delivery" and "Freshness Promise" are the shop's largest claims, they differ
  by zone, and they change the day a payment method or a delivery promise
  changes. The public read lives in `shop.ts`.
*/

const ENTITY = 'TrustBadge';

export interface TrustDto {
  icon?: string | null;
  iconUrl?: string | null;
  title?: string;
  subtitle?: string | null;
  zone?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

@Injectable()
export class TrustService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.db.trustBadge.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.db.trustBadge.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Badge not found');
    return row;
  }

  async create(dto: TrustDto) {
    const row = await this.prisma.db.trustBadge.create({
      data: { ...clean(dto), title: dto.title?.trim() || 'New promise' },
    });
    await this.log(row.id, 'CREATE', dto.actorName, row.title);
    return row;
  }

  async update(id: string, dto: TrustDto) {
    await this.findOne(id);
    const row = await this.prisma.db.trustBadge.update({ where: { id }, data: clean(dto) });
    await this.log(id, 'UPDATE', dto.actorName, row.title);
    return row;
  }

  async remove(id: string, actorName = 'Admin') {
    const row = await this.findOne(id);
    await this.prisma.db.trustBadge.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.log(id, 'DELETE', actorName, row.title);
    return { ok: true };
  }

  private log(id: string, action: 'CREATE' | 'UPDATE' | 'DELETE', actorName = 'Admin', title: string) {
    return this.audit.record({
      entityType: ENTITY,
      entityId: id,
      action,
      actorName,
      changes: { label: title },
    });
  }
}

/**
 * A badge carries a built-in icon OR an uploaded one, never both.
 *
 * Enforced here rather than left to the screen: whichever the caller set last
 * wins, and the other is cleared. Without this, picking from the set after
 * uploading leaves both columns filled, and the renderer's tie-break decides
 * what the owner sees — a rule nobody wrote down and nobody can predict.
 *
 * ⚠️ Returns a PLAIN shape, not `Prisma.…UpdateInput`. The update type also
 * admits operation objects (`{ set: … }`), which makes it unassignable to the
 * create type — so one shared helper cannot be typed as the update input and
 * still be usable by `create()`.
 */
interface TrustFields {
  title?: string;
  subtitle?: string | null;
  zone?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  icon?: string | null;
  iconUrl?: string | null;
}

function clean(dto: TrustDto): TrustFields {
  const d: TrustFields = {};
  if (dto.title !== undefined) d.title = dto.title.trim();
  if (dto.subtitle !== undefined) d.subtitle = dto.subtitle?.trim() || null;
  if (dto.zone !== undefined) d.zone = dto.zone || null;
  if (dto.sortOrder !== undefined) d.sortOrder = dto.sortOrder;
  if (dto.isActive !== undefined) d.isActive = dto.isActive;

  if (dto.iconUrl !== undefined) {
    d.iconUrl = dto.iconUrl || null;
    if (dto.iconUrl) d.icon = null;
  }
  if (dto.icon !== undefined) {
    d.icon = dto.icon || null;
    if (dto.icon) d.iconUrl = null;
  }
  return d;
}

@Controller('trust-badges')
export class TrustController {
  constructor(private readonly svc: TrustService) {}

  @Get()
  list() {
    return this.svc.list();
  }
  @Post()
  create(@Body() dto: TrustDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: TrustDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}

@Module({
  providers: [TrustService],
  controllers: [TrustController],
})
export class TrustModule {}
