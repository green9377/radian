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
import { findBuried } from '../common/revive-buried';

/*
  Unit master (DEC-PRD-009, owner's final call 21 Jul, sobuj).

  A unit knows what SMALLER unit it breaks down into:

    Papri       base                        (baseUnitId null, baseQty 1)
    Lily Stick  base Papri,  baseQty 4
    Lily Bunch  base Stick,  baseQty 10   → resolves to 40 Papri
    Gram        base  ·  Kg  base Gram, baseQty 1000

  Chains are allowed. Every row is returned with `rootUnitCode` + `rootFactor` already
  resolved, so Item, Sales and Purchase never multiply by hand.

  ⚠ Trade-off the owner accepted: this is only correct when the NAME is specific
  ("Lily Stick", not "Stick") — a gypsy stick is 2 papri, not 4. So the list grows with
  the catalogue and someone must remember to add "Gypsy Stick". The screen mitigates
  with a Duplicate action and a generic-name warning; nothing can fully prevent an
  operator picking the wrong unit, because a unit is not tied to a flower.
*/

interface UnitDto {
  name: string;
  shortCode: string;
  baseUnitId?: string | null;
  baseQty?: number;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

const ENTITY = 'Unit';
const MAX_CHAIN = 10; // depth guard — a real chain is 2-3 deep

/** "Lily Stick" → "lilystick"; shortCode is machine-ish */
function normCode(v: string): string {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
}

const USAGE_COUNT = {
  products: { where: { deletedAt: null } }, // Product.unitId
  items: { where: { deletedAt: null } }, // Item.unitId — REQUIRED (DEC-ITM-006)
  itemLines: { where: { deletedAt: null } }, // ItemComponent.unitId — recipe lines
  derivedUnits: { where: { deletedAt: null } }, // units that break down INTO this
} as const;

type Row = {
  id: string;
  name: string;
  shortCode: string;
  baseUnitId: string | null;
  baseQty: number;
};

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: { search?: string }) {
    const where: Prisma.UnitWhereInput = {};
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { shortCode: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.db.unit.findMany({
      where,
      include: {
        baseUnit: { select: { id: true, name: true, shortCode: true } },
        _count: { select: USAGE_COUNT },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const all = await this.allRows(); // one cheap read resolves every chain
    return rows.map((r) => ({ ...r, ...this.resolveRoot(r.id, all) }));
  }

  async findOne(id: string) {
    const u = await this.prisma.db.unit.findFirst({
      where: { id },
      include: {
        baseUnit: { select: { id: true, name: true, shortCode: true } },
        _count: { select: USAGE_COUNT },
      },
    });
    if (!u) throw new NotFoundException('Unit not found');
    return { ...u, ...this.resolveRoot(u.id, await this.allRows()) };
  }

  /* Everything still pointing at this unit, so the admin can GO and move it instead of
     just being told "3 items are using this". Read-only across module boundaries —
     reassignment happens through each owning module's own PATCH. */
  async usage(id: string) {
    const unit = await this.prisma.db.unit.findFirst({
      where: { id },
      select: { id: true, name: true },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    const [items, products, itemLines, derivedUnits] = await Promise.all([
      this.prisma.db.item.findMany({
        where: { unitId: id },
        select: { id: true, sku: true, name: true, itemType: true },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      this.prisma.db.product.findMany({
        where: { unitId: id },
        select: { id: true, slug: true, sku: true, name: true, isPublished: true },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      this.prisma.db.itemComponent.findMany({
        where: { unitId: id },
        select: {
          id: true,
          qtyMilli: true,
          parentItem: { select: { id: true, name: true, sku: true } },
          componentItem: { select: { id: true, name: true, sku: true } },
        },
        take: 500,
      }),
      this.prisma.db.unit.findMany({
        where: { baseUnitId: id },
        select: { id: true, name: true, shortCode: true, baseQty: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { unit, items, products, itemLines, derivedUnits };
  }

  async create(dto: UnitDto) {
    const name = (dto.name ?? '').trim();
    const shortCode = normCode(dto.shortCode ?? dto.name ?? '');
    if (!name) throw new BadRequestException('name is required');
    if (!shortCode) throw new BadRequestException('shortCode is required');
    await this.ensureFree({ name, shortCode });

    const baseUnitId = dto.baseUnitId || null;
    const baseQty = baseUnitId ? (dto.baseQty ?? 1) : 1; // a base unit is always 1
    this.validateQty(baseUnitId, baseQty);
    if (baseUnitId) await this.ensureExists(baseUnitId, 'baseUnitId not found');

    /*  name and shortCode are @unique across soft-deleted rows too — bring the
        buried unit back rather than dying on the constraint (revive-buried.ts)  */
    const buried =
      (await findBuried(this.prisma.unit, { name: { equals: name, mode: 'insensitive' } })) ??
      (await findBuried(this.prisma.unit, { shortCode }));
    if (buried) {
      await this.prisma.unit.update({
        where: { id: buried.id },
        data: { deletedAt: null, name, shortCode, baseUnitId, baseQty, isActive: dto.isActive ?? true },
      });
      await this.log(buried.id, 'UPDATE', dto.actorName, `Unit "${name}" (${shortCode}) restored`);
      return this.findOne(buried.id);
    }

    const u = await this.prisma.db.unit.create({
      data: {
        name,
        shortCode,
        baseUnitId,
        baseQty,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.log(
      u.id,
      'CREATE',
      dto.actorName,
      `Unit "${u.name}" (${u.shortCode}) created` +
        (baseUnitId ? ` — 1 = ${baseQty} of its base` : ' — base unit'),
    );
    return this.findOne(u.id);
  }

  async update(id: string, dto: Partial<UnitDto>) {
    const before = await this.prisma.db.unit.findFirst({ where: { id } });
    if (!before) throw new NotFoundException('Unit not found');

    const name = dto.name === undefined ? undefined : dto.name.trim();
    const shortCode = dto.shortCode === undefined ? undefined : normCode(dto.shortCode);
    if (dto.name !== undefined && !name) throw new BadRequestException('name cannot be empty');
    if (dto.shortCode !== undefined && !shortCode)
      throw new BadRequestException('shortCode cannot be empty');
    await this.ensureFree({ name, shortCode }, id);

    const baseUnitId = dto.baseUnitId === undefined ? before.baseUnitId : dto.baseUnitId || null;
    const baseQty = baseUnitId ? (dto.baseQty ?? before.baseQty) : 1;
    this.validateQty(baseUnitId, baseQty);
    if (baseUnitId && baseUnitId !== before.baseUnitId) {
      await this.ensureExists(baseUnitId, 'baseUnitId not found');
      await this.ensureNoCycle(id, baseUnitId);
    }

    const u = await this.prisma.db.unit.update({
      where: { id },
      data: {
        name,
        shortCode,
        baseUnitId,
        baseQty,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });

    // a factor change re-reads every stock figure counted in this unit — say so loudly
    if (baseQty !== before.baseQty || baseUnitId !== before.baseUnitId) {
      await this.log(
        id,
        'UPDATE',
        dto.actorName,
        `⚠ Conversion changed for "${u.name}": 1 = ${before.baseQty} → ${baseQty}. Stock counted in this unit now reads differently.`,
      );
    } else {
      await this.log(id, 'UPDATE', dto.actorName, `Unit "${u.name}" updated`);
    }
    return this.findOne(id);
  }

  // Four ways something can depend on a unit — each blocks the delete with its own
  // message, so the admin knows exactly what to fix.
  async remove(id: string, actorName = 'Admin') {
    const u = await this.prisma.db.unit.findFirst({
      where: { id },
      include: { _count: { select: USAGE_COUNT } },
    });
    if (!u) throw new NotFoundException('Unit not found');
    const c = u._count;
    const s = (n: number) => (n === 1 ? '' : 's');

    if (c.derivedUnits > 0) {
      throw new BadRequestException(
        `${c.derivedUnits} other unit${s(c.derivedUnits)} break${c.derivedUnits === 1 ? 's' : ''} down into "${u.name}". Re-point them first.`,
      );
    }
    if (c.items > 0) {
      throw new BadRequestException(
        `"${u.name}" is the unit for ${c.items} item${s(c.items)}. Change their unit first.`,
      );
    }
    // recipe lines carry their OWN unit (ItemComponent.unitId, DEC-ITM-003). Without
    // this guard a unit could be soft-deleted while recipe lines still pointed at it,
    // leaving a dangling FK that only surfaced later, at read time.
    if (c.itemLines > 0) {
      throw new BadRequestException(
        `"${u.name}" is used on ${c.itemLines} recipe line${s(c.itemLines)} inside item compositions. Change those lines first.`,
      );
    }
    if (c.products > 0) {
      throw new BadRequestException(
        `"${u.name}" is still used by ${c.products} product${s(c.products)}. Move them to another unit first.`,
      );
    }

    await this.prisma.db.unit.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.log(id, 'DELETE', actorName, `Unit "${u.name}" deleted (soft)`);
    return { id, deleted: true };
  }

  /* ---------------- helpers ---------------- */

  private allRows(): Promise<Row[]> {
    return this.prisma.db.unit.findMany({
      select: { id: true, name: true, shortCode: true, baseUnitId: true, baseQty: true },
    });
  }

  /** walk the chain down to the base: Bunch → 10 Stick → 4 Papri  ⇒  40 papri */
  private resolveRoot(id: string, all: Row[]) {
    const byId = new Map(all.map((r) => [r.id, r]));
    let cur = byId.get(id);
    let factor = 1;
    let depth = 0;
    while (cur?.baseUnitId && depth < MAX_CHAIN) {
      factor *= cur.baseQty;
      cur = byId.get(cur.baseUnitId);
      depth++;
    }
    // A loop that slipped past the guard, or an absurdly deep chain. Return null rather
    // than a number we cannot stand behind — a silently wrong factor corrupts stock.
    const chainBroken = depth >= MAX_CHAIN;
    return {
      rootUnitId: cur?.id ?? id,
      rootUnitName: cur?.name ?? null,
      rootUnitCode: cur?.shortCode ?? null,
      /** 1 of this unit = rootFactor of the base unit */
      rootFactor: chainBroken ? null : factor,
      chainDepth: depth,
      chainBroken,
    };
  }

  private async ensureExists(id: string, msg = 'Unit not found') {
    const u = await this.prisma.db.unit.findFirst({ where: { id }, select: { id: true } });
    if (!u) throw new BadRequestException(msg);
  }

  /** A → B → A would make the chain walk never terminate */
  private async ensureNoCycle(id: string, baseUnitId: string) {
    if (id === baseUnitId) throw new BadRequestException('A unit cannot break down into itself');
    const all = await this.allRows();
    const byId = new Map(all.map((r) => [r.id, r]));
    let cur = byId.get(baseUnitId);
    let depth = 0;
    while (cur && depth < MAX_CHAIN) {
      if (cur.id === id) {
        throw new BadRequestException(
          'That would make a loop — this unit is already somewhere below the one you picked.',
        );
      }
      if (!cur.baseUnitId) return;
      cur = byId.get(cur.baseUnitId);
      depth++;
    }
    if (depth >= MAX_CHAIN) throw new BadRequestException('That conversion chain is too deep');
  }

  private validateQty(baseUnitId: string | null, baseQty: number) {
    if (!baseUnitId) return; // base unit — forced to 1
    if (!Number.isInteger(baseQty) || baseQty < 1) {
      throw new BadRequestException(
        'How many must be a whole number of 1 or more — if you need a fraction, make the smaller unit the base instead',
      );
    }
  }

  private async ensureFree(v: { name?: string; shortCode?: string }, exceptId?: string) {
    if (v.name) {
      const dupe = await this.prisma.db.unit.findFirst({
        where: { name: { equals: v.name, mode: 'insensitive' } },
        select: { id: true },
      });
      if (dupe && dupe.id !== exceptId)
        throw new BadRequestException(`A unit called "${v.name}" already exists`);
    }
    if (v.shortCode) {
      const dupe = await this.prisma.db.unit.findFirst({
        where: { shortCode: v.shortCode },
        select: { id: true },
      });
      if (dupe && dupe.id !== exceptId)
        throw new BadRequestException(`Short code "${v.shortCode}" is already in use`);
    }
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

@Controller('units')
export class UnitsController {
  constructor(private readonly svc: UnitsService) {}

  @Get()
  list(@Query('search') search?: string) {
    return this.svc.list({ search });
  }
  @Get(':id/usage')
  usage(@Param('id') id: string) {
    return this.svc.usage(id);
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }
  @Post()
  create(@Body() dto: UnitDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<UnitDto>,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}

@Module({
  providers: [UnitsService],
  controllers: [UnitsController],
})
export class UnitsModule {}
