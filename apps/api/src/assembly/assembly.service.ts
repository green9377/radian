import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { ItemsService } from '../items/items.service';
import type {
  ProductionFinishDto,
  ProductionStartDto,
  ProductionTransferDto,
  TemplateWriteDto,
} from './assembly.dto';

/*
  ASSEMBLY v2 — service layer.
  Architecture: RADIAN_ASSEMBLY_MODULE_ARCHITECTURE.md (redesign 23 Jul 2026).

  DEC-ASM-011  template is standalone (name+image+components) — NO stock touch,
               NO item link; the finished Item is chosen at TRANSFER time.
  DEC-ASM-012  WIP = "Assembly floor" warehouse; start moves components there.
  DEC-ASM-013  states IN_PROGRESS → FINISHED → TRANSFERRED (CANCELLED returns stock).
  DEC-ASM-014  who built + when + how long — pipeline owns this reporting.
  DEC-ASM-015  wasted qty entered on the finish form → real WASTAGE StockIssue.
  DEC-ASM-016  quick build = start+finish in one save (Biznify dead-chain antidote).
  ASM-RULE-002 every stock write via InventoryService, one transaction.
*/

const ENTITY = 'Assembly';

type Tx = Prisma.TransactionClient;
const asTx = (tx: unknown): Tx => tx as Tx;

function valueOf(qtyMilli: number, unitCostPaisa: number): number {
  return Math.round((qtyMilli * unitCostPaisa) / 1000);
}

const TEMPLATE_INCLUDE = {
  lines: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      componentItem: {
        select: {
          id: true, sku: true, name: true, imageUrl: true, isStockTracked: true, itemType: true,
          costMode: true, standardCostPaisa: true, computedCostPaisa: true,
          unit: { select: { name: true, shortCode: true } },
        },
      },
    },
  },
};

const PRODUCTION_INCLUDE = {
  template: { select: { id: true, name: true, imageUrl: true } },
  targetItem: { select: { id: true, sku: true, name: true, imageUrl: true, unit: { select: { shortCode: true } } } },
  lines: {
    include: {
      componentItem: {
        select: { sku: true, name: true, imageUrl: true, unit: { select: { shortCode: true } } },
      },
    },
  },
};

@Injectable()
export class AssemblyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
    private readonly items: ItemsService,
  ) {}

  /* =============================================================== helpers */

  private async nextNo(): Promise<string> {
    const last = await this.prisma.assemblyProduction.findFirst({
      where: { productionNo: { startsWith: 'PRD-' } },
      orderBy: { productionNo: 'desc' },
      select: { productionNo: true },
    });
    const n = last ? parseInt(last.productionNo.slice(4), 10) + 1 : 1;
    return `PRD-${String(n).padStart(6, '0')}`;
  }

  private async requireTemplate(id: string) {
    const t = await this.prisma.db.assemblyTemplate.findFirst({
      where: { id },
      include: TEMPLATE_INCLUDE,
    });
    if (!t) throw new NotFoundException('Template not found');
    if (!t.lines.length) throw new BadRequestException(`"${t.name}" has no components yet — edit the template first`);
    return t;
  }

  private cost(item: { costMode: string; standardCostPaisa: number; computedCostPaisa: number | null }) {
    return this.inventory.effectiveCost(item);
  }

  /* ============================================================= templates */

  /** DEC-ASM-011 — list with per-line live stock so the pipeline form can warn.
   *  The template itself never touches stock. */
  async listTemplates() {
    const templates = await this.prisma.db.assemblyTemplate.findMany({
      include: { ...TEMPLATE_INCLUDE, _count: { select: { productions: true } } },
      orderBy: { name: 'asc' },
    });
    return templates.map((t) => ({
      ...t,
      lines: t.lines.map((l) => ({
        ...l,
        unitCostPaisa: this.cost(l.componentItem),
      })),
      estCostPaisa: t.lines.reduce((s, l) => s + valueOf(l.qtyMilli, this.cost(l.componentItem)), 0),
    }));
  }

  async createTemplate(dto: TemplateWriteDto) {
    const actor = dto.actorName ?? 'Admin';
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Template name is required');
    if (!dto.lines?.length) throw new BadRequestException('At least one component is required');
    for (const l of dto.lines) {
      if (!Number.isInteger(l.qtyMilli) || l.qtyMilli <= 0) {
        throw new BadRequestException('Component qty must be positive');
      }
    }
    const created = await this.prisma.assemblyTemplate.create({
      data: {
        name,
        imageUrl: dto.imageUrl ?? null,
        note: dto.note ?? null,
        isActive: dto.isActive ?? true,
        lines: {
          create: dto.lines.map((l, i) => ({
            componentItemId: l.componentItemId,
            qtyMilli: l.qtyMilli,
            sortOrder: i,
          })),
        },
      },
    });
    await this.audit.event({
      entityType: ENTITY, entityId: created.id, kind: 'general',
      label: `Template created: ${name} (${dto.lines.length} components)`, actorName: actor,
    });
    return this.getTemplate(created.id);
  }

  async updateTemplate(id: string, dto: TemplateWriteDto) {
    const actor = dto.actorName ?? 'Admin';
    const existing = await this.prisma.db.assemblyTemplate.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Template not found');
    await this.prisma.db.$transaction(async (raw) => {
      const tx = asTx(raw);
      await tx.assemblyTemplate.update({
        where: { id },
        data: {
          name: dto.name?.trim() || existing.name,
          imageUrl: dto.imageUrl !== undefined ? dto.imageUrl : existing.imageUrl,
          note: dto.note !== undefined ? dto.note : existing.note,
          isActive: dto.isActive ?? existing.isActive,
        },
      });
      if (dto.lines) {
        if (!dto.lines.length) throw new BadRequestException('At least one component is required');
        // replace-the-set; history is safe — productions snapshot their lines
        await tx.assemblyTemplateLine.deleteMany({ where: { templateId: id } });
        await tx.assemblyTemplateLine.createMany({
          data: dto.lines.map((l, i) => ({
            templateId: id,
            componentItemId: l.componentItemId,
            qtyMilli: l.qtyMilli,
            sortOrder: i,
          })),
        });
      }
    });
    await this.audit.event({
      entityType: ENTITY, entityId: id, kind: 'general',
      label: `Template updated: ${dto.name ?? existing.name}`, actorName: actor,
    });
    return this.getTemplate(id);
  }

  async getTemplate(id: string) {
    const t = await this.prisma.db.assemblyTemplate.findFirst({ where: { id }, include: TEMPLATE_INCLUDE });
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  async deleteTemplate(id: string, actor = 'Admin') {
    const t = await this.prisma.db.assemblyTemplate.findFirst({ where: { id } });
    if (!t) throw new NotFoundException('Template not found');
    const open = await this.prisma.db.assemblyProduction.count({
      where: { templateId: id, status: { in: ['IN_PROGRESS', 'FINISHED'] } },
    });
    if (open > 0) {
      throw new BadRequestException(`"${t.name}" has ${open} open production(s) — finish or cancel them first`);
    }
    await this.prisma.assemblyTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.event({
      entityType: ENTITY, entityId: id, kind: 'general',
      label: `Template deleted: ${t.name}`, actorName: actor,
    });
    return { id, deleted: true };
  }

  /* ============================================================ productions */

  /**
   * DEC-ASM-012/016 — start a run (components → Assembly floor). Stock is
   * CHECKED and shortages are returned as warnings — never a block
   * (DEC-INV-011). `quick` finishes in the same transaction (DEC-ASM-016).
   */
  async startProduction(dto: ProductionStartDto) {
    const actor = dto.actorName ?? 'Admin';
    if (!Number.isInteger(dto.qtyMilli) || dto.qtyMilli <= 0) {
      throw new BadRequestException('Qty must be a positive integer (qtyMilli)');
    }
    const template = await this.requireTemplate(dto.templateId);
    const defaults = await this.inventory.assemblyWarehouseDefaults();
    const sourceWarehouseId = dto.sourceWarehouseId ?? defaults.componentWarehouseId;
    const floorWarehouseId = defaults.floorWarehouseId;

    // build the pick list (movable components only) + shortage warnings
    const shortages: { name: string; sku: string; needMilli: number; haveMilli: number }[] = [];
    const pickLines: {
      componentItemId: string;
      plannedQtyMilli: number;
      pickedQtyMilli: number;
      unitCostPaisa: number;
    }[] = [];
    for (const l of template.lines) {
      const comp = l.componentItem;
      if (!comp.isStockTracked || comp.itemType === 'SERVICE') continue;
      const needMilli = Math.round((l.qtyMilli * dto.qtyMilli) / 1000);
      if (needMilli <= 0) continue;
      const stock = await this.prisma.db.inventoryStock.findFirst({
        where: { itemId: comp.id, warehouseId: sourceWarehouseId },
        select: { qtyMilli: true },
      });
      const haveMilli = stock?.qtyMilli ?? 0;
      if (haveMilli < needMilli) shortages.push({ name: comp.name, sku: comp.sku, needMilli, haveMilli });
      pickLines.push({
        componentItemId: comp.id,
        plannedQtyMilli: needMilli,
        pickedQtyMilli: needMilli,
        unitCostPaisa: this.cost(comp),
      });
    }
    if (!pickLines.length) throw new BadRequestException('No stock-tracked components in this template');

    const productionNo = await this.nextNo();
    const created = await this.prisma.db.$transaction(async (raw) => {
      const tx = asTx(raw);
      const doc = await tx.assemblyProduction.create({
        data: {
          productionNo,
          templateId: template.id,
          templateName: template.name,
          qtyMilli: dto.qtyMilli,
          assignedTo: dto.assignedTo?.trim() || null,
          actor,
          startedAt: dto.startedAt ? new Date(dto.startedAt) : new Date(), // DEC-ASM-014
          sourceWarehouseId,
          floorWarehouseId,
          note: dto.note ?? null,
          lines: { create: pickLines },
        },
        include: { lines: true },
      });
      await this.inventory.postAssemblyPick(tx, {
        productionId: doc.id,
        productionNo,
        actor,
        sourceWarehouseId,
        floorWarehouseId,
        components: pickLines.map((l) => ({
          itemId: l.componentItemId,
          qtyMilli: l.pickedQtyMilli,
          unitCostPaisa: l.unitCostPaisa,
        })),
      });
      return doc;
    });

    await this.audit.event({
      entityType: ENTITY, entityId: created.id, kind: 'general',
      label: `Production ${productionNo} started: ${template.name} ×${dto.qtyMilli / 1000}${dto.assignedTo ? ` → ${dto.assignedTo}` : ''}`,
      actorName: actor,
    });

    // DEC-ASM-016 — quick build: finish in the same breath
    if (dto.quick) {
      await this.finishProduction(created.id, {
        finishedQtyMilli: dto.quick.finishedQtyMilli,
        finishedAt: dto.quick.finishedAt,
        durationMin: dto.quick.durationMin,
        lines: dto.quick.lines,
        actorName: actor,
      });
    }
    const full = await this.getProduction(created.id);
    return { ...full, shortages };
  }

  /** DEC-ASM-013/015 — finish: used consumed, wasted → StockIssue, leftovers back. */
  async finishProduction(id: string, dto: ProductionFinishDto) {
    const actor = dto.actorName ?? 'Admin';
    const doc = await this.prisma.db.assemblyProduction.findFirst({
      where: { id },
      include: { lines: true },
    });
    if (!doc) throw new NotFoundException('Production not found');
    if (doc.status !== 'IN_PROGRESS') throw new BadRequestException(`Already ${doc.status.toLowerCase()}`);
    if (!Number.isInteger(dto.finishedQtyMilli) || dto.finishedQtyMilli <= 0) {
      throw new BadRequestException('Finished qty must be positive');
    }

    const byComponent = new Map((dto.lines ?? []).map((l) => [l.componentItemId, l] as const));
    for (const l of dto.lines ?? []) {
      if (!doc.lines.some((x) => x.componentItemId === l.componentItemId)) {
        throw new BadRequestException('A line does not belong to this production');
      }
      if (l.usedQtyMilli < 0 || l.wastedQtyMilli < 0) throw new BadRequestException('Qty cannot be negative');
    }

    const finishLines = doc.lines.map((l) => {
      const input = byComponent.get(l.componentItemId);
      const used = input ? Math.min(input.usedQtyMilli, l.pickedQtyMilli) : l.pickedQtyMilli;
      const wasted = input ? Math.min(input.wastedQtyMilli, l.pickedQtyMilli - used) : 0;
      return {
        lineId: l.id,
        componentItemId: l.componentItemId,
        pickedQtyMilli: l.pickedQtyMilli,
        usedQtyMilli: used,
        wastedQtyMilli: wasted,
        unitCostPaisa: l.unitCostPaisa,
        usedValuePaisa: valueOf(used, l.unitCostPaisa),
        wastedValuePaisa: valueOf(wasted, l.unitCostPaisa),
      };
    });
    const totalUsedValuePaisa = finishLines.reduce((s, l) => s + l.usedValuePaisa, 0);
    const totalWastedValuePaisa = finishLines.reduce((s, l) => s + l.wastedValuePaisa, 0);
    const unitCostPaisa = Math.round((totalUsedValuePaisa * 1000) / dto.finishedQtyMilli);
    const finishedAt = dto.finishedAt ? new Date(dto.finishedAt) : new Date(); // DEC-ASM-014
    const durationMin =
      dto.durationMin && dto.durationMin > 0
        ? Math.round(dto.durationMin)
        : Math.max(Math.round((finishedAt.getTime() - doc.startedAt.getTime()) / 60000), 0) || null;

    await this.prisma.db.$transaction(async (raw) => {
      const tx = asTx(raw);
      const wastage = await this.inventory.postAssemblyFinish(tx, {
        productionId: doc.id,
        productionNo: doc.productionNo,
        actor,
        sourceWarehouseId: doc.sourceWarehouseId,
        floorWarehouseId: doc.floorWarehouseId,
        components: finishLines.map((l) => ({
          itemId: l.componentItemId,
          pickedQtyMilli: l.pickedQtyMilli,
          usedQtyMilli: l.usedQtyMilli,
          wastedQtyMilli: l.wastedQtyMilli,
          unitCostPaisa: l.unitCostPaisa,
        })),
      });
      for (const l of finishLines) {
        await tx.assemblyProductionLine.update({
          where: { id: l.lineId },
          data: {
            usedQtyMilli: l.usedQtyMilli,
            wastedQtyMilli: l.wastedQtyMilli,
            usedValuePaisa: l.usedValuePaisa,
            wastedValuePaisa: l.wastedValuePaisa,
          },
        });
      }
      await tx.assemblyProduction.update({
        where: { id: doc.id },
        data: {
          status: 'FINISHED',
          finishedQtyMilli: dto.finishedQtyMilli,
          finishedAt,
          durationMin,
          totalUsedValuePaisa,
          totalWastedValuePaisa,
          unitCostPaisa,
          issueId: wastage.issueId,
          note: dto.note !== undefined ? dto.note : doc.note,
        },
      });
    });

    await this.audit.event({
      entityType: ENTITY, entityId: doc.id, kind: 'general',
      label: `Production ${doc.productionNo} finished: ${doc.templateName} ×${dto.finishedQtyMilli / 1000} — ৳${(totalUsedValuePaisa / 100).toLocaleString()}${totalWastedValuePaisa > 0 ? ` (wasted ৳${(totalWastedValuePaisa / 100).toLocaleString()})` : ''}`,
      actorName: actor,
    });
    return this.getProduction(doc.id);
  }

  /** DEC-ASM-011 — transfer: NOW the owner picks the finished Item; stock lands. */
  async transferProduction(id: string, dto: ProductionTransferDto) {
    const actor = dto.actorName ?? 'Admin';
    const doc = await this.prisma.db.assemblyProduction.findFirst({ where: { id } });
    if (!doc) throw new NotFoundException('Production not found');
    if (doc.status !== 'FINISHED') {
      throw new BadRequestException(doc.status === 'TRANSFERRED' ? 'Already transferred' : 'Finish the production first');
    }
    const item = await this.prisma.db.item.findFirst({
      where: { id: dto.targetItemId },
      select: { id: true, name: true, assemblyMode: true, isStockTracked: true, itemType: true },
    });
    if (!item) throw new BadRequestException('Finished item not found');
    if (!item.isStockTracked || item.itemType === 'SERVICE' || item.assemblyMode !== 'MAKE_TO_STOCK') {
      throw new BadRequestException(
        `"${item.name}" must be a stock-tracked, "Made in advance" item to receive finished goods`,
      );
    }
    const defaults = await this.inventory.assemblyWarehouseDefaults();
    const warehouseId = dto.warehouseId ?? defaults.finishedWarehouseId;

    // on-hand BEFORE the receipt posts — the moving-average base (DEC-INV-013)
    const onHandBefore = await this.inventory.onHandMilli(item.id);

    await this.prisma.db.$transaction(async (raw) => {
      const tx = asTx(raw);
      await this.inventory.postAssemblyTransfer(tx, {
        productionId: doc.id,
        productionNo: doc.productionNo,
        actor,
        targetItemId: item.id,
        warehouseId,
        qtyMilli: doc.finishedQtyMilli,
        unitCostPaisa: doc.unitCostPaisa,
      });
      await tx.assemblyProduction.update({
        where: { id: doc.id },
        data: {
          status: 'TRANSFERRED',
          targetItemId: item.id,
          transferWarehouseId: warehouseId,
          transferredAt: new Date(),
        },
      });
    });

    /* Review find (23 Jul, delegated live verify): finished goods entered the
       LEDGER at real build cost, but Item.standardCostPaisa never followed —
       the stock board and every margin board then read tk0 for anything
       Assembly makes. Same moving average as purchase receive (DEC-PUR-005),
       through Item's own service so the DEC-ITM-008 rollup + audit fire.
       AUTO items keep recipe-owned cost. Fail-soft: a cost-update failure
       must never undo the committed transfer — it flags the timeline instead. */
    try {
      const it = await this.prisma.db.item.findFirst({
        where: { id: item.id },
        select: { costMode: true, standardCostPaisa: true },
      });
      if (it && it.costMode !== 'AUTO' && doc.finishedQtyMilli > 0) {
        const oldAvg = it.standardCostPaisa;
        const newAvg =
          onHandBefore > 0 && oldAvg > 0
            ? Math.round(
                (onHandBefore * oldAvg + doc.finishedQtyMilli * doc.unitCostPaisa) /
                  (onHandBefore + doc.finishedQtyMilli),
              )
            : doc.unitCostPaisa;
        if (newAvg !== oldAvg) {
          await this.items.update(item.id, {
            standardCostPaisa: newAvg,
            actorName: `${actor} (build cost from ${doc.productionNo})`,
          } as never);
        }
      }
    } catch (e) {
      await this.audit.event({
        entityType: ENTITY,
        entityId: doc.id,
        kind: 'system',
        label: `⚠ Item cost update failed after ${doc.productionNo} — set "${item.name}" cost by hand`,
        actorName: actor,
        note: e instanceof Error ? e.message : String(e),
      });
    }

    await this.audit.event({
      entityType: ENTITY, entityId: doc.id, kind: 'general',
      label: `Production ${doc.productionNo} transferred → ${item.name} ×${doc.finishedQtyMilli / 1000}`,
      actorName: actor,
    });
    return this.getProduction(doc.id);
  }

  /** cancel an IN_PROGRESS run — picked stock returns to the shelf. */
  async cancelProduction(id: string, actor = 'Admin') {
    const doc = await this.prisma.db.assemblyProduction.findFirst({
      where: { id },
      include: { lines: true },
    });
    if (!doc) throw new NotFoundException('Production not found');
    if (doc.status !== 'IN_PROGRESS') throw new BadRequestException('Only an in-progress run can be cancelled');

    await this.prisma.db.$transaction(async (raw) => {
      const tx = asTx(raw);
      await this.inventory.postAssemblyReturn(tx, {
        productionId: doc.id,
        productionNo: doc.productionNo,
        actor,
        sourceWarehouseId: doc.sourceWarehouseId,
        floorWarehouseId: doc.floorWarehouseId,
        components: doc.lines.map((l) => ({
          itemId: l.componentItemId,
          qtyMilli: l.pickedQtyMilli,
          unitCostPaisa: l.unitCostPaisa,
        })),
      });
      await tx.assemblyProduction.update({ where: { id: doc.id }, data: { status: 'CANCELLED' } });
    });
    await this.audit.event({
      entityType: ENTITY, entityId: doc.id, kind: 'general',
      label: `Production ${doc.productionNo} cancelled — components back to shelf`, actorName: actor,
    });
    return this.getProduction(doc.id);
  }

  async listProductions(status?: string, take = 100) {
    return this.prisma.db.assemblyProduction.findMany({
      where: status ? { status: status as never } : {},
      include: PRODUCTION_INCLUDE,
      orderBy: { startedAt: 'desc' },
      take: Math.min(take, 300),
    });
  }

  async getProduction(id: string) {
    const doc = await this.prisma.db.assemblyProduction.findFirst({
      where: { id },
      include: PRODUCTION_INCLUDE,
    });
    if (!doc) throw new NotFoundException('Production not found');
    return doc;
  }

  /* ================================================================ boards */

  /** Overview — decision-first: finished-awaiting-transfer + running first. */
  async overview() {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);

    const [running, finishedAwaiting] = await Promise.all([
      this.listProductions('IN_PROGRESS', 20),
      this.listProductions('FINISHED', 20),
    ]);
    const monthDocs = await this.prisma.db.assemblyProduction.findMany({
      where: { startedAt: { gte: monthStart }, status: { not: 'CANCELLED' } },
      select: {
        startedAt: true, finishedAt: true, status: true, qtyMilli: true, finishedQtyMilli: true,
        totalUsedValuePaisa: true, totalWastedValuePaisa: true, assignedTo: true, actor: true, durationMin: true,
        templateName: true, templateId: true,
      },
    });
    const todayDocs = monthDocs.filter((d) => d.startedAt >= dayStart);

    // DEC-ASM-014 — who is building, how much, how fast (this month)
    const perActor = new Map<string, { runs: number; piecesMilli: number; costPaisa: number; minutes: number; timed: number }>();
    for (const d of monthDocs) {
      const key = d.assignedTo || d.actor || 'Unknown';
      const row = perActor.get(key) ?? { runs: 0, piecesMilli: 0, costPaisa: 0, minutes: 0, timed: 0 };
      row.runs += 1;
      row.piecesMilli += d.finishedQtyMilli || d.qtyMilli;
      row.costPaisa += d.totalUsedValuePaisa;
      if (d.durationMin) { row.minutes += d.durationMin; row.timed += 1; }
      perActor.set(key, row);
    }
    const byActor = [...perActor.entries()]
      .map(([who, r]) => ({
        who, runs: r.runs, piecesMilli: r.piecesMilli, costPaisa: r.costPaisa,
        avgMinutes: r.timed > 0 ? Math.round(r.minutes / r.timed) : null,
      }))
      .sort((a, b) => b.runs - a.runs);

    const perTemplate = new Map<string, { name: string; runs: number; piecesMilli: number; costPaisa: number }>();
    for (const d of monthDocs) {
      const row = perTemplate.get(d.templateId) ?? { name: d.templateName, runs: 0, piecesMilli: 0, costPaisa: 0 };
      row.runs += 1;
      row.piecesMilli += d.finishedQtyMilli || d.qtyMilli;
      row.costPaisa += d.totalUsedValuePaisa;
      perTemplate.set(d.templateId, row);
    }
    const topTemplates = [...perTemplate.entries()]
      .map(([templateId, r]) => ({ templateId, ...r }))
      .sort((a, b) => b.costPaisa - a.costPaisa)
      .slice(0, 6);

    const templateCount = await this.prisma.db.assemblyTemplate.count({ where: { isActive: true } });

    return {
      kpis: {
        runningCount: running.length,
        awaitingTransferCount: finishedAwaiting.length,
        awaitingTransferValuePaisa: finishedAwaiting.reduce((s, d) => s + d.totalUsedValuePaisa, 0),
        runsToday: todayDocs.length,
        runsMonth: monthDocs.length,
        producedMonthPaisa: monthDocs.reduce((s, d) => s + d.totalUsedValuePaisa, 0),
        wastedMonthPaisa: monthDocs.reduce((s, d) => s + d.totalWastedValuePaisa, 0),
        templateCount,
      },
      noEntryToday: todayDocs.length === 0, // DEC-ASM-001 soft nudge
      running,
      finishedAwaiting,
      byActor,
      topTemplates,
    };
  }

  /** Wastage board — production wastage, in taka (owner's core ask). */
  async wastageReport(days = 30) {
    const from = new Date(Date.now() - days * 24 * 3600 * 1000);
    from.setHours(0, 0, 0, 0);
    const docs = await this.prisma.db.assemblyProduction.findMany({
      where: { finishedAt: { gte: from }, totalWastedValuePaisa: { gt: 0 } },
      include: PRODUCTION_INCLUDE,
      orderBy: { finishedAt: 'desc' },
    });
    const perComponent = new Map<string, { sku: string; name: string; imageUrl: string | null; unitShort: string; qtyMilli: number; valuePaisa: number }>();
    for (const d of docs) {
      for (const l of d.lines) {
        if (l.wastedQtyMilli <= 0) continue;
        const row = perComponent.get(l.componentItemId) ?? {
          sku: l.componentItem.sku, name: l.componentItem.name,
          imageUrl: l.componentItem.imageUrl, unitShort: l.componentItem.unit?.shortCode ?? '',
          qtyMilli: 0, valuePaisa: 0,
        };
        row.qtyMilli += l.wastedQtyMilli;
        row.valuePaisa += l.wastedValuePaisa;
        perComponent.set(l.componentItemId, row);
      }
    }
    return {
      days,
      totalWastedPaisa: docs.reduce((s, d) => s + d.totalWastedValuePaisa, 0),
      byComponent: [...perComponent.entries()]
        .map(([componentItemId, r]) => ({ componentItemId, ...r }))
        .sort((a, b) => b.valuePaisa - a.valuePaisa),
      docs,
    };
  }
}
