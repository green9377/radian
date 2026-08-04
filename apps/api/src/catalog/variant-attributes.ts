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
  Variant template master (locked).
  Colour / Flavour / Size / Weight defined once here; the product editor just
  picks from these instead of typing values every time.
*/
interface AttrDto { name: string; displayMode?: string; sortOrder?: number; isActive?: boolean; actorName?: string; }
interface ValueDto { label: string; swatch?: string | null; imageUrl?: string | null; sortOrder?: number; isActive?: boolean; }

@Injectable()
export class VariantAttributesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.db.variantAttribute.findMany({
      where: { deletedAt: null },
      include: { values: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
  }
  async createAttr(dto: AttrDto) {
    const a = await this.prisma.db.variantAttribute.create({
      data: { name: dto.name, displayMode: dto.displayMode ?? 'SWATCH', sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true },
      include: { values: { orderBy: { sortOrder: 'asc' } } },
    });
    await this.log(a.id, 'CREATE', dto.actorName, `Variant attribute "${a.name}" created`);
    return a;
  }
  async updateAttr(id: string, dto: Partial<AttrDto>) {
    await this.ensure(id);
    return this.prisma.db.variantAttribute.update({ where: { id }, data: { name: dto.name, sortOrder: dto.sortOrder, isActive: dto.isActive } });
  }
  async removeAttr(id: string, actorName = 'Admin') {
    await this.ensure(id);
    await this.prisma.db.variantAttribute.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log(id, 'DELETE', actorName, 'Variant attribute deleted (soft)');
    return { id, deleted: true };
  }

  /**
   * Save the value list for an attribute.
   *
   * ⚠️ REWRITTEN 31 Jul 2026, AND THE OLD VERSION MUST NOT COME BACK.
   *
   * It used to be `deleteMany` + `createMany` — throw the list away, write it
   * again. Harmless while nothing pointed at these rows. From today products
   * do (`Product.variantValueId`, D-CAT-01), and that FK is ON DELETE SET
   * NULL, so the old version would have quietly cleared the colour off every
   * product in the shop the first time somebody renamed a swatch. Nothing
   * would have errored; the colour grids would just have emptied.
   *
   * So: match on label, update what is there, add what is new, and for a value
   * that has been taken off the list —
   *   · nothing uses it        → delete it, as before
   *   · products are filed under it → keep the row and switch it off. It stops
   *     being offered, the products keep their colour, and the owner can put
   *     it back. Deleting it would silently unpaint them.
   */
  async setValues(attributeId: string, values: ValueDto[]) {
    await this.ensure(attributeId);
    const existing = await this.prisma.db.variantValue.findMany({ where: { attributeId } });
    const byLabel = new Map(existing.map((v) => [v.label.trim().toLowerCase(), v]));
    const kept = new Set<string>();

    for (const [i, v] of values.entries()) {
      const key = v.label.trim().toLowerCase();
      const found = byLabel.get(key);
      const data = {
        label: v.label.trim(),
        swatch: v.swatch || null,
        imageUrl: v.imageUrl || null,
        sortOrder: v.sortOrder ?? i,
        isActive: v.isActive ?? true,
      };
      if (found) {
        kept.add(found.id);
        await this.prisma.db.variantValue.update({ where: { id: found.id }, data });
      } else {
        const created = await this.prisma.db.variantValue.create({ data: { attributeId, ...data } });
        kept.add(created.id);
      }
    }

    for (const old of existing) {
      if (kept.has(old.id)) continue;
      const inUse = await this.prisma.db.product.count({ where: { variantValueId: old.id } });
      if (inUse > 0) {
        await this.prisma.db.variantValue.update({ where: { id: old.id }, data: { isActive: false } });
      } else {
        await this.prisma.db.variantValue.delete({ where: { id: old.id } });
      }
    }

    return this.prisma.db.variantAttribute.findFirst({
      where: { id: attributeId },
      include: { values: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  private async ensure(id: string) {
    const r = await this.prisma.db.variantAttribute.findFirst({ where: { id }, select: { id: true } });
    if (!r) throw new NotFoundException('VariantAttribute not found');
  }
  private async log(id: string, action: 'CREATE' | 'UPDATE' | 'DELETE', actorName = 'Admin', label: string) {
    await this.audit.record({ entityType: 'VariantAttribute', entityId: id, action, actorName });
    await this.audit.event({ entityType: 'VariantAttribute', entityId: id, kind: 'general', label, actorName });
  }
}

@Controller('variant-attributes')
export class VariantAttributesController {
  constructor(private readonly svc: VariantAttributesService) {}
  @Get() list() { return this.svc.list(); }
  @Post() create(@Body() dto: AttrDto, @Headers('x-actor-name') a?: string) { return this.svc.createAttr({ ...dto, actorName: dto.actorName ?? a }); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: Partial<AttrDto>) { return this.svc.updateAttr(id, dto); }
  @Delete(':id') remove(@Param('id') id: string, @Headers('x-actor-name') a?: string) { return this.svc.removeAttr(id, a ?? 'Admin'); }
  @Post(':id/values') setValues(@Param('id') id: string, @Body() body: { values: ValueDto[] }) { return this.svc.setValues(id, body.values ?? []); }
}

@Module({ providers: [VariantAttributesService], controllers: [VariantAttributesController] })
export class VariantAttributesModule {}
