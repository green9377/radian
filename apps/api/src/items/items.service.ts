import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ItemType, AssemblyMode, CostMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../common/audit.service';
import { ensureSingleton } from '../common/singleton';

import type {
  ItemDto,
  ItemPatch,
  ComponentDto,
  ComponentPatch,
  ItemListQuery,
  VariantGenerateDto,
} from './item.dto';

/*  The generated client on a machine that has not run BUILD_CHECK.bat yet does not
    know ItemSetting (DEC-ITM-023). Narrow shim, deleted after the next regenerate. */
interface ItemSettingClient {
  itemSetting: {
    findFirst(): Promise<{ defaultMarkupBp: number } | null>;
    create(args: { data: Record<string, never> }): Promise<{ defaultMarkupBp: number }>;
    update(args: {
      where: { id: string };
      data: { defaultMarkupBp: number };
    }): Promise<{ defaultMarkupBp: number }>;
  };
}

/*
  ITEM MANAGEMENT — service layer.
  Full architecture + decision reasoning: RADIAN_ITEM_MODULE_ARCHITECTURE.md (21 Jul 2026).

  Rules enforced here (each cites its decision):
    ITM-R01  only FINISHED items may carry a recipe                      DEC-ITM-003
    ITM-R02  assemblyMode != NONE requires >= 1 component                DEC-ITM-004
    ITM-R03  no cycles — an item can never contain itself, at any depth  DEC-ITM-003
    ITM-R04  SERVICE => isStockTracked false, assemblyMode NONE          DEC-ITM-001
    ITM-R05  costMode AUTO only allowed when a recipe exists             DEC-ITM-008
    ITM-R06  a cost change rolls up to every ancestor                    DEC-ITM-008
    ITM-R07  soft-delete blocked while linked to a Product or a recipe   core_principles
    ITM-R08  Item.sku is THE single SKU in the system                    DEC-ITM-010
    ITM-R09  this module writes NO stock quantity, anywhere              DEC-ITM-005
    ITM-R10  audit + timeline on every write                             core_principles
    ITM-R11  the product generator is idempotent                         DEC-ITM-009
    ITM-R12  a variant family = separate Items, no ghost parent row       DEC-ITM-016
    ITM-R13  SERVICE => always saleable, never purchasable                 owner, 20 Aug
*/

const ENTITY = 'Item';
const MAX_DEPTH = 5; // recipe nesting guard — also bounds the cost roll-up

/** "Red Rose Stem" → "RED-ROSE-STEM" */
function skuFromName(v: string): string {
  return (
    v
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'ITEM'
  );
}

const itemInclude = {
  unit: true,
  // DEC-ITM-015 — the Item module's OWN colour/size labels (not the storefront ones)
  attributeValues: { include: { attribute: { select: { id: true, name: true } } } },
  brand: { select: { id: true, name: true } },
  itemCategory: { select: { id: true, name: true } },
  // DEC-ITM-017 — the owner's own label for the type; behaviour still lives on itemType
  typeRef: { select: { id: true, name: true, behaviour: true, colour: true, isSystem: true } },
  _count: {
    select: {
      products: { where: { deletedAt: null } },
      components: { where: { deletedAt: null } },
      usedIn: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.ItemInclude;

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService, // DEC-ITM-026 unit restatement
  ) {}

  /* ------------------------------------------------------------------ read */

  async list(q: ItemListQuery) {
    const where: Prisma.ItemWhereInput = {};

    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { sku: { contains: q.search, mode: 'insensitive' } },
        { description: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (q.type && q.type !== 'ALL') where.itemType = q.type as ItemType;
    if (q.assembly && q.assembly !== 'ALL') where.assemblyMode = q.assembly as AssemblyMode;
    if (q.groupId) where.itemCategoryId = q.groupId;
    if (q.status === 'active') where.isActive = true;
    if (q.status === 'hidden') where.isActive = false;

    const dir: Prisma.SortOrder = q.dir === 'desc' ? 'desc' : 'asc';
    const orderBy: Prisma.ItemOrderByWithRelationInput =
      q.sort === 'sku'
        ? { sku: dir }
        : q.sort === 'cost'
          ? { standardCostPaisa: dir }
          : q.sort === 'created'
            ? { createdAt: dir }
            : { name: dir };

    const rows = await this.prisma.db.item.findMany({ where, include: itemInclude, orderBy });
    const mk = await this.defaultMarkupBp();
    return rows.map((r) => this.shape(r, mk));
  }

  async findOne(id: string) {
    const item = await this.prisma.db.item.findFirst({
      where: { id },
      include: {
        ...itemInclude,
        components: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: {
            unit: true,
            componentItem: {
              select: {
                id: true,
                sku: true,
                name: true,
                itemType: true,
                costMode: true,
                standardCostPaisa: true,
                computedCostPaisa: true,
                unit: true,
              },
            },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Item not found');
    return this.shape(item, await this.defaultMarkupBp());
  }

  /**
   * Soft-deleted items — the Trash screen. Uses the BASE client on purpose: the
   * soft-delete extension filters `deletedAt: null` into every normal read, so deleted
   * rows are invisible through `prisma.db`. Without this screen "delete" reads to staff
   * as permanent loss, which is the opposite of what soft-delete is for.
   */
  async trash() {
    const rows = await this.prisma.item.findMany({
      where: { deletedAt: { not: null } },
      include: {
        unit: true,
        itemCategory: { select: { id: true, name: true } },
      },
      orderBy: { deletedAt: 'desc' },
      take: 200,
    });
    const mk = await this.defaultMarkupBp();
    return rows.map((r) => this.shape(r, mk));
  }

  /**
   * The Recipe board — every assembled item with its lines, in one request.
   * Kept out of `list()` because loading every recipe on the main table would make the
   * common screen pay for the rare one.
   */
  async recipes() {
    const rows = await this.prisma.db.item.findMany({
      where: { itemType: ItemType.FINISHED },
      include: {
        ...itemInclude,
        components: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: {
            unit: true,
            componentItem: {
              select: {
                id: true,
                sku: true,
                name: true,
                itemType: true,
                costMode: true,
                standardCostPaisa: true,
                computedCostPaisa: true,
                unit: true,
              },
            },
          },
        },
        // what the shop actually charges — so the board can flag a losing recipe
        products: {
          where: { deletedAt: null },
          select: { id: true, name: true, slug: true, sellingPricePaisa: true },
          take: 5,
        },
      },
      orderBy: { name: 'asc' },
    });
    const mk = await this.defaultMarkupBp();
    return rows.map((r) => this.shape(r, mk));
  }

  /** where else this item is used — shown before a delete is attempted (ITM-R07) */
  async usage(id: string) {
    await this.ensureExists(id);
    const [products, recipes] = await Promise.all([
      this.prisma.db.product.findMany({
        where: { itemId: id },
        select: { id: true, name: true, slug: true },
        take: 50,
      }),
      this.prisma.db.itemComponent.findMany({
        where: { componentItemId: id, deletedAt: null },
        select: { id: true, parentItem: { select: { id: true, name: true, sku: true } } },
        take: 50,
      }),
    ]);
    return {
      products,
      usedInRecipes: recipes.map((r) => r.parentItem),
    };
  }

  timeline(id: string) {
    return this.audit.timeline(ENTITY, id);
  }

  /* ---------------------------------------------------------------- create */

  async create(dto: ItemDto) {
    const name = (dto.name ?? '').trim();
    if (!name) throw new BadRequestException('name is required');
    // DEC-ITM-017 — the label decides the behaviour, so resolve it before anything else
    const behaviour = await this.resolveType(dto.itemTypeId, dto.itemType);
    if (!behaviour) throw new BadRequestException('itemType is required');
    // DEC-ITM-006 — a unit-less item has meaningless stock and meaningless cost
    if (!dto.unitId) throw new BadRequestException('unitId is required (DEC-ITM-006)');
    await this.ensureUnit(dto.unitId);
    await this.ensureRefs(dto); // ITM-REV-6

    const sku = await this.freeSku(dto.sku?.trim() || skuFromName(name));
    /* ITM-REV-4 (30 Jul) — `false`, not `null`. A brand-new item has no recipe, and that
       is a fact, not an unknown. Passing `null` switched the ITM-R02 guard off, so
       `POST /items { itemType: FINISHED, assemblyMode: MAKE_TO_STOCK }` created an item
       claiming to be assembled out of nothing — which then reads as buildable on the
       Assembly board. `null` is for update(), where "does it have a recipe" is genuinely
       being decided elsewhere. */
    const norm = this.normalise({ ...dto, itemType: behaviour }, false);

    const item = await this.prisma.db.item.create({
      data: {
        sku,
        name,
        itemType: behaviour,
        itemTypeId: dto.itemTypeId ?? null,
        itemCategoryId: dto.itemCategoryId ?? null,
        brandId: dto.brandId ?? null,
        supplierId: dto.supplierId ?? null, // DEC-SUP-004
        unitId: dto.unitId,
        imageUrl: dto.imageUrl ?? null,
        isStockTracked: norm.isStockTracked,
        assemblyMode: norm.assemblyMode,
        // DEC-ITM-013 — sensible defaults per type: an ingredient is bought, not sold;
        // a service is sold, not bought; nothing perishable comes back.
        // ITM-R13 — a service overrules whatever the form sent for these two
        ...this.serviceFlags(behaviour, {
          isSaleable: dto.isSaleable ?? defaultSaleable(behaviour),
          isPurchasable: dto.isPurchasable ?? defaultPurchasable(behaviour),
        }),
        ...({ isOnline: dto.isOnline ?? true } as Record<string, boolean>), // DEC-ITM-024
        isReturnable: dto.isReturnable ?? !(dto.isPerishable ?? false),
        weightGram: dto.weightGram ?? null,
        // ITM-R05 — a brand-new item has no recipe yet, so AUTO is not yet meaningful
        costMode: CostMode.MANUAL,
        standardCostPaisa: Math.max(0, Math.round(dto.standardCostPaisa ?? 0)),
        ...this.priceRules(dto),
        isPerishable: dto.isPerishable ?? false,
        shelfLifeDays: dto.shelfLifeDays ?? null,
        reorderLevel: dto.reorderLevel ?? null,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
        attributeValues: dto.attributeValueIds?.length
          ? { connect: dto.attributeValueIds.map((id) => ({ id })) }
          : undefined,
      },
      include: itemInclude,
    });

    await this.log(item.id, 'CREATE', dto.actorName, `Item "${item.name}" (${item.sku}) created`);
    return this.shape(item, await this.defaultMarkupBp());
  }

  /* ------------------------------------------------------ variant generator */

  /**
   * DEC-ITM-016 — "Rose" + Colour[Red, Yellow, White] ⇒ three independent Items.
   *
   * WHY NO PARENT ROW: a "Rose" that is never bought, never counted and never sold is a
   * ghost record — exactly the junk that fills up an item master (the audited ERP had
   * ~500 dead rows). The ItemCategory is the family; the attribute labels tell the
   * members apart. Each generated item is a first-class Item with its own SKU, cost and
   * (later) stock, because that is the truth: red roses and white roses are bought
   * separately and run out separately.
   *
   * Idempotent-ish: a combination whose SKU already exists is skipped, never duplicated.
   */
  async generateVariants(dto: VariantGenerateDto) {
    const baseName = (dto.baseName ?? '').trim();
    if (!baseName) throw new BadRequestException('baseName is required');
    if (!dto.unitId) throw new BadRequestException('unitId is required (DEC-ITM-006)');
    await this.ensureUnit(dto.unitId);

    const groups = (dto.valueIdGroups ?? []).filter((g) => g.length > 0);
    if (groups.length === 0) {
      throw new BadRequestException('Pick at least one colour/size value to generate from.');
    }

    // resolve labels once, so names read "Rose — Red / Large" not "Rose — id1 / id2"
    const allIds = groups.flat();
    const values = await this.prisma.db.itemAttributeValue.findMany({
      where: { id: { in: allIds } },
      select: { id: true, label: true },
    });
    const labelOf = new Map(values.map((v) => [v.id, v.label]));
    const missing = allIds.filter((id) => !labelOf.has(id));
    if (missing.length) throw new BadRequestException('One of those labels no longer exists.');

    // cartesian product across the attribute groups
    let combos: string[][] = [[]];
    for (const g of groups) combos = combos.flatMap((c) => g.map((v) => [...c, v]));

    if (combos.length > 60) {
      throw new BadRequestException(
        `That would create ${combos.length} items. Generate at most 60 at a time — pick fewer values.`,
      );
    }

    const prefix = (dto.skuPrefix ?? '').trim() || skuFromName(baseName);

    /* DEC-ITM-020 — one key for this whole batch, so the list can say "Rose has 3
       variants" without inventing a parent row. This is the ONLY place it is written:
       an item created one at a time is a single item, full stop, no matter how many
       colour labels the owner puts on it. */
    const familyKey = `${prefix}::${Date.now().toString(36)}`;

    // DEC-ITM-012 — a photo per variant, falling back to the family photo. The key is
    // the sorted value-id set, so the order the admin ticked them in does not matter.
    const keyOf = (ids: string[]) => [...ids].sort().join('|');
    const imageFor = new Map<string, string | null>(
      (dto.variantImages ?? []).map((v) => [keyOf(v.valueIds), v.imageUrl]),
    );

    const created: { id: string; name: string; sku: string }[] = [];
    let skipped = 0;

    for (const combo of combos) {
      const labels = combo.map((id) => labelOf.get(id)!);
      const name = `${baseName} — ${labels.join(' / ')}`;
      const wanted = `${prefix}-${labels.map((l) => skuFromName(l)).join('-')}`;

      const clash = await this.prisma.item.findUnique({ where: { sku: wanted }, select: { id: true } });
      if (clash) { skipped++; continue; }

      const item = await this.prisma.db.item.create({
        data: {
          sku: wanted,
          name,
          itemType: dto.itemType,
          familyKey, // DEC-ITM-020
          itemCategoryId: dto.itemCategoryId ?? null,
          brandId: dto.brandId ?? null,
          unitId: dto.unitId,
          isStockTracked: dto.itemType !== ItemType.SERVICE,
          assemblyMode: AssemblyMode.NONE,
          // DEC-ITM-026 — a variant is an item like any other: born for selling
          isSaleable: dto.isSaleable ?? defaultSaleable(dto.itemType),
          ...({ isOnline: true } as Record<string, boolean>), // DEC-ITM-024
          isPurchasable: dto.isPurchasable ?? defaultPurchasable(dto.itemType),
          isReturnable: dto.isReturnable ?? !(dto.isPerishable ?? false),
          weightGram: dto.weightGram ?? null,
          costMode: CostMode.MANUAL,
          standardCostPaisa: Math.max(0, Math.round(dto.standardCostPaisa ?? 0)),
          isPerishable: dto.isPerishable ?? false,
          shelfLifeDays: dto.shelfLifeDays ?? null,
          imageUrl: imageFor.get(keyOf(combo)) ?? dto.imageUrl ?? null,
          attributeValues: { connect: combo.map((id) => ({ id })) },
        },
      });
      await this.log(item.id, 'CREATE', dto.actorName, `Item "${item.name}" (${item.sku}) created as a variant of "${baseName}"`);
      created.push({ id: item.id, name: item.name, sku: item.sku });
    }

    return {
      created,
      skipped,
      message:
        `${created.length} item${created.length === 1 ? '' : 's'} created` +
        (skipped ? `, ${skipped} skipped (already existed)` : '') +
        '. Each one has its own cost and stock — set them individually.',
    };
  }

  /* ---------------------------------------------------------------- update */

  async update(id: string, dto: ItemPatch) {
    const current = await this.prisma.db.item.findFirst({
      where: { id },
      include: { _count: { select: { components: { where: { deletedAt: null } } } } },
    });
    if (!current) throw new NotFoundException('Item not found');

    if (dto.unitId !== undefined) {
      if (!dto.unitId) throw new BadRequestException('unitId cannot be empty (DEC-ITM-006)');
      await this.ensureUnit(dto.unitId);
    }
    await this.ensureRefs(dto); // ITM-REV-6

    /* ═══════════════════════════════════════════════════════════ DEC-ITM-026
       THE THREE-STEP UNIT-CHANGE RULE (owner, 26 Aug 2026). Stock, cost and
       reorder level are all denominated in the item's counting unit, so a
       unit change is never just a label change:

         1. no purchase/stock history  -> change freely, nothing to restate
         2. history + SAME family      -> allowed, but stock/cost/reorder are
            restated by the exact factor — refused with UNIT_CONFIRM: until
            the numbers have been shown to a human (confirmUnitChange)
         3. history + DIFFERENT family -> blocked. 40 pice is not any number
            of kg; the honest answer is a new item.

       "Family" = the units share a root through the base-unit chain
       (UOM ruling, 21 Jul).  */
    let unitRestate: {
      fromFactor: number; toFactor: number; fromName: string; toName: string;
    } | null = null;
    if (dto.unitId !== undefined && dto.unitId !== current.unitId) {
      const [movements, purchaseLines] = await Promise.all([
        this.prisma.db.inventoryMovement.count({ where: { itemId: id } }),
        this.prisma.db.purchaseLine.count({ where: { itemId: id } }),
      ]);
      if (movements + purchaseLines > 0) {
        const from = await this.rootOf(current.unitId);
        const to = await this.rootOf(dto.unitId);
        const [fromU, toU] = await Promise.all([
          this.prisma.db.unit.findFirst({ where: { id: current.unitId }, select: { name: true } }),
          this.prisma.db.unit.findFirst({ where: { id: dto.unitId }, select: { name: true } }),
        ]);
        const fromName = fromU?.name ?? 'old unit';
        const toName = toU?.name ?? 'new unit';
        if (from.rootId !== to.rootId) {
          throw new BadRequestException(
            `"${current.name}" already has purchase or stock history counted in ${fromName}, and ${toName} is a different kind of measure — there is no honest conversion between them. Create a new item in ${toName} and make this one inactive (DEC-ITM-026).`,
          );
        }
        const onHand = await this.inventory.onHandMilli(id);
        const after = Math.round((onHand * from.factor) / to.factor);
        if (!dto.confirmUnitChange) {
          throw new ConflictException(
            `UNIT_CONFIRM: Changing ${fromName} -> ${toName} will restate this item's numbers: stock ${onHand / 1000} ${fromName} -> ${after / 1000} ${toName}, and cost/reorder level convert by the same factor. Selling price converts arithmetically too — review it after, bulk pricing is yours to set.`,
          );
        }
        unitRestate = { fromFactor: from.factor, toFactor: to.factor, fromName, toName };
      }
    }
    /*  fields that live in "per item unit" — restated when the denomination
        changes. Money per unit scales UP going to a bigger unit (cost per
        stick = 4 x cost per pice); a quantity scales DOWN (40 pice = 10
        sticks). Only used when the dto did not set the field itself.  */
    const perUnitMoney = (v: number | null | undefined) =>
      unitRestate == null || v == null
        ? undefined
        : Math.round((v * unitRestate.toFactor) / unitRestate.fromFactor);
    const perUnitQty = (v: number | null | undefined) =>
      unitRestate == null || v == null
        ? undefined
        : Math.max(1, Math.round((v * unitRestate.fromFactor) / unitRestate.toFactor));

    // DEC-ITM-017 — if the label changed, its behaviour wins over any enum sent alongside
    const nextType =
      (dto.itemTypeId !== undefined
        ? await this.resolveType(dto.itemTypeId, dto.itemType)
        : dto.itemType) ?? current.itemType;
    const hasRecipe = current._count.components > 0;

    // ITM-R01 — a recipe only makes sense on a FINISHED item
    if (nextType !== ItemType.FINISHED && hasRecipe) {
      throw new BadRequestException(
        `"${current.name}" has ${current._count.components} recipe line(s). Only FINISHED items can have a recipe (ITM-R01) — clear the recipe before changing the type.`,
      );
    }

    const norm = this.normalise({ ...current, ...dto, itemType: nextType }, hasRecipe);

    let sku = current.sku;
    if (dto.sku !== undefined) {
      const wanted = dto.sku.trim();
      if (!wanted) throw new BadRequestException('sku cannot be empty (ITM-R08)');
      if (wanted !== current.sku) sku = await this.freeSku(wanted, id);
    }

    const item = await this.prisma.db.item.update({
      where: { id },
      data: {
        sku,
        name: dto.name === undefined ? undefined : dto.name.trim(),
        itemType: nextType === current.itemType ? undefined : nextType,
        itemTypeId: dto.itemTypeId === undefined ? undefined : dto.itemTypeId,
        itemCategoryId: dto.itemCategoryId === undefined ? undefined : dto.itemCategoryId,
        brandId: dto.brandId === undefined ? undefined : dto.brandId,
        supplierId: dto.supplierId === undefined ? undefined : dto.supplierId, // DEC-SUP-004
        unitId: dto.unitId,
        imageUrl: dto.imageUrl === undefined ? undefined : dto.imageUrl,
        isStockTracked: norm.isStockTracked,
        assemblyMode: norm.assemblyMode,
        // ITM-R13 — a service is always sellable and never bought, whatever was sent
        ...this.serviceFlags(nextType, {
          isSaleable: dto.isSaleable,
          isPurchasable: dto.isPurchasable,
        }),
        ...(dto.isOnline === undefined ? {} : ({ isOnline: dto.isOnline } as Record<string, boolean>)), // DEC-ITM-024
        isReturnable: dto.isReturnable,
        weightGram: dto.weightGram === undefined ? undefined : dto.weightGram,
        costMode: norm.costMode,
        standardCostPaisa:
          dto.standardCostPaisa !== undefined
            ? Math.max(0, Math.round(dto.standardCostPaisa))
            : perUnitMoney(current.standardCostPaisa),
        ...this.priceRules(dto),
        /*  DEC-ITM-026 — per-unit money follows the new denomination unless the
            caller set it explicitly in the same save  */
        ...(unitRestate && dto.sellingPricePaisa === undefined && current.sellingPricePaisa != null
          ? { sellingPricePaisa: perUnitMoney(current.sellingPricePaisa) }
          : {}),
        ...(unitRestate && dto.minMarginPaisa === undefined && current.minMarginPaisa != null
          ? { minMarginPaisa: perUnitMoney(current.minMarginPaisa) }
          : {}),
        isPerishable: dto.isPerishable,
        shelfLifeDays: dto.shelfLifeDays === undefined ? undefined : dto.shelfLifeDays,
        reorderLevel:
          dto.reorderLevel !== undefined
            ? dto.reorderLevel
            : perUnitQty(current.reorderLevel),
        description: dto.description === undefined ? undefined : dto.description,
        isActive: dto.isActive,
        // sending the array REPLACES the set — `set` is the only unambiguous m2m verb
        attributeValues: dto.attributeValueIds
          ? { set: dto.attributeValueIds.map((v) => ({ id: v })) }
          : undefined,
      },
      include: itemInclude,
    });

    if (unitRestate) {
      /*  The item now carries the new unit; restate the stored balances to
          match. If this half fails, put the old unit back rather than leave
          the label and the numbers speaking different languages.  */
      try {
        await this.inventory.restateUnitDenomination({
          itemId: id,
          factorFrom: unitRestate.fromFactor,
          factorTo: unitRestate.toFactor,
          fromName: unitRestate.fromName,
          toName: unitRestate.toName,
          actor: dto.actorName,
        });
      } catch (e) {
        await this.prisma.db.item.update({ where: { id }, data: { unitId: current.unitId } });
        throw e;
      }
      await this.log(
        id, 'UPDATE', dto.actorName,
        `⚠ Unit changed ${unitRestate.fromName} -> ${unitRestate.toName}; stock, cost and reorder level restated (DEC-ITM-026)`,
      );
    }

    await this.log(id, 'UPDATE', dto.actorName, `Item "${item.name}" updated`);
    // ITM-R06 — this item's cost may now read differently for everything above it
    await this.rollUpFrom(id);

    /* ITM-REV-3 (30 Jul) — read it back. `item` above was captured BEFORE the roll-up
       wrote `computedCostPaisa`, so an AUTO item returned its PREVIOUS cost, and
       `shape()` then derived `effectiveCostPaisa` and `floorPricePaisa` from the stale
       figure. The screen showed the old price after saving and only came right on the
       next reload — the sort of wrong number nobody reports as a bug, they just stop
       trusting the column. */
    const fresh = await this.prisma.db.item.findFirst({ where: { id }, include: itemInclude });
    return this.shape(fresh ?? item, await this.defaultMarkupBp());
  }

  /* ---------------------------------------------------------------- delete */

  /**
   * ITM-R07, rewritten 21 Jul after the owner found 71 of his 86 items undeletable.
   *
   * WHAT WAS WRONG: the rule refused any item a Product pointed at, and told the user to
   * "detach it there first" — meaning open 71 product pages by hand. Since every one of
   * those items had been generated FROM a product, that is every item he owns. A rule
   * that forbids the normal case is not protecting anything; it is just in the way.
   *
   * WHAT IS TRUE: `Product.itemId` is NULLABLE. Clearing it does not break the product —
   * the product keeps its own name, price and photos and simply stops being linked to a
   * stockroom row. So the Product link is a link, not a dependency, and it can be undone
   * automatically when the caller says so (`detach: true`).
   *
   * WHAT STAYS BLOCKED: being an ingredient in someone else's recipe. That one IS a real
   * dependency — silently pulling a rose out of seven bouquets would change seven costs
   * without anybody asking for it.
   */
  async remove(id: string, actorName = 'Admin', detach = false) {
    const item = await this.prisma.db.item.findFirst({
      where: { id },
      include: {
        _count: {
          select: {
            products: { where: { deletedAt: null } },
            usedIn: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Item not found');

    // hard block — a recipe that loses an ingredient silently reprices itself
    if (item._count.usedIn > 0) {
      throw new BadRequestException(
        `"${item.name}" is an ingredient in ${item._count.usedIn} recipe${item._count.usedIn === 1 ? '' : 's'}. ` +
        `Take it out of ${item._count.usedIn === 1 ? 'that recipe' : 'those recipes'} first — removing it here would change their cost without telling anyone.`,
      );
    }

    // soft block — undoable in one step, so offer it instead of refusing
    if (item._count.products > 0 && !detach) {
      throw new BadRequestException(
        `LINKED:${item._count.products}:` +
        `"${item.name}" is linked to ${item._count.products} product${item._count.products === 1 ? '' : 's'}. ` +
        `Unlink and delete, or leave it alone?`,
      );
    }

    /* ITM-REV-7 — the RAW client on purpose. `prisma.db.product` hides soft-deleted
       products, so a product in the trash kept its `itemId` and then blocked the purge
       for ever with "1 product(s) still point at it" — naming a product the user cannot
       see to unlink. A link to a deleted product is not a dependency worth keeping. */
    let detached = 0;
    if (item._count.products > 0) {
      const r = await this.prisma.product.updateMany({
        where: { itemId: id },
        data: { itemId: null },
      });
      detached = r.count;
    }

    const now = new Date();

    /* ITM-REV-2 (30 Jul) — take this item's OWN recipe lines down with it.
       They used to survive, and `usedIn` counts live LINES, not live parents. So
       deleting a bouquet left its roses reporting "ingredient in 1 recipe" and
       undeletable for ever, pointing at a bouquet already in the trash. Exactly the
       shape of the 21 Jul bug that made 71 of 86 items undeletable — a rule that
       forbids the normal case is not protecting anything.
       `restore()` deliberately does NOT put them back: a recipe is rebuilt on purpose,
       not resurrected by a side effect. */
    const lines = await this.prisma.db.itemComponent.updateMany({
      where: { parentItemId: id, deletedAt: null },
      data: { deletedAt: now },
    });

    await this.prisma.db.item.update({ where: { id }, data: { deletedAt: now } });
    await this.log(
      id, 'DELETE', actorName,
      `Item "${item.name}" deleted (soft)` +
      (detached ? ` — unlinked from ${detached} product${detached === 1 ? '' : 's'} first` : '') +
      (lines.count ? ` — its ${lines.count} recipe line${lines.count === 1 ? '' : 's'} released` : ''),
    );
    return { id, deleted: true, detached, recipeLinesReleased: lines.count };
  }

  async restore(id: string, actorName = 'Admin') {
    // the soft-delete extension filters deleted rows out of normal reads, so go raw here
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Item not found');
    await this.prisma.item.update({ where: { id }, data: { deletedAt: null } });
    await this.log(id, 'UPDATE', actorName, `Item "${item.name}" restored`);
    return { id, restored: true };
  }

  /**
   * ITM-R14 — PERMANENT delete, from the trash only (sobuj, 21 Jul).
   *
   * Soft-delete alone was not enough: a mistyped test row sits in the trash forever and
   * the master ends up looking exactly like the ~500-dead-row ERP this module exists to
   * avoid. So a purge exists — but it is fenced, because a hard delete is the one action
   * in this system that cannot be undone.
   *
   * The fences, in order:
   *   1. It must ALREADY be in the trash. You cannot purge a live item in one click.
   *   2. Nothing may reference it — no Product, no recipe it appears in, and no recipe
   *      lines of its own. Those are checked against RAW rows, deleted ones included:
   *      a soft-deleted Product still has to be able to explain what it pointed at.
   *   3. It must never have been SOLD, BOUGHT, COUNTED or BUILT. A document line naming
   *      an item that no longer exists turns last month's report into a row of blanks.
   *      This is the fence that matters most and the one a user is least likely to
   *      think of.
   *   4. The caller must send the exact SKU back (the controller checks it), so this
   *      cannot happen on a stray click.
   *
   * The AuditLog entry is written BEFORE the row goes, and deliberately survives it —
   * "who destroyed what, and when" is the one trace that must outlive the record.
   *
   * ⚠️ ITM-REV-1 (30 Jul) — fence 3 used to check ORDER lines only, and fence 2 three
   * relations out of thirteen. Item is referenced by ten more tables, every one of them
   * a REQUIRED foreign key: purchase lines, the four Inventory documents, the stock
   * balance, the ledger, expiry lots and the three Assembly tables. Purging an item that
   * had ever been received on a purchase therefore did not refuse — it reached
   * `prisma.item.delete()` and came back as a raw Prisma P2003, i.e. a 500 with no
   * message, after the user had already typed the SKU to confirm.
   *
   * The list below is written out relation by relation rather than caught as an
   * exception, because "it appears on 3 purchases and 12 stock movements" is a sentence
   * somebody can act on and "Internal server error" is not. **Any new table that points
   * at Item must be added here** — a fence with a hole in it is worse than no fence,
   * because it is trusted.
   */
  async purge(id: string, actorName = 'Admin', confirmSku = '') {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
            usedIn: true,
            components: true,
            purchaseLines: true,
            stocks: true,
            movements: true,
            transferLines: true,
            issueLines: true,
            stocktakeLines: true,
            expiryLots: true,
            asmTemplateLines: true,
            asmProductionLines: true,
            asmProductions: true,
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Item not found');

    /*  Fence 4 was "type the code exactly". Dropped on the owner's word,
        22 Aug 2026: *"trash gele tarpor destroy krte gele name dewa lage
        ataw tule daw — just krte chai kina confirmation chaibe."* The screen
        asks once, plainly, and Yes means yes. The fences that actually
        protect anything are the ones below: it must already be in the trash,
        and nothing may point at it. `confirmSku` is still accepted so an old
        tab or script does not break; it is simply no longer required.  */

    if (!item.deletedAt) {
      throw new BadRequestException(
        `"${item.name}" is still in use. Delete it first — permanent removal is only possible from the trash.`,
      );
    }

    const c = item._count;
    const blockers: string[] = [];
    if (c.products > 0) {
      blockers.push(`${c.products} product(s) still point at it`);
    }
    if (c.usedIn > 0) {
      blockers.push(`it is an ingredient in ${c.usedIn} recipe(s)`);
    }

    /* ITM-REV-8 (30 Jul) — its OWN recipe lines are NOT a blocker, and used to be.
       `components` are children of this item: they name it as their parent and mean
       nothing without it — unlike `usedIn`, which is somebody ELSE's recipe and is a
       real dependency. Fencing on them made every assembled item unpurgeable, and
       ITM-REV-2 (delete now soft-deletes those lines) would have made that permanent:
       the count is taken on the RAW client, so a soft-deleted line still blocked, and
       there is no way to reach a trashed item's recipe from the Trash screen to clear
       it by hand. A fence nobody can open is a wall.
       They are destroyed with the parent, below, once every real blocker has cleared. */

    /* Has it ever been sold? OrderLine → Product → Item. Even when every Product has
       since been deleted, the order lines remain and a purge would leave them naming a
       thing that no longer exists. `count` on the raw client so soft-deleted rows count
       too — history does not stop mattering because a row was hidden.
       POS counter sales are Orders too (they differ only by `fulfillmentType`), so this
       one count covers both channels. */
    const sold = await this.prisma.orderLine.count({ where: { product: { itemId: id } } });
    if (sold > 0) {
      blockers.push(`it appears on ${sold} past order line(s), and those must stay readable`);
    }

    /* ITM-REV-1 — the other ten. Each is a required FK, so reaching `delete()` with any
       of them non-zero is a raw P2003. Grouped into one sentence per area because the
       user does not care which of four Inventory documents it was. */
    if (c.purchaseLines > 0) {
      blockers.push(`it was received on ${c.purchaseLines} purchase line(s)`);
    }
    const invDocs = c.transferLines + c.issueLines + c.stocktakeLines;
    if (c.movements > 0 || c.stocks > 0 || invDocs > 0 || c.expiryLots > 0) {
      const parts: string[] = [];
      if (c.movements > 0) parts.push(`${c.movements} stock movement(s)`);
      if (c.stocks > 0) parts.push(`${c.stocks} warehouse balance row(s)`);
      if (invDocs > 0) parts.push(`${invDocs} transfer/issue/count line(s)`);
      if (c.expiryLots > 0) parts.push(`${c.expiryLots} expiry lot(s)`);
      blockers.push(`Inventory still holds ${parts.join(', ')} for it`);
    }
    const asm = c.asmTemplateLines + c.asmProductionLines + c.asmProductions;
    if (asm > 0) {
      blockers.push(`Assembly still refers to it in ${asm} template/production line(s)`);
    }

    if (blockers.length) {
      throw new BadRequestException(
        `"${item.name}" cannot be destroyed — ${blockers.join('; ')}.`,
      );
    }

    // audit FIRST: if the delete succeeds we still want the trace, and if the audit
    // write fails we would rather keep the row than lose it silently
    /* AUD-REV-1 — the STRICT audit write, deliberately.
       `audit.record()` was made non-fatal on 30 Jul because every other caller writes
       its trace AFTER the deed, where a throw destroys the record and provokes a
       duplicate retry. This call is the one exception in the whole codebase: the trace
       is written BEFORE something irreversible, and the comment above has always said
       "if the audit write fails we would rather keep the row than lose it silently".
       So it goes through `recordOrThrow` — the fix must not quietly take that away. */
    const label =
      `Item "${item.name}" (${item.sku}) permanently destroyed — this cannot be undone` +
      (c.components ? ` (with its ${c.components} own recipe line(s))` : '');
    await this.audit.recordOrThrow({ entityType: ENTITY, entityId: id, action: 'DELETE', actorName });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label, actorName });

    /* ITM-REV-8 — the owned children go first, or the FK on `parentItemId` refuses.
       Raw client and a HARD delete on purpose: these are lines of a recipe that is
       about to stop existing, and leaving them soft-deleted would leave rows pointing
       at an id that is gone. */
    if (c.components > 0) {
      await this.prisma.itemComponent.deleteMany({ where: { parentItemId: id } });
    }

    await this.prisma.item.delete({ where: { id } });
    return { id, purged: true, name: item.name, sku: item.sku, linesDestroyed: c.components };
  }

  /* ------------------------------------------------------------- recipe ---- */

  async addComponent(parentId: string, dto: ComponentDto) {
    const parent = await this.prisma.db.item.findFirst({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Item not found');

    // ITM-R01
    if (parent.itemType !== ItemType.FINISHED) {
      throw new BadRequestException(
        `Only FINISHED items can have a recipe (ITM-R01). "${parent.name}" is ${parent.itemType}.`,
      );
    }
    const child = await this.prisma.db.item.findFirst({ where: { id: dto.componentItemId } });
    if (!child) throw new NotFoundException('Component item not found');

    // ITM-R03 — direct self-reference, then the transitive check
    if (child.id === parent.id) {
      throw new BadRequestException(`"${parent.name}" cannot contain itself (ITM-R03).`);
    }
    if (await this.reaches(child.id, parent.id, 0)) {
      throw new BadRequestException(
        `That would create a loop: "${child.name}" already contains "${parent.name}" somewhere in its recipe (ITM-R03).`,
      );
    }
    /* ITM-REV-5 (30 Jul) — measure the WHOLE chain, not just the half below.
       The old check counted only how deep the child's own recipe went and ignored how
       far the parent was already nested underneath something else. Adding one line at a
       time therefore walked straight past MAX_DEPTH, and it is the total height that
       bounds `rollUpFrom` — which gives up silently at MAX_DEPTH, so an over-deep tree
       does not error, it just stops costing correctly somewhere in the middle. */
    const above = await this.heightAbove(parent.id, 0);
    const below = await this.depthOf(child.id, 0);
    if (above + 1 + below > MAX_DEPTH) {
      throw new BadRequestException(
        `Recipes may not nest deeper than ${MAX_DEPTH} levels. ` +
        `"${parent.name}" already sits ${above} level(s) inside another recipe and ` +
        `"${child.name}" is ${below} level(s) deep of its own.`,
      );
    }

    const qtyMilli = Math.round(dto.qtyMilli);
    if (!Number.isFinite(qtyMilli) || qtyMilli <= 0) {
      throw new BadRequestException('Quantity must be greater than zero.');
    }

    const existing = await this.prisma.db.itemComponent.findFirst({
      where: { parentItemId: parentId, componentItemId: child.id, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(
        `"${child.name}" is already in this recipe — edit that line instead of adding it twice.`,
      );
    }

    const count = await this.prisma.db.itemComponent.count({
      where: { parentItemId: parentId, deletedAt: null },
    });

    const line = await this.prisma.db.itemComponent.create({
      data: {
        parentItemId: parentId,
        componentItemId: child.id,
        qtyMilli,
        unitId: dto.unitId ?? child.unitId,
        wastageBp: Math.max(0, Math.round(dto.wastageBp ?? 0)),
        isOptional: dto.isOptional ?? false,
        displayText: dto.displayText ?? null,
        sortOrder: dto.sortOrder ?? count,
      },
    });

    // DEC-ITM-004 — the first ingredient turns a plain item into an assembled one.
    // Default to MAKE_TO_ORDER: fresh flowers are the common case and it is the safe
    // one (no phantom finished stock). Staff can switch it to MAKE_TO_STOCK.
    if (parent.assemblyMode === AssemblyMode.NONE) {
      await this.prisma.db.item.update({
        where: { id: parentId },
        data: { assemblyMode: AssemblyMode.MAKE_TO_ORDER },
      });
    }

    await this.log(
      parentId,
      'UPDATE',
      dto.actorName,
      `Added ${fmtQty(qtyMilli)} × "${child.name}" to the recipe`,
    );
    await this.rollUpFrom(parentId);
    return line;
  }

  async updateComponent(lineId: string, dto: ComponentPatch) {
    const line = await this.prisma.db.itemComponent.findFirst({ where: { id: lineId } });
    if (!line) throw new NotFoundException('Recipe line not found');

    if (dto.qtyMilli !== undefined) {
      const q = Math.round(dto.qtyMilli);
      if (!Number.isFinite(q) || q <= 0) {
        throw new BadRequestException('Quantity must be greater than zero.');
      }
    }

    const updated = await this.prisma.db.itemComponent.update({
      where: { id: lineId },
      data: {
        qtyMilli: dto.qtyMilli === undefined ? undefined : Math.round(dto.qtyMilli),
        unitId: dto.unitId,
        wastageBp: dto.wastageBp === undefined ? undefined : Math.max(0, Math.round(dto.wastageBp)),
        isOptional: dto.isOptional,
        displayText: dto.displayText === undefined ? undefined : dto.displayText,
        sortOrder: dto.sortOrder,
      },
    });
    await this.log(line.parentItemId, 'UPDATE', dto.actorName, 'Recipe line updated');
    await this.rollUpFrom(line.parentItemId);
    return updated;
  }

  async removeComponent(lineId: string, actorName = 'Admin') {
    const line = await this.prisma.db.itemComponent.findFirst({
      where: { id: lineId },
      include: { componentItem: { select: { name: true } } },
    });
    if (!line) throw new NotFoundException('Recipe line not found');

    await this.prisma.db.itemComponent.update({
      where: { id: lineId },
      data: { deletedAt: new Date() },
    });

    const left = await this.prisma.db.itemComponent.count({
      where: { parentItemId: line.parentItemId, deletedAt: null },
    });
    // ITM-R02 / ITM-R05 — an empty recipe means it is a plain item again, and AUTO cost
    // has nothing left to add up.
    if (left === 0) {
      await this.prisma.db.item.update({
        where: { id: line.parentItemId },
        data: {
          assemblyMode: AssemblyMode.NONE,
          costMode: CostMode.MANUAL,
          computedCostPaisa: null,
        },
      });
    }

    await this.log(
      line.parentItemId,
      'UPDATE',
      actorName,
      `Removed "${line.componentItem.name}" from the recipe`,
    );
    await this.rollUpFrom(line.parentItemId);
    return { id: lineId, deleted: true };
  }

  /* ------------------------------------------------------------ cost roll-up */

  /**
   * DEC-ITM-008 / ITM-R06. `effective cost` of an item is its computed cost when it is
   * on AUTO, otherwise its manual standard cost. Changing an ingredient therefore has
   * to walk UPWARDS through every recipe that uses it.
   */
  private effective(i: {
    costMode: CostMode;
    standardCostPaisa: number;
    computedCostPaisa: number | null;
  }): number {
    return i.costMode === CostMode.AUTO ? (i.computedCostPaisa ?? 0) : i.standardCostPaisa;
  }

  /** recompute this item, then everything that contains it */
  private async rollUpFrom(itemId: string, depth = 0): Promise<void> {
    if (depth > MAX_DEPTH) return;
    await this.recompute(itemId);
    const parents = await this.prisma.db.itemComponent.findMany({
      where: { componentItemId: itemId, deletedAt: null },
      select: { parentItemId: true },
    });
    const unique = [...new Set(parents.map((p) => p.parentItemId))];
    for (const p of unique) await this.rollUpFrom(p, depth + 1);
  }

  private async recompute(itemId: string): Promise<void> {
    const lines = await this.prisma.db.itemComponent.findMany({
      where: { parentItemId: itemId, deletedAt: null },
      include: {
        componentItem: {
          select: { costMode: true, standardCostPaisa: true, computedCostPaisa: true },
        },
      },
    });
    if (lines.length === 0) {
      await this.prisma.db.item.update({
        where: { id: itemId },
        data: { computedCostPaisa: null },
      });
      return;
    }
    // qtyMilli is thousandths; wastageBp is basis points. Integers throughout — the
    // single rounding happens once, at the end.
    let total = 0;
    for (const l of lines) {
      if (l.isOptional) continue; // an optional extra is not part of the standard cost
      const unit = this.effective(l.componentItem);
      total += (unit * l.qtyMilli * (10000 + l.wastageBp)) / (1000 * 10000);
    }
    await this.prisma.db.item.update({
      where: { id: itemId },
      data: { computedCostPaisa: Math.round(total) },
    });
  }

  /* ---------------------------------------------------- product generator ---- */

  /**
   * DEC-ITM-009 + DEC-ITM-010. One click, idempotent (ITM-R11):
   *   - every Product without an `itemId` gets a FINISHED Item
   *   - the Product's existing `sku` ("ROSE-78") is CARRIED OVER into `Item.sku`, so
   *     staff keep the codes they already know; blank ones get one from the slug
   *   - cost is copied and left on MANUAL — the recipe is empty at this point, so AUTO
   *     would report ৳0 and every margin board would go red overnight (ITM-R05)
   *   - CRAFTED → MAKE_TO_ORDER, READYMADE → NONE
   * No stock is touched anywhere (DEC-ITM-005 / ITM-R09).
   */
  async generateFromProducts(actorName = 'Admin') {
    const products = await this.prisma.db.product.findMany({
      where: { itemId: null },
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        costPaisa: true,
        productType: true,
        unitId: true,
        brandId: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (products.length === 0) {
      return { created: 0, linked: 0, skipped: 0, message: 'Every product already has an item.' };
    }

    // a unit is mandatory on Item; products may have none, so fall back to a real one
    const fallbackUnit = await this.prisma.db.unit.findFirst({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (!fallbackUnit) {
      throw new BadRequestException(
        'No units exist yet. Add at least one unit (Master data → Units) before generating items — every item needs a unit (DEC-ITM-006).',
      );
    }

    let created = 0;
    let skipped = 0;

    for (const p of products) {
      const wanted = (p.sku ?? '').trim() || skuFromName(p.slug || p.name);
      try {
        const sku = await this.freeSku(wanted);
        const item = await this.prisma.db.item.create({
          data: {
            sku,
            name: p.name,
            itemType: ItemType.FINISHED,
            unitId: p.unitId ?? fallbackUnit.id,
            brandId: p.brandId ?? null,
            assemblyMode:
              p.productType === 'CRAFTED' ? AssemblyMode.MAKE_TO_ORDER : AssemblyMode.NONE,
            costMode: CostMode.MANUAL,
            standardCostPaisa: p.costPaisa ?? 0,
            description: `Generated from product "${p.name}" (DEC-ITM-009). Recipe still empty.`,
          },
        });
        await this.prisma.db.product.update({
          where: { id: p.id },
          data: { itemId: item.id },
        });
        await this.log(
          item.id,
          'CREATE',
          actorName,
          `Item "${item.name}" (${item.sku}) generated from product and linked`,
        );
        created++;
      } catch {
        skipped++;
      }
    }

    return {
      created,
      linked: created,
      skipped,
      message:
        `${created} item${created === 1 ? '' : 's'} created and linked` +
        (skipped ? `, ${skipped} skipped (could not generate a unique SKU)` : '') +
        '. Recipes are empty — fill them in as you go.',
    };
  }

  /* ---------------------------------------------------------------- helpers */

  /**
   * DEC-ITM-017 / ITM-R13 — the label decides the behaviour.
   * When a type row is named, its `behaviour` is authoritative and any enum sent
   * alongside it is ignored. That is the whole point of the two columns: the owner
   * picks a word, the rules read a fixed value, and they can never disagree.
   * Passing no row id falls back to the raw enum, so older callers still work.
   */
  private async resolveType(
    itemTypeId: string | null | undefined,
    fallback: ItemType | undefined,
  ): Promise<ItemType | undefined> {
    if (!itemTypeId) return fallback;
    const row = await this.prisma.db.itemTypeMaster.findFirst({
      where: { id: itemTypeId },
      select: { behaviour: true, isActive: true, name: true },
    });
    if (!row) throw new BadRequestException('That item type does not exist.');
    if (!row.isActive) {
      throw new BadRequestException(`The type "${row.name}" is switched off — pick another one.`);
    }
    return row.behaviour;
  }

  /**
   * DEC-ITM-018 + DEC-ITM-019 — the price FLOOR and the tax defaults.
   *
   * Item deliberately stores no selling price (owner's ruling, 21 Jul): one price in
   * two places drifts apart the first time somebody edits only one of them. What Item
   * owns is what we PAY plus the least profit we will accept; Product and POS set the
   * real price and are expected to refuse to go under the floor.
   *
   * Percent beats flat when both arrive — a percentage keeps working when the purchase
   * rate moves, a flat figure quietly stops meaning anything.
   * Everything is clamped: a negative margin is not a business decision, it is a typo.
   */
  /** walk the base-unit chain to the root — { rootId, factor } (UOM ruling, cycle-guarded) */
  private async rootOf(unitId: string): Promise<{ rootId: string; factor: number }> {
    let factor = 1;
    let currentId = unitId;
    const seen = new Set<string>();
    while (!seen.has(currentId)) {
      seen.add(currentId);
      const u: { id: string; baseUnitId: string | null; baseQty: number } | null =
        await this.prisma.db.unit.findFirst({
          where: { id: currentId },
          select: { id: true, baseUnitId: true, baseQty: true },
        });
      if (!u || !u.baseUnitId) return { rootId: currentId, factor };
      factor *= Math.max(u.baseQty, 1);
      currentId = u.baseUnitId;
    }
    return { rootId: currentId, factor }; // broken chain — treat where we stopped as root
  }

  private priceRules(dto: ItemPatch) {
    const bp = (v: number | null | undefined, max: number) =>
      v === undefined ? undefined : v === null ? null : Math.min(max, Math.max(0, Math.round(v)));

    /*  DEC-ITM-022/023 — the counter price override and this item's own profit
        percent. Clamped like every money field: a negative price is a typo, never a
        business decision. Cast because the generated client on this machine predates
        the columns; it goes away after the next BUILD_CHECK.bat regenerate.  */
    const counterPrice: Record<string, number | null> = {};
    if (dto.sellingPricePaisa !== undefined) {
      counterPrice.sellingPricePaisa =
        dto.sellingPricePaisa === null ? null : Math.max(0, Math.round(dto.sellingPricePaisa));
    }
    if (dto.markupBp !== undefined) {
      counterPrice.markupBp =
        dto.markupBp === null ? null : Math.min(1_000_000, Math.max(0, Math.round(dto.markupBp)));
    }

    const out: {
      minMarginBp?: number | null;
      minMarginPaisa?: number | null;
      vatRateBp?: number | null;
      maxDiscountBp?: number | null;
    } = {
      minMarginBp: bp(dto.minMarginBp, 1_000_000), // 10 000% — a cap, not a policy
      minMarginPaisa:
        dto.minMarginPaisa === undefined
          ? undefined
          : dto.minMarginPaisa === null
            ? null
            : Math.max(0, Math.round(dto.minMarginPaisa)),
      vatRateBp: bp(dto.vatRateBp, 10_000), // 100% is the ceiling by definition
      maxDiscountBp: bp(dto.maxDiscountBp, 10_000),
    };

    // only one margin rule may be live at a time, or the floor has two answers
    if (out.minMarginBp) out.minMarginPaisa = null;
    else if (out.minMarginPaisa) out.minMarginBp = null;

    return { ...out, ...counterPrice };
  }

  /** ITM-R04 + ITM-R02 + ITM-R05 — the field combinations that must never disagree */
  private normalise(
    v: {
      itemType: ItemType;
      isStockTracked?: boolean | null;
      assemblyMode?: AssemblyMode | null;
      costMode?: CostMode | null;
    },
    hasRecipe: boolean | null,
  ): { isStockTracked: boolean; assemblyMode: AssemblyMode; costMode: CostMode } {
    let isStockTracked = v.isStockTracked ?? true;
    let assemblyMode = v.assemblyMode ?? AssemblyMode.NONE;
    let costMode = v.costMode ?? CostMode.MANUAL;

    // ITM-R04 — nothing physical exists for a service, and it cannot be assembled
    if (v.itemType === ItemType.SERVICE) {
      isStockTracked = false;
      assemblyMode = AssemblyMode.NONE;
    }
    // ITM-R01 — only a FINISHED item can be assembled
    if (v.itemType !== ItemType.FINISHED) assemblyMode = AssemblyMode.NONE;
    // ITM-R02 — cannot claim to be assembled with nothing to assemble
    if (hasRecipe === false && assemblyMode !== AssemblyMode.NONE) {
      assemblyMode = AssemblyMode.NONE;
    }
    // ITM-R05 — AUTO with no recipe would report ৳0 and silently wreck every margin figure
    if (hasRecipe === false && costMode === CostMode.AUTO) costMode = CostMode.MANUAL;

    return { isStockTracked, assemblyMode, costMode };
  }

  /**
   * ITM-R13 (owner, 20 Aug 2026) — a SERVICE is always sellable, and never bought.
   *
   * "basorghor" was saved with "We sell it" off and vanished from the till. A
   * service is not stocked, not counted and not purchased; being sold is the only
   * thing it does. Leaving that to a switch means one forgotten tick hides a whole
   * line of business, so the rule decides it instead of the screen.
   */
  private serviceFlags(t: ItemType, v: { isSaleable?: boolean; isPurchasable?: boolean }) {
    if (t !== ItemType.SERVICE) return v;
    return { ...v, isSaleable: true, isPurchasable: false };
  }

  /** ITM-R03 — can `from` reach `target` by walking down its recipe? */
  private async reaches(from: string, target: string, depth: number): Promise<boolean> {
    if (depth > MAX_DEPTH) return false;
    const lines = await this.prisma.db.itemComponent.findMany({
      where: { parentItemId: from, deletedAt: null },
      select: { componentItemId: true },
    });
    for (const l of lines) {
      if (l.componentItemId === target) return true;
      if (await this.reaches(l.componentItemId, target, depth + 1)) return true;
    }
    return false;
  }

  /** ITM-REV-5 — how many levels of recipe sit ABOVE this item (0 = nothing uses it) */
  private async heightAbove(itemId: string, depth: number): Promise<number> {
    if (depth > MAX_DEPTH) return depth;
    const lines = await this.prisma.db.itemComponent.findMany({
      where: { componentItemId: itemId, deletedAt: null },
      select: { parentItemId: true },
    });
    if (lines.length === 0) return depth;
    let tallest = depth;
    for (const p of new Set(lines.map((l) => l.parentItemId))) {
      tallest = Math.max(tallest, await this.heightAbove(p, depth + 1));
    }
    return tallest;
  }

  private async depthOf(itemId: string, depth: number): Promise<number> {
    if (depth > MAX_DEPTH) return depth;
    const lines = await this.prisma.db.itemComponent.findMany({
      where: { parentItemId: itemId, deletedAt: null },
      select: { componentItemId: true },
    });
    if (lines.length === 0) return depth;
    let deepest = depth;
    for (const l of lines) {
      deepest = Math.max(deepest, await this.depthOf(l.componentItemId, depth + 1));
    }
    return deepest;
  }

  /** ITM-R08 — SKU is unique across the whole system, deleted rows included */
  private async freeSku(wanted: string, exceptId?: string): Promise<string> {
    const base = skuFromName(wanted);
    for (let n = 0; n < 60; n++) {
      const candidate = n === 0 ? base : `${base}-${n + 1}`;
      const clash = await this.prisma.item.findUnique({
        where: { sku: candidate },
        select: { id: true },
      });
      if (!clash || clash.id === exceptId) return candidate;
    }
    throw new BadRequestException(`Could not find a free SKU based on "${base}".`);
  }

  private async ensureExists(id: string) {
    const i = await this.prisma.db.item.findFirst({ where: { id }, select: { id: true } });
    if (!i) throw new NotFoundException('Item not found');
  }

  private async ensureUnit(unitId: string) {
    const u = await this.prisma.db.unit.findFirst({ where: { id: unitId }, select: { id: true } });
    if (!u) throw new BadRequestException('That unit does not exist.');
  }

  /**
   * ITM-REV-6 (30 Jul) — the other three references, checked the same way `unitId` was.
   *
   * Only `unitId` was ever validated. A stale `itemCategoryId`, `brandId` or
   * `supplierId` — which is the normal outcome of an admin tab left open while somebody
   * else deletes a brand — went straight to Prisma and came back as a raw P2003: HTTP
   * 500, no message, and the form silently loses everything the user typed. A reference
   * that is checked in one field out of four is not a validated form; it is three
   * unhandled crashes wearing one.
   *
   * `undefined` means "not sent, leave alone"; `null` means "clear it" and is allowed.
   */
  private async ensureRefs(dto: {
    itemCategoryId?: string | null;
    brandId?: string | null;
    supplierId?: string | null;
  }) {
    const checks: [string | null | undefined, string, () => Promise<unknown>][] = [
      [dto.itemCategoryId, 'category', () =>
        this.prisma.db.itemCategory.findFirst({ where: { id: dto.itemCategoryId! }, select: { id: true } })],
      [dto.brandId, 'brand', () =>
        this.prisma.db.brand.findFirst({ where: { id: dto.brandId! }, select: { id: true } })],
      [dto.supplierId, 'supplier', () =>
        this.prisma.db.supplier.findFirst({ where: { id: dto.supplierId! }, select: { id: true } })],
    ];
    for (const [value, label, find] of checks) {
      if (!value) continue; // undefined = untouched, null/'' = clearing it, both fine
      if (!(await find())) {
        throw new BadRequestException(
          `That ${label} no longer exists — somebody may have removed it. Reload the page and pick again.`,
        );
      }
    }
  }

  /** ITM-R10 — machine audit + human timeline, on every write */
  private async log(
    id: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    actorName = 'Admin',
    label: string,
  ) {
    await this.audit.record({ entityType: ENTITY, entityId: id, action, actorName });
    await this.audit.event({ entityType: ENTITY, entityId: id, kind: 'general', label, actorName });
  }

  /**
   * DEC-ITM-023 — the shop's default profit percent, one row, created on first read.
   * Cached for a few seconds: every item in a list asks for the same number, and the
   * owner changes it about twice a year.
   */
  private markupCache: { bp: number; at: number } | null = null;

  async defaultMarkupBp(): Promise<number> {
    if (this.markupCache && Date.now() - this.markupCache.at < 10_000) return this.markupCache.bp;
    const row = await ensureSingleton(
      () => (this.prisma.db as unknown as ItemSettingClient).itemSetting.findFirst(),
      () => (this.prisma.db as unknown as ItemSettingClient).itemSetting.create({ data: {} }),
    );
    const bp = row?.defaultMarkupBp ?? 2000;
    this.markupCache = { bp, at: Date.now() };
    return bp;
  }

  async getSettings() {
    return { defaultMarkupBp: await this.defaultMarkupBp() };
  }

  async patchSettings(dto: { defaultMarkupBp?: number }, actorName = 'Admin') {
    const bp = Math.min(1_000_000, Math.max(0, Math.round(dto.defaultMarkupBp ?? 2000)));
    await this.defaultMarkupBp(); // make sure the row exists
    await (this.prisma.db as unknown as ItemSettingClient).itemSetting.update({
      where: { id: 'singleton' },
      data: { defaultMarkupBp: bp },
    });
    this.markupCache = null;
    await this.audit.record({ entityType: 'ItemSetting', entityId: 'singleton', action: 'UPDATE', actorName });
    return { defaultMarkupBp: bp };
  }

  /** adds the derived fields the admin screens read, so the maths lives in one place */
  private shape<
    T extends {
      costMode: CostMode;
      standardCostPaisa: number;
      computedCostPaisa: number | null;
      minMarginBp?: number | null;
      minMarginPaisa?: number | null;
    },
  >(row: T, defaultMarkupBp = 2000) {
    const cost = this.effective(row);
    /* DEC-ITM-018 — the floor, computed in ONE place so Product, POS and this screen can
       never each round it slightly differently. Null when no rule is set: "no floor" and
       "a floor equal to cost" are different statements and must not look the same. */
    const floor =
      row.minMarginBp
        ? Math.round(cost * (1 + row.minMarginBp / 10_000))
        : row.minMarginPaisa
          ? cost + row.minMarginPaisa
          : null;

    /*  DEC-ITM-023 — the counter price, worked out in ONE place so the item screen,
        the till and every report say the same number.

          markup   = this item's own percent, else the shop default
          suggested= cost + markup            (null when there is no cost yet)
          price    = the manual override if there is one, else suggested

        A service (no purchases, cost 0) has no suggestion — its price is typed, and
        that is not a gap: nobody buys wrapping paper labour by the kilo.  */
    const r = row as T & { markupBp?: number | null; sellingPricePaisa?: number | null };
    const markupBp = r.markupBp ?? defaultMarkupBp;
    const suggested = cost > 0 ? Math.round(cost * (1 + markupBp / 10_000)) : null;
    const price = r.sellingPricePaisa ?? suggested;

    return {
      ...row,
      effectiveCostPaisa: cost,
      floorPricePaisa: floor,
      markupUsedBp: markupBp,
      suggestedSellPricePaisa: suggested,
      /** what the till charges: the override when set, otherwise cost + markup */
      effectiveSellPricePaisa: price,
      sellPriceIsManual: r.sellingPricePaisa != null,
      // ⚠️ DEC-ITM-005 — there is deliberately no stock figure here. The admin screen
      // shows "—" until the Inventory module exists.
    };
  }
}

/* DEC-ITM-013 defaults — an ingredient is bought but not sold on its own; a service is
   sold but never bought; a consumable is neither sold nor returned. Staff can override
   any of these per item; these are only the sensible starting points. */
/*  DEC-ITM-026 (owner, 20 Aug 2026) — everything in this list is for selling.
    "item mane amder sell kra lagbei" — some things are bought and resold, some are
    labour sold on its own, and the things that are NOT for sale (the shop's own AC,
    its lights) are assets, which is a different book entirely. So a new item starts
    saleable whatever its type; the switch stays for the odd exception.  */
function defaultSaleable(_t: ItemType): boolean {
  return true;
}
function defaultPurchasable(t: ItemType): boolean {
  return t !== ItemType.SERVICE;
}

/** 24000 → "24", 500 → "0.5" — display only */
function fmtQty(milli: number): string {
  const v = milli / 1000;
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
