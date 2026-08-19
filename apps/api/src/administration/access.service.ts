import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { REGISTRY } from './registry.def';

type LegacyRole = 'OWNER' | 'MANAGER' | 'STAFF';

/**
 * AccessService — the ONE answerer of "may this person reach this screen".
 *
 * Decision order (architecture §5). The walk goes from the node upward, and
 * **the first thing that answers is final**:
 *
 *   1. Is the position OWNER?              → then everything. Done.
 *   At every level, bottom to top:
 *     2. A personal rule for this user?    → that wins
 *     3. A rule written on the template?   → that wins
 *   4. Nothing found all the way up        → no (ADM-D06)
 *
 * Two rules fall out of this order by themselves, both the expected ones:
 *   • **specific beats vague** — a tick on finance.pnl beats the tick on
 *     finance, because it sits lower and is read first.
 *   • **person beats position at the same level** — "Rafiq is a delivery
 *     man, but let him see stock too" is one row, and every other delivery
 *     man is untouched.
 */
@Injectable()
export class AccessService implements OnModuleInit {
  private readonly logger = new Logger(AccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedStarterPositions();
    } catch (e) {
      this.logger.error(`starter positions failed — ${(e as Error).message}`);
    }
  }

  /* ------------------------------------------------------------------ *
   *  The starter positions
   * ------------------------------------------------------------------ */

  /**
   * ADM-D02 — nothing changes for anybody on day one.
   *
   * Three positions are created as exact copies of the old AppRole enum, and
   * the ticks come from what the sidebar literally said that day
   * (legacyRoles). So the day this screen went live nobody gained anything
   * and nobody lost anything — the owner reshapes them at his own pace.
   *
   * ⚠️ Rows are written only at MODULE level and where the sidebar really
   * had a rule — not for all 159 screens. The rest inherit. Writing 159
   * rows would make "store only the exceptions" a lie, and every new screen
   * would be born owing 3 × 1 rows.
   *
   * Runs once. If positions exist it does not touch them — otherwise every
   * API restart would erase the owner's own hand-made ticks.
   */
  private async seedStarterPositions(): Promise<void> {
    const already = await this.prisma.db.position.count();
    if (already > 0) return;

    const nodeCount = await this.prisma.accessNode.count();
    if (nodeCount === 0) {
      this.logger.warn('registry is empty — starter positions deferred');
      return;
    }

    const roles: LegacyRole[] = ['OWNER', 'MANAGER', 'STAFF'];
    for (const role of roles) {
      /*  Only OWNER is locked (owner's ruling, 18 Aug 2026). The starters used
          to be sealed as a bridge-era caution, but the real safety lives in
          removePosition: a template somebody still holds cannot be deleted.
          A starter the owner does not want is just a template like any other. */
      const position = await this.prisma.db.position.create({
        data: {
          name: role,
          isOwner: role === 'OWNER',
          isLocked: role === 'OWNER',
          note:
            role === 'OWNER'
              ? 'The last door into your own system — rename it freely, it cannot be deleted'
              : 'Carried over from the original three roles — rename or delete it freely',
        },
      });

      // OWNER needs no rows — isOwner opens everything (ADM-RULE-004)
      if (role === 'OWNER') continue;

      const rows = REGISTRY.filter(
        (n) => n.kind === 'MODULE' || n.legacyRoles !== null,
      ).map((n) => ({
        positionId: position.id,
        nodeKey: n.key,
        allowed: n.legacyRoles ? n.legacyRoles.includes(role) : true,
      }));

      await this.prisma.positionAccess.createMany({ data: rows });
    }
    this.logger.log('starter positions created (OWNER, MANAGER, STAFF)');
  }

  /* ------------------------------------------------------------------ *
   *  Positions
   * ------------------------------------------------------------------ */

  async positions() {
    const list = await this.prisma.db.position.findMany({
      orderBy: [{ isOwner: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { users: true, access: true } } },
    });
    return list.map((p) => ({
      id: p.id,
      name: p.name,
      note: p.note,
      isOwner: p.isOwner,
      isLocked: p.isLocked,
      people: p._count.users,
      rules: p._count.access,
    }));
  }

  async createPosition(name: string, note: string | null, actorName: string) {
    const clean = name.trim();
    if (!clean) throw new BadRequestException('A position needs a name');

    /*  ⚠️ RAW client — same trap as the email check in people.service.ts, found
     *  in the same review (30 Jul). `Position_name_key` counts soft-deleted rows,
     *  so looking through `prisma.db` hides the very row that is about to break
     *  the insert. Deleting "Accountant" and making it again died inside
     *  `create()` with a bare P2002.
     *
     *  A deleted position CAN be brought back, unlike an email address — it
     *  carries no history of its own, only ticks. So this offers that instead of
     *  refusing.
     */
    const clash = await this.prisma.position.findFirst({ where: { name: clean } });
    if (clash) {
      if (clash.deletedAt) {
        const revived = await this.prisma.db.position.update({
          where: { id: clash.id },
          data: { deletedAt: null, note },
        });
        await this.audit.record({
          entityType: 'Position',
          entityId: revived.id,
          action: 'RESTORE',
          actorName,
          changes: { name: clean, note: 'a position of this name was brought back' },
        });
        return revived;
      }
      throw new BadRequestException(`A position called "${clean}" already exists`);
    }

    const p = await this.prisma.db.position.create({
      data: { name: clean, note },
    });
    await this.audit.record({
      entityType: 'Position',
      entityId: p.id,
      action: 'CREATE',
      actorName,
      changes: { name: clean },
    });
    return p;
  }

  async renamePosition(
    id: string,
    name: string,
    note: string | null,
    actorName: string,
  ) {
    const p = await this.prisma.db.position.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('That position does not exist');

    const clean = name.trim();
    if (!clean) throw new BadRequestException('A position needs a name');

    const updated = await this.prisma.db.position.update({
      where: { id },
      data: { name: clean, note },
    });
    await this.audit.record({
      entityType: 'Position',
      entityId: id,
      action: 'UPDATE',
      actorName,
      changes: { name: { from: p.name, to: clean } },
    });
    return updated;
  }

  /**
   * ADM-RULE-004 — the OWNER position cannot be deleted.
   * A position somebody still holds cannot be deleted either: deleting it
   * would NULL their positionId and they would silently lose all access.
   * Move them first, then delete.
   */
  async removePosition(id: string, actorName: string) {
    const p = await this.prisma.db.position.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!p) throw new NotFoundException('That position does not exist');
    if (p.isOwner)
      throw new BadRequestException(
        'The OWNER position cannot be deleted — it is the last door into your own system',
      );
    if (p.isLocked)
      throw new BadRequestException(
        `"${p.name}" is one of the starting positions — it can be renamed, not removed`,
      );
    if (p._count.users > 0)
      throw new BadRequestException(
        `${p._count.users} still hold this position — move them elsewhere first`,
      );

    await this.prisma.db.position.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      entityType: 'Position',
      entityId: id,
      action: 'DELETE',
      actorName,
      changes: { name: p.name },
    });
    return { ok: true };
  }

  /* ------------------------------------------------------------------ *
   *  Ticks
   * ------------------------------------------------------------------ */

  /** every decision a position holds — { nodeKey: allowed } */
  async positionAccess(positionId: string) {
    const rows = await this.prisma.positionAccess.findMany({
      where: { positionId },
    });
    return Object.fromEntries(rows.map((r) => [r.nodeKey, r.allowed]));
  }

  /**
   * Write a decision on a node, or take it back.
   * allowed = null means "delete the row" — i.e. whatever the parent says.
   */
  async setPositionAccess(
    positionId: string,
    nodeKey: string,
    allowed: boolean | null,
    actorName: string,
  ) {
    const position = await this.prisma.db.position.findUnique({
      where: { id: positionId },
    });
    if (!position) throw new NotFoundException('That position does not exist');
    if (position.isOwner)
      throw new BadRequestException(
        'OWNER sees everything — unticking here would lock you out of your own system',
      );

    const node = await this.prisma.accessNode.findUnique({
      where: { key: nodeKey },
    });
    if (!node) throw new NotFoundException(`There is no screen called "${nodeKey}"`);

    if (allowed === null) {
      await this.prisma.positionAccess.deleteMany({
        where: { positionId, nodeKey },
      });
    } else {
      await this.prisma.positionAccess.upsert({
        where: { positionId_nodeKey: { positionId, nodeKey } },
        create: { positionId, nodeKey, allowed },
        update: { allowed },
      });
    }

    await this.audit.record({
      entityType: 'Position',
      entityId: positionId,
      action: 'UPDATE',
      actorName,
      changes: { node: nodeKey, allowed },
    });
    return { ok: true };
  }

  /* ------------------------------------------------------------------ *
   *  The verdict
   * ------------------------------------------------------------------ */

  /**
   * The final answer for every node, for one person — { key: boolean }.
   * The sidebar reads this, and the guard (§7 stage 3) reads the same.
   */
  async effectiveFor(userId: string): Promise<Record<string, boolean>> {
    const user = await this.prisma.db.appUser.findUnique({
      where: { id: userId },
      include: { position: true },
    });
    if (!user) return {};

    const nodes = await this.prisma.accessNode.findMany({
      where: { retiredAt: null },
    });

    // step 1 — OWNER gets everything
    if (user.position?.isOwner || (!user.positionId && user.role === 'OWNER')) {
      return Object.fromEntries(nodes.map((n) => [n.key, true]));
    }

    const parentOf = new Map(nodes.map((n) => [n.key, n.parentKey]));

    const overrides = new Map(
      (
        await this.prisma.userAccessOverride.findMany({ where: { userId } })
      ).map((o) => [o.nodeKey, o.allowed]),
    );

    /*  NO TEMPLATE = NOTHING — owner's ruling, 18 Aug 2026, after the rajib
        incident: an account invited without a template signed in and the
        panel opened like an owner's. The old ADM-D02 bridge (fall back to the
        legacy enum when positionId is null) was written for migration day;
        it also caught every new template-less account and handed it the
        generous legacy defaults. The bridge is retired: invites now REQUIRE
        a template, and an account without one reaches nothing until the
        owner assigns one on People & accounts. OWNER accounts are unaffected
        (handled above).  */
    const positionRules = user.positionId
      ? new Map(
          (
            await this.prisma.positionAccess.findMany({
              where: { positionId: user.positionId },
            })
          ).map((r) => [r.nodeKey, r.allowed]),
        )
      : new Map<string, boolean>();

    const out: Record<string, boolean> = {};
    for (const n of nodes) {
      let at: string | null | undefined = n.key;
      let verdict: boolean | null = null;
      while (at && verdict === null) {
        // step 2 — at the same level, person beats position
        if (overrides.has(at)) verdict = overrides.get(at)!;
        // step 3 — then the template speaks
        else if (positionRules.has(at)) verdict = positionRules.get(at)!;
        else at = parentOf.get(at) ?? null;
      }
      // step 4 — nothing found anywhere up the chain: no
      out[n.key] = verdict ?? false;
    }

    /*  THE LIFT — owner's catch, 19 Aug 2026: he allowed ONE screen inside a
        module, left the module itself on Auto, and the module vanished — the
        menu hides a module whose key answers false, and the API guard judges
        by the module key, so the one allowed screen was unreachable both
        ways. A module left on AUTO therefore counts as open when anything
        inside it is explicitly allowed. An explicit BLOCK on the module is
        untouched — "Block: you said shut" keeps meaning exactly that. The
        module's other screens are unaffected: they still inherit nothing and
        stay closed (step 4).  */
    const explicitAllow: string[] = [];
    for (const [k, v] of overrides) if (v) explicitAllow.push(k);
    for (const [k, v] of positionRules)
      if (v && !overrides.has(k)) explicitAllow.push(k);

    for (const n of nodes) {
      if (n.kind !== 'MODULE' || out[n.key]) continue;
      if (overrides.has(n.key) || positionRules.has(n.key)) continue;
      for (const k of explicitAllow) {
        let at = parentOf.get(k) ?? null;
        while (at && at !== n.key) at = parentOf.get(at) ?? null;
        if (at === n.key) { out[n.key] = true; break; }
      }
    }
    return out;
  }

  /*  legacyRules was deleted here on 18 Aug 2026 — the ADM-D02 bridge it
      served is retired (see effectiveFor). Seeding still reads legacyRoles
      from the REGISTRY to build the starter positions; that path is separate
      and untouched.  */
}
