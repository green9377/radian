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
