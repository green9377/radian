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
 * AccessService — "এই মানুষ এই পর্দাটা পাবে কি না" এর একমাত্র উত্তরদাতা।
 *
 * সিদ্ধান্তের ক্রম (architecture §৫)। node থেকে উপরে হাঁটা হয়, আর **প্রথম যেটা
 * উত্তর দেয় সেটাই চূড়ান্ত**:
 *
 *   ১. পদ কি OWNER?                    → হ্যাঁ হলে সব। শেষ।
 *   প্রতিটা স্তরে, নিচ থেকে উপরে:
 *     ২. এই ব্যক্তির আলাদা নিয়ম?        → থাকলে সেটাই
 *     ৩. পদের ছাঁচে লেখা আছে?           → থাকলে সেটাই
 *   ৪. উপরে উঠতে উঠতে কিছুই না পেলে     → না (ADM-D06)
 *
 * দুটো নিয়ম এই ক্রম থেকে আপনা থেকেই বেরোয়, আর দুটোই যা আশা করা যায় তাই:
 *   • **নির্দিষ্ট জিনিস অস্পষ্টকে হারায়** — finance.pnl-এ টিক finance-এর টিককে
 *     হারাবে, কারণ সে নিচে, তাই আগে পড়া হয়।
 *   • **একই স্তরে ব্যক্তি পদকে হারায়** — "রফিক ডেলিভারির লোক, কিন্তু ওকে
 *     স্টকটাও দেখতে দাও" এক সারিতে হয়ে যায়, আর বাকি ডেলিভারির লোকেরা অক্ষত থাকে।
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
   *  শুরুর তিনটে পদ
   * ------------------------------------------------------------------ */

  /**
   * ADM-D02 — প্রথম দিন কারও কিছু বদলাবে না।
   *
   * তিনটে পদ বানানো হয় আজকের AppRole enum-এর হুবহু নকল হিসেবে, আর টিকগুলো
   * সাইডবারে আজ যা লেখা আছে ঠিক সেখান থেকেই আসে (legacyRoles)। এর মানে
   * পর্দা চালু হওয়ার দিন কেউ নতুন কিছু পায় না, কেউ কিছু হারায় না —
   * তারপর মালিক ধীরে ধীরে নিজের মতো সাজাবেন।
   *
   * ⚠️ শুধু MODULE স্তরে আর যেখানে সাইডবারে সত্যিই নিয়ম লেখা আছে সেখানে সারি
   * বসে — ১৫৯টায় নয়। বাকিরা উত্তরাধিকারে পায়। ১৫৯টা সারি বসালে "শুধু
   * ব্যতিক্রম রাখা"র পুরো কথাটাই মিথ্যে হয়ে যেত, আর প্রতিটা নতুন পর্দা
   * ৩ × ১টা সারির ঋণ নিয়ে জন্মাত।
   *
   * একবারই চলে। পদ থাকলে হাত দেয় না — নইলে প্রতিবার API চালু হলে মালিকের
   * নিজের হাতে করা টিক মুছে যেত।
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
      const position = await this.prisma.db.position.create({
        data: {
          name: role,
          isOwner: role === 'OWNER',
          isLocked: true,
          note: 'Carried over from the original three roles — rename it freely, it cannot be deleted',
        },
      });

      // OWNER-এর কোনো সারি লাগে না — isOwner সব খুলে দেয় (ADM-RULE-004)
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
   *  পদ
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
   * ADM-RULE-004 — OWNER পদ মোছা যায় না।
   * আর কেউ ওই পদে থাকলে অন্য পদগুলোও মোছা যায় না: মুছে দিলে তাদের positionId
   * NULL হয়ে যেত আর তারা নীরবে সব অ্যাক্সেস হারাত। আগে সরাতে হবে, তারপর মুছতে।
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
   *  টিক
   * ------------------------------------------------------------------ */

  /** একটা পদের সব সিদ্ধান্ত — { nodeKey: allowed } */
  async positionAccess(positionId: string) {
    const rows = await this.prisma.positionAccess.findMany({
      where: { positionId },
    });
    return Object.fromEntries(rows.map((r) => [r.nodeKey, r.allowed]));
  }

  /**
   * একটা node-এ সিদ্ধান্ত বসানো বা তুলে নেওয়া।
   * allowed = null মানে "সারিটা মুছে দাও" — অর্থাৎ উপরের যা বলে তাই (উত্তরাধিকার)।
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
   *  হিসাব
   * ------------------------------------------------------------------ */

  /**
   * একজন মানুষের জন্য প্রতিটা node-এর চূড়ান্ত উত্তর — { key: boolean }।
   * সাইডবার এটা পড়ে, আর §৭-এর ধাপ ৩-এ পাহারাও এটাই পড়বে।
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

    // ধাপ ১ — OWNER সব পায়
    if (user.position?.isOwner || (!user.positionId && user.role === 'OWNER')) {
      return Object.fromEntries(nodes.map((n) => [n.key, true]));
    }

    const parentOf = new Map(nodes.map((n) => [n.key, n.parentKey]));

    const overrides = new Map(
      (
        await this.prisma.userAccessOverride.findMany({ where: { userId } })
      ).map((o) => [o.nodeKey, o.allowed]),
    );

    const positionRules = user.positionId
      ? new Map(
          (
            await this.prisma.positionAccess.findMany({
              where: { positionId: user.positionId },
            })
          ).map((r) => [r.nodeKey, r.allowed]),
        )
      : /*  ADM-D02-এর সেতু: পদ না বসানো পর্যন্ত পুরনো enum-ই চলবে। এই ডালটা
            না থাকলে migration-এর দিন প্রত্যেকে সব হারাত, কারণ কারও positionId
            নেই। enum বাদ দেওয়ার দিন এটাও যাবে।  */
        this.legacyRules(user.role as LegacyRole);

    const out: Record<string, boolean> = {};
    for (const n of nodes) {
      let at: string | null | undefined = n.key;
      let verdict: boolean | null = null;
      while (at && verdict === null) {
        // ধাপ ২ — একই স্তরে ব্যক্তি পদকে হারায়
        if (overrides.has(at)) verdict = overrides.get(at)!;
        // ধাপ ৩
        else if (positionRules.has(at)) verdict = positionRules.get(at)!;
        else at = parentOf.get(at) ?? null;
      }
      // ধাপ ৪ — কিছুই না পেলে না
      out[n.key] = verdict ?? false;
    }
    return out;
  }

  private legacyRules(role: LegacyRole): Map<string, boolean> {
    return new Map(
      REGISTRY.filter((n) => n.kind === 'MODULE' || n.legacyRoles !== null).map(
        (n) => [n.key, n.legacyRoles ? n.legacyRoles.includes(role) : true],
      ),
    );
  }
}
