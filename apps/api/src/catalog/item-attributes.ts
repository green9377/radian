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
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { claimBuried, stampedName } from '../common/revive-buried';
import { eraseOrBury } from '../common/erase';

/*
  ITEM ATTRIBUTE master — DEC-ITM-015 (rev 21 Jul 2026, sobuj).

  Colour · Size · Grade — but the WAREHOUSE's own, never the storefront's.

  WHY THIS IS NOT `VariantAttribute`:
    VariantAttribute is eCommerce furniture — it drives the option pickers on a product
    page, it carries a display mode (SWATCH / PHOTO / TEXT), and marketing renames its
    values whenever it helps them sell ("Red" → "Passion Red"). The stockroom cannot
    have its labels rewritten by a marketing decision, and the shop floor does not care
    how an option renders on a phone.
    Same word, two different things ⇒ two masters. That is not a One-Data-One-Owner
    violation: the rule is one ENTITY one owner, and these are two entities.

  Shape mirrors the storefront one on purpose (attribute → values, optional swatch) so
  nobody has to learn a second mental model.

  Values are used to tell apart the members of a variant family: the ItemCategory
  "Roses" holds Red Rose / Yellow Rose / White Rose, and the Colour value on each says
  which is which (DEC-ITM-016).
*/

interface AttrDto {
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}
interface ValueDto {
  label: string;
  swatch?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

const ENTITY = 'ItemAttribute';

const withValues = {
  values: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' as const }, { label: 'asc' as const }],
    include: { _count: { select: { items: { where: { deletedAt: null } } } } },
  },
};

@Injectable()
export class ItemAttributesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.db.itemAttribute.findMany({
      include: withValues,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: AttrDto) {
    const name = (dto.name ?? '').trim();
    if (!name) throw new BadRequestException('name is required');
    const dupe = await this.prisma.db.itemAttribute.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (dupe) throw new BadRequestException(`"${name}" already exists.`);

    /*  Same buried-row trap as addValue (revive-buried.ts).  */
    const buried = await claimBuried(
      this.prisma.itemAttribute,
      { name: { equals: name, mode: 'insensitive' } },
      'name',
      name,
    );
    if (buried) {
      const revived = await this.prisma.db.itemAttribute.update({
        where: { id: buried.id },
        data: { deletedAt: null, name, isActive: dto.isActive ?? true },
        include: withValues,
      });
      await this.log(buried.id, 'UPDATE', dto.actorName, `Item attribute "${name}" restored`);
      return revived;
    }

    const a = await this.prisma.db.itemAttribute.create({
      data: { name, sortOrder: dto.sortOrder, isActive: dto.isActive },
      include: withValues,
    });
    await this.log(a.id, 'CREATE', dto.actorName, `Item attribute "${a.name}" created`);
    return a;
  }

  async update(id: string, dto: Partial<AttrDto>) {
    await this.ensure(id);
    const a = await this.prisma.db.itemAttribute.update({
      where: { id },
      data: {
        name: dto.name === undefined ? undefined : dto.name.trim(),
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
      include: withValues,
    });
    await this.log(id, 'UPDATE', dto.actorName, `Item attribute "${a.name}" updated`);
    return a;
  }

  // Blocked while any of its values is still on an item — otherwise those items would
  // silently lose the label that tells them apart (same spirit as ITM-R07).
  async remove(id: string, actorName = 'Admin') {
    const a = await this.prisma.db.itemAttribute.findFirst({
      where: { id },
      include: withValues,
    });
    if (!a) throw new NotFoundException('Item attribute not found');
    const inUse = a.values.reduce((n, v) => n + v._count.items, 0);
    if (inUse > 0) {
      throw new BadRequestException(
        `"${a.name}" is still used by ${inUse} item(s). Remove the label from those items first.`,
      );
    }
    await eraseOrBury(
      () => this.prisma.itemAttribute.delete({ where: { id } }),
      () => this.prisma.db.itemAttribute.update({ where: { id }, data: { deletedAt: new Date() } }),
      'Item Attribute',
    );
    await this.log(id, 'DELETE', actorName, `Item attribute "${a.name}" deleted`);
    return { id, deleted: true };
  }

  /* ---- values ---- */

  async addValue(attributeId: string, dto: ValueDto) {
    await this.ensure(attributeId);
    const label = (dto.label ?? '').trim();
    if (!label) throw new BadRequestException('label is required');
    const dupe = await this.prisma.db.itemAttributeValue.findFirst({
      where: { attributeId, label: { equals: label, mode: 'insensitive' } },
      select: { id: true },
    });
    if (dupe) throw new BadRequestException(`"${label}" is already there.`);

    /*  A removed label is soft-deleted, but @@unique([attributeId, label]) counts
        the dead row too — so adding "Pink" again after removing it used to reach
        create() and come back as a raw 500 (owner, 20 Aug). See revive-buried.ts.  */
    const buried = await claimBuried(
      this.prisma.itemAttributeValue,
      { attributeId, label: { equals: label, mode: 'insensitive' } },
      'label',
      label,
    );
    if (buried) {
      const revived = await this.prisma.itemAttributeValue.update({
        where: { id: buried.id },
        data: {
          deletedAt: null,
          label,
          swatch: dto.swatch ?? null,
          isActive: dto.isActive ?? true,
        },
      });
      await this.log(attributeId, 'UPDATE', dto.actorName, `Restored "${label}"`);
      return revived;
    }

    const count = await this.prisma.db.itemAttributeValue.count({ where: { attributeId } });
    const v = await this.prisma.db.itemAttributeValue.create({
      data: {
        attributeId,
        label,
        swatch: dto.swatch ?? null,
        sortOrder: dto.sortOrder ?? count,
        isActive: dto.isActive,
      },
    });
    await this.log(attributeId, 'UPDATE', dto.actorName, `Added "${label}"`);
    return v;
  }

  async updateValue(valueId: string, dto: Partial<ValueDto>) {
    const v = await this.prisma.db.itemAttributeValue.findFirst({ where: { id: valueId } });
    if (!v) throw new NotFoundException('Value not found');

    /*  renaming hits the same two walls as adding: a LIVE row with that name
        (refuse, in words) and a BURIED one holding it hostage (free it)  */
    const label = dto.label?.trim();
    if (label && label.toLowerCase() !== v.label.toLowerCase()) {
      const live = await this.prisma.db.itemAttributeValue.findFirst({
        where: {
          attributeId: v.attributeId,
          label: { equals: label, mode: 'insensitive' },
          id: { not: valueId },
        },
        select: { id: true },
      });
      if (live) throw new BadRequestException(`"${label}" is already there.`);
      await claimBuried(
        this.prisma.itemAttributeValue,
        { attributeId: v.attributeId, label: { equals: label, mode: 'insensitive' }, id: { not: valueId } },
        'label',
        label,
      ).then(async (buried) => {
        /*  the survivor of the graveyard has to give the name up too — it stays
            readable in history under its stamped name  */
        if (buried) {
          await this.prisma.itemAttributeValue.update({
            where: { id: buried.id },
            data: { label: stampedName(label, buried) },
          });
        }
      });
    }

    const updated = await this.prisma.db.itemAttributeValue.update({
      where: { id: valueId },
      data: {
        label: dto.label === undefined ? undefined : dto.label.trim(),
        swatch: dto.swatch === undefined ? undefined : dto.swatch,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.log(v.attributeId, 'UPDATE', dto.actorName, `Renamed a value to "${updated.label}"`);
    return updated;
  }

  async removeValue(valueId: string, actorName = 'Admin') {
    const v = await this.prisma.db.itemAttributeValue.findFirst({
      where: { id: valueId },
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
    });
    if (!v) throw new NotFoundException('Value not found');
    if (v._count.items > 0) {
      throw new BadRequestException(
        `"${v.label}" is on ${v._count.items} item(s). Remove it from those items first.`,
      );
    }
    await this.prisma.db.itemAttributeValue.update({
      where: { id: valueId },
      data: { deletedAt: new Date() },
    });
    await this.log(v.attributeId, 'UPDATE', actorName, `Removed "${v.label}"`);
    return { id: valueId, deleted: true };
  }

  private async ensure(id: string) {
    const a = await this.prisma.db.itemAttribute.findFirst({ where: { id }, select: { id: true } });
    if (!a) throw new NotFoundException('Item attribute not found');
  }

  private async log(
    id: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    actorName = 'Admin',
    label: string,
  ) {
    await this.audit.record({ entityType: ENTITY, entityId: id, action, actorName });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label, actorName });
  }
}

@Controller('item-attributes')
export class ItemAttributesController {
  constructor(private readonly svc: ItemAttributesService) {}

  @Get()
  list() {
    return this.svc.list();
  }
  @Post()
  create(@Body() dto: AttrDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }

  // ⚠️ static "values" segment must sit above `:id` so Nest does not treat it as an id
  @Patch('values/:valueId')
  updateValue(
    @Param('valueId') valueId: string,
    @Body() dto: Partial<ValueDto>,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.updateValue(valueId, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Delete('values/:valueId')
  removeValue(@Param('valueId') valueId: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.removeValue(valueId, actor ?? 'Admin');
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<AttrDto>,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
  @Post(':id/values')
  addValue(
    @Param('id') id: string,
    @Body() dto: ValueDto,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.addValue(id, { ...dto, actorName: dto.actorName ?? actor });
  }
}

@Module({
  providers: [ItemAttributesService],
  controllers: [ItemAttributesController],
})
export class ItemAttributesModule {}
