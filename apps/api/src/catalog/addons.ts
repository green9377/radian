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
import { AddOnRuleField, DiscountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

/*
  Add-ons (locked, DEC-PRD-007).
  An add-on is its own small thing — never a product on the website, never sold
  on its own, always additive (৳500 bouquet + ৳50 card = ৳550).
  One add-on can sit in many groups (AddOnGroupItem = m2m); one product can
  match many rules (values = OR list) and the matched groups stack up.
*/

interface AddOnDto {
  name: string;
  sku?: string | null;
  imageUrl?: string | null;
  pricePaisa: number;
  discountType?: DiscountType;
  discountValue?: number;
  stockQty?: number | null; // null = unlimited
  /** DEC-PRD-039 — the stockroom Item that counts this add-on. null = by hand. */
  itemId?: string | null;
  isActive?: boolean;
  actorName?: string;
}
interface GroupDto {
  name: string;
  sortOrder?: number;
  actorName?: string;
}
interface RuleDto {
  field: AddOnRuleField;
  values: string[];
  groupId: string;
  isActive?: boolean;
  actorName?: string;
}

@Injectable()
export class AddOnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** everything the admin screen needs in one call */
  async all() {
    const [addons, groups, rules] = await Promise.all([
      this.prisma.db.addOn.findMany({
        where: { deletedAt: null },
        include: { groupLinks: { select: { groupId: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.addOnGroup.findMany({
        where: { deletedAt: null },
        include: { items: { orderBy: { sortOrder: 'asc' }, select: { addOnId: true } } },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.db.addOnRule.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      addons: addons.map((a) => ({ ...a, groupIds: a.groupLinks.map((g) => g.groupId) })),
      groups: groups.map((g) => ({ id: g.id, name: g.name, sortOrder: g.sortOrder, addonIds: g.items.map((i) => i.addOnId) })),
      rules,
    };
  }

  /* -------- add-on -------- */
  async createAddon(dto: AddOnDto) {
    const a = await this.prisma.db.addOn.create({
      data: {
        name: dto.name,
        sku: dto.sku || null,
        imageUrl: dto.imageUrl || null,
        pricePaisa: dto.pricePaisa,
        discountType: dto.discountType ?? DiscountType.NONE,
        discountValue: dto.discountValue ?? 0,
        stockQty: dto.stockQty ?? null,
        itemId: dto.itemId?.trim() ? dto.itemId : null,
        isActive: dto.isActive ?? true,
      },
    });
    await this.log('AddOn', a.id, 'CREATE', dto.actorName, `Add-on "${a.name}" created`);
    return a;
  }
  async updateAddon(id: string, dto: Partial<AddOnDto>) {
    await this.ensure('addOn', id);
    const a = await this.prisma.db.addOn.update({
      where: { id },
      data: {
        name: dto.name,
        sku: dto.sku === undefined ? undefined : dto.sku || null,
        imageUrl: dto.imageUrl,
        pricePaisa: dto.pricePaisa,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        stockQty: dto.stockQty === undefined ? undefined : dto.stockQty,
        /*  DEC-PRD-039 — empty string means "unlink", not "leave alone".  */
        itemId: dto.itemId === undefined ? undefined : dto.itemId?.trim() || null,
        isActive: dto.isActive,
      },
    });
    return a;
  }
  async removeAddon(id: string, actorName = 'Admin') {
    await this.ensure('addOn', id);
    // leaving every group it sits in is automatic — the join rows cascade
    await this.prisma.db.addOnGroupItem.deleteMany({ where: { addOnId: id } });
    await this.prisma.db.addOn.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log('AddOn', id, 'DELETE', actorName, 'Add-on deleted (soft)');
    return { id, deleted: true };
  }

  /* -------- recovery · DEC-PRD-041 --------
     Owner, 9 Aug 2026: *"add-on trash-e jabe and permanent delete and restore
     jeno thake."* Products have had this since the start; add-ons were
     soft-deleted with no way back but the database. */
  async trash() {
    /*  ⚠️ `this.prisma`, NOT `this.prisma.db` — the extended client bolts
        `deletedAt: null` onto every query, so the bin came back empty no
        matter what was in it (caught live, 9 Aug 2026). The product trash
        already uses the raw client for exactly this reason.  */
    const rows = await this.prisma.addOn.findMany({
      where: { NOT: { deletedAt: null } },
      orderBy: { deletedAt: 'desc' },
      take: 200,
    });
    return { items: rows, total: rows.length };
  }

  async restoreAddon(id: string, actorName = 'Admin') {
    //  raw client — the row we are looking for IS deleted (see trash())
    const row = await this.prisma.addOn.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Add-on not found');
    /*  ⚠️ The SKU is unique. If it was reused while this one sat in the bin,
        say so instead of failing on a database constraint nobody can read.  */
    if (row.sku) {
      const clash = await this.prisma.addOn.findFirst({
        where: { sku: row.sku, deletedAt: null, NOT: { id } },
        select: { name: true },
      });
      if (clash) {
        throw new BadRequestException(
          `SKU "${row.sku}" is now used by "${clash.name}". Change that one first, or give this a new code.`,
        );
      }
    }
    const back = await this.prisma.addOn.update({ where: { id }, data: { deletedAt: null } });
    await this.log('AddOn', id, 'UPDATE', actorName, `Add-on "${back.name}" restored`);
    return back;
  }

  /** permanent — only from the bin, and only when no order ever sold it */
  async purgeAddon(id: string, actorName = 'Admin') {
    const row = await this.prisma.addOn.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Add-on not found');
    if (!row.deletedAt) {
      throw new BadRequestException('Delete it first — permanent removal only works from the bin.');
    }
    /*  DEC-SAL-002 — an order line keeps the add-on ids it sold. Destroying
        the row would leave yesterday's receipt pointing at nothing, so a
        sold add-on stays recoverable for ever.  */
    const sold = await this.prisma.orderLine.findFirst({
      where: { addonIds: { has: id } },
      select: { id: true },
    });
    if (sold) {
      throw new BadRequestException(
        'This add-on has been sold, so it cannot be destroyed — the old receipts point at it. It stays in the bin.',
      );
    }
    await this.prisma.addOnGroupItem.deleteMany({ where: { addOnId: id } });
    await this.prisma.addOn.delete({ where: { id } });
    await this.log('AddOn', id, 'DELETE', actorName, `Add-on "${row.name}" destroyed`);
    return { id, purged: true };
  }

  /* -------- bulk · DEC-PRD-042 --------
     Owner, 9 Aug 2026: *"bulk kra jay se system kro."* A group of ten thousand
     cannot be edited one card at a time. One endpoint, one action, one list of
     ids — so an accidental "all" is one undo, not ten thousand. */
  async bulk(dto: {
    ids: string[];
    action: 'ACTIVATE' | 'DEACTIVATE' | 'DELETE' | 'DISCOUNT' | 'ADD_TO_GROUP' | 'REMOVE_FROM_GROUP';
    discountType?: DiscountType;
    discountValue?: number;
    groupId?: string;
    actorName?: string;
  }) {
    const ids = [...new Set(dto.ids ?? [])].filter(Boolean);
    if (ids.length === 0) throw new BadRequestException('pick at least one add-on');

    switch (dto.action) {
      case 'ACTIVATE':
      case 'DEACTIVATE': {
        const r = await this.prisma.db.addOn.updateMany({
          where: { id: { in: ids } },
          data: { isActive: dto.action === 'ACTIVATE' },
        });
        await this.log('AddOn', ids[0], 'UPDATE', dto.actorName, `${r.count} add-ons ${dto.action.toLowerCase()}d`);
        return { changed: r.count };
      }
      case 'DELETE': {
        await this.prisma.db.addOnGroupItem.deleteMany({ where: { addOnId: { in: ids } } });
        const r = await this.prisma.db.addOn.updateMany({
          where: { id: { in: ids } },
          data: { deletedAt: new Date() },
        });
        await this.log('AddOn', ids[0], 'DELETE', dto.actorName, `${r.count} add-ons moved to the bin`);
        return { changed: r.count };
      }
      case 'DISCOUNT': {
        const type = dto.discountType ?? DiscountType.NONE;
        const value = type === DiscountType.NONE ? 0 : (dto.discountValue ?? 0);
        if (type !== DiscountType.NONE && value <= 0) {
          throw new BadRequestException('a discount needs a value above zero');
        }
        if (type === DiscountType.PERCENT && value >= 100) {
          throw new BadRequestException('a percentage discount has to be under 100%');
        }
        const r = await this.prisma.db.addOn.updateMany({
          where: { id: { in: ids } },
          data: { discountType: type, discountValue: value },
        });
        await this.log('AddOn', ids[0], 'UPDATE', dto.actorName, `${r.count} add-ons repriced`);
        return { changed: r.count };
      }
      case 'ADD_TO_GROUP': {
        if (!dto.groupId) throw new BadRequestException('groupId is required');
        await this.prisma.db.addOnGroupItem.createMany({
          data: ids.map((addOnId) => ({ groupId: dto.groupId!, addOnId })),
          skipDuplicates: true,
        });
        await this.log('AddOnGroup', dto.groupId, 'UPDATE', dto.actorName, `${ids.length} add-ons added to the group`);
        return { changed: ids.length };
      }
      case 'REMOVE_FROM_GROUP': {
        if (!dto.groupId) throw new BadRequestException('groupId is required');
        const r = await this.prisma.db.addOnGroupItem.deleteMany({
          where: { groupId: dto.groupId, addOnId: { in: ids } },
        });
        await this.log('AddOnGroup', dto.groupId, 'UPDATE', dto.actorName, `${r.count} add-ons removed from the group`);
        return { changed: r.count };
      }
      default:
        throw new BadRequestException('unknown action');
    }
  }

  /* -------- what actually sold · DEC-PRD-043 --------
     Owner, 9 Aug 2026: *"add-on sell-er jeno hisab thake."* The order line
     already records which add-ons it carried (`addonIds`); nothing ever read
     it back. Delivered lines only — an order that never arrived is not a sale. */
  async sales(days = 30) {
    const from = new Date(Date.now() - days * 86400000);
    const lines = await this.prisma.db.orderLine.findMany({
      where: {
        deletedAt: null,
        createdAt: { gte: from },
        /*  DEC-SAL-003 — two status tracks; delivery owns 'did it arrive'.  */
        order: { deliveryStatus: 'delivered', deletedAt: null },
      },
      select: { addonIds: true, qty: true },
    });
    const units = new Map<string, number>();
    for (const l of lines) {
      for (const id of l.addonIds) units.set(id, (units.get(id) ?? 0) + l.qty);
    }
    const rows = await this.prisma.db.addOn.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, sku: true, pricePaisa: true, discountType: true, discountValue: true },
    });
    const items = rows.map((a) => {
      const sold = units.get(a.id) ?? 0;
      const paid =
        a.discountType === DiscountType.PERCENT
          ? Math.max(0, Math.round(a.pricePaisa * (1 - a.discountValue / 10000)))
          : a.discountType === DiscountType.FLAT
            ? Math.max(0, a.pricePaisa - a.discountValue)
            : a.pricePaisa;
      return { addOnId: a.id, name: a.name, sku: a.sku, units: sold, revenuePaisa: sold * paid };
    });
    items.sort((x, y) => y.units - x.units || y.revenuePaisa - x.revenuePaisa);
    return {
      days,
      totals: {
        units: items.reduce((n, i) => n + i.units, 0),
        revenuePaisa: items.reduce((n, i) => n + i.revenuePaisa, 0),
      },
      items,
    };
  }

  /* -------- group -------- */
  async createGroup(dto: GroupDto) {
    const g = await this.prisma.db.addOnGroup.create({ data: { name: dto.name, sortOrder: dto.sortOrder ?? 0 } });
    await this.log('AddOnGroup', g.id, 'CREATE', dto.actorName, `Group "${g.name}" created`);
    return g;
  }
  async updateGroup(id: string, dto: Partial<GroupDto>) {
    await this.ensure('addOnGroup', id);
    return this.prisma.db.addOnGroup.update({ where: { id }, data: { name: dto.name, sortOrder: dto.sortOrder } });
  }
  async removeGroup(id: string, actorName = 'Admin') {
    await this.ensure('addOnGroup', id);
    // group takes its rules and membership with it
    await this.prisma.db.addOnRule.deleteMany({ where: { groupId: id } });
    await this.prisma.db.addOnGroupItem.deleteMany({ where: { groupId: id } });
    await this.prisma.db.addOnGroup.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log('AddOnGroup', id, 'DELETE', actorName, 'Group deleted (soft)');
    return { id, deleted: true };
  }

  /** replace a group's members in one shot (the admin ticks a multi-select) */
  async setGroupItems(groupId: string, addOnIds: string[]) {
    await this.ensure('addOnGroup', groupId);
    await this.prisma.db.addOnGroupItem.deleteMany({ where: { groupId } });
    await this.prisma.db.addOnGroupItem.createMany({
      data: addOnIds.map((addOnId, i) => ({ groupId, addOnId, sortOrder: i })),
      skipDuplicates: true,
    });
    return { groupId, count: addOnIds.length };
  }

  /* -------- rule -------- */
  async createRule(dto: RuleDto) {
    const r = await this.prisma.db.addOnRule.create({
      data: { field: dto.field, values: dto.values ?? [], groupId: dto.groupId, isActive: dto.isActive ?? true },
    });
    await this.log('AddOnRule', r.id, 'CREATE', dto.actorName, 'Add-on rule created');
    return r;
  }
  async updateRule(id: string, dto: Partial<RuleDto>) {
    await this.ensure('addOnRule', id);
    return this.prisma.db.addOnRule.update({
      where: { id },
      data: { field: dto.field, values: dto.values, groupId: dto.groupId, isActive: dto.isActive },
    });
  }
  async removeRule(id: string, actorName = 'Admin') {
    await this.ensure('addOnRule', id);
    await this.prisma.db.addOnRule.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log('AddOnRule', id, 'DELETE', actorName, 'Add-on rule deleted (soft)');
    return { id, deleted: true };
  }

  private async ensure(model: 'addOn' | 'addOnGroup' | 'addOnRule', id: string) {
    const row =
      model === 'addOn'
        ? await this.prisma.db.addOn.findFirst({ where: { id }, select: { id: true } })
        : model === 'addOnGroup'
          ? await this.prisma.db.addOnGroup.findFirst({ where: { id }, select: { id: true } })
          : await this.prisma.db.addOnRule.findFirst({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException(`${model} not found`);
  }
  private async log(entityType: string, entityId: string, action: 'CREATE' | 'UPDATE' | 'DELETE', actorName = 'Admin', label: string) {
    await this.audit.record({ entityType, entityId, action, actorName });
    await this.audit.event({ entityType, entityId, kind: 'general', label, actorName });
  }
}

@Controller('addons')
export class AddOnsController {
  constructor(private readonly svc: AddOnsService) {}

  @Get() all() { return this.svc.all(); }
  /*  ⚠️ Static paths BEFORE ':id', or Nest reads "trash" as an add-on id.  */
  @Get('trash') trash() { return this.svc.trash(); }
  @Get('sales') sales(@Query('days') days?: string) { return this.svc.sales(parseInt(days ?? '30', 10) || 30); }
  @Post('bulk') bulk(@Body() dto: Parameters<AddOnsService['bulk']>[0], @Headers('x-actor-name') a?: string) {
    return this.svc.bulk({ ...dto, actorName: dto.actorName ?? a });
  }
  @Post(':id/restore') restore(@Param('id') id: string, @Headers('x-actor-name') a?: string) { return this.svc.restoreAddon(id, a ?? 'Admin'); }
  @Delete(':id/purge') purge(@Param('id') id: string, @Headers('x-actor-name') a?: string) { return this.svc.purgeAddon(id, a ?? 'Admin'); }

  @Post() createAddon(@Body() dto: AddOnDto, @Headers('x-actor-name') a?: string) { return this.svc.createAddon({ ...dto, actorName: dto.actorName ?? a }); }
  @Patch(':id') updateAddon(@Param('id') id: string, @Body() dto: Partial<AddOnDto>) { return this.svc.updateAddon(id, dto); }
  @Delete(':id') removeAddon(@Param('id') id: string, @Headers('x-actor-name') a?: string) { return this.svc.removeAddon(id, a ?? 'Admin'); }

  @Post('groups') createGroup(@Body() dto: GroupDto, @Headers('x-actor-name') a?: string) { return this.svc.createGroup({ ...dto, actorName: dto.actorName ?? a }); }
  @Patch('groups/:id') updateGroup(@Param('id') id: string, @Body() dto: Partial<GroupDto>) { return this.svc.updateGroup(id, dto); }
  @Delete('groups/:id') removeGroup(@Param('id') id: string, @Headers('x-actor-name') a?: string) { return this.svc.removeGroup(id, a ?? 'Admin'); }
  @Post('groups/:id/items') setItems(@Param('id') id: string, @Body() body: { addOnIds: string[] }) { return this.svc.setGroupItems(id, body.addOnIds ?? []); }

  @Post('rules') createRule(@Body() dto: RuleDto, @Headers('x-actor-name') a?: string) { return this.svc.createRule({ ...dto, actorName: dto.actorName ?? a }); }
  @Patch('rules/:id') updateRule(@Param('id') id: string, @Body() dto: Partial<RuleDto>) { return this.svc.updateRule(id, dto); }
  @Delete('rules/:id') removeRule(@Param('id') id: string, @Headers('x-actor-name') a?: string) { return this.svc.removeRule(id, a ?? 'Admin'); }
}

@Module({ providers: [AddOnsService], controllers: [AddOnsController] })
export class AddOnsModule {}
