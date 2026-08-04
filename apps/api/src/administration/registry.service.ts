import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REGISTRY, type RegistryNode } from './registry.def';

/**
 * RegistryService — registry.def.ts-কে AccessNode টেবিলের সাথে মিলিয়ে রাখে।
 *
 * কেন টেবিল লাগে যখন ফাইলেই তালিকাটা আছে: টিকগুলো (PositionAccess) একটা key-এর
 * দিকে আঙুল তোলে, আর foreign key-র জন্য সারিটা সত্যি থাকতে হয়। আর firstSeenAt
 * ছাড়া "নতুন পর্দা এসেছে" বলা যেত না — ADM-D06-এর লাল চিহ্নের পুরো ভিত্তি ওটাই।
 *
 * প্রতিবার API চালু হলে চলে। তিনটে কাজ:
 *   ১. নতুন node → সারি বসে, firstSeenAt = আজ। কেউ পায় না যতক্ষণ না মালিক দেখেন।
 *   ২. বদলে যাওয়া label/href → হালনাগাদ হয়। টিক অক্ষত থাকে, কারণ key বদলায়নি।
 *   ৩. কোড থেকে চলে যাওয়া node → retiredAt বসে। ⚠️ সারি মোছা হয় না —
 *      পুরনো টিক আর AuditLog এখনো ওই key-এর দিকে তাকিয়ে আছে, আর ঝুলন্ত key
 *      কাউকে সাহায্য করে না। পর্দাটা ফিরে এলে retiredAt আবার null হয়ে যায়
 *      আর পুরনো টিক ঠিক যেখানে ছিল সেখানেই পাওয়া যায়।
 */
@Injectable()
export class RegistryService implements OnModuleInit {
  private readonly logger = new Logger(RegistryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const r = await this.sync();
      this.logger.log(
        `registry: ${r.total} nodes (${r.added} new, ${r.updated} changed, ${r.retired} retired, ${r.revived} back)`,
      );
    } catch (e) {
      // sync ভেঙে গেলে গোটা API নামিয়ে দেওয়া হবে না — বাকি সব module চলুক।
      // পর্দা তখন খালি দেখাবে, আর সেটা নীরব ভুলের চেয়ে ভালো।
      this.logger.error(`registry sync failed — ${(e as Error).message}`);
    }
  }

  async sync(): Promise<{
    total: number;
    added: number;
    updated: number;
    retired: number;
    revived: number;
  }> {
    const existing = await this.prisma.accessNode.findMany();
    const byKey = new Map(existing.map((n) => [n.key, n]));
    const wantedKeys = new Set(REGISTRY.map((n) => n.key));

    let added = 0;
    let updated = 0;
    let revived = 0;

    for (const want of REGISTRY) {
      const have = byKey.get(want.key);
      if (!have) {
        await this.prisma.accessNode.create({ data: this.toRow(want) });
        added++;
        continue;
      }
      const changed =
        have.label !== want.label ||
        have.href !== (want.href ?? null) ||
        have.parentKey !== want.parentKey ||
        have.domain !== want.domain ||
        have.sortOrder !== want.sortOrder;
      if (changed || have.retiredAt) {
        await this.prisma.accessNode.update({
          where: { key: want.key },
          data: { ...this.toRow(want), retiredAt: null },
        });
        if (have.retiredAt) revived++;
        else updated++;
      }
    }

    const goneKeys = existing
      .filter((n) => !wantedKeys.has(n.key) && !n.retiredAt)
      .map((n) => n.key);
    if (goneKeys.length) {
      await this.prisma.accessNode.updateMany({
        where: { key: { in: goneKeys } },
        data: { retiredAt: new Date() },
      });
    }

    return {
      total: REGISTRY.length,
      added,
      updated,
      retired: goneKeys.length,
      revived,
    };
  }

  private toRow(n: RegistryNode) {
    return {
      key: n.key,
      parentKey: n.parentKey,
      kind: n.kind,
      label: n.label,
      domain: n.domain,
      href: n.href,
      routes: [] as string[], // §৭-এর ধাপ ১-এ ভরবে
      sortOrder: n.sortOrder,
    };
  }

  /** পুরো গাছ, পর্দায় দেখানোর জন্য। অবসরপ্রাপ্ত node বাদ। */
  async tree() {
    const nodes = await this.prisma.accessNode.findMany({
      where: { retiredAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    const modules = nodes.filter((n) => n.kind === 'MODULE');
    const byParent = new Map<string, typeof nodes>();
    for (const n of nodes) {
      if (!n.parentKey) continue;
      const list = byParent.get(n.parentKey) ?? [];
      list.push(n);
      byParent.set(n.parentKey, list);
    }
    const build = (key: string): unknown[] =>
      (byParent.get(key) ?? []).map((c) => ({
        key: c.key,
        label: c.label,
        href: c.href,
        kind: c.kind,
        firstSeenAt: c.firstSeenAt,
        children: build(c.key),
      }));
    return modules.map((m) => ({
      key: m.key,
      label: m.label,
      href: m.href,
      domain: m.domain,
      kind: m.kind,
      firstSeenAt: m.firstSeenAt,
      children: build(m.key),
    }));
  }

  /**
   * ADM-D06 — যে node-গুলো এসেছে কিন্তু এখনো কোনো পদে সিদ্ধান্ত হয়নি।
   *
   * "নতুন" মানে সময় নয়, **সিদ্ধান্ত**। ছ'মাস পুরনো একটা পর্দা যেটার কথা কোনো
   * পদে কখনো লেখা হয়নি, সেটাও এখানে থাকবে — কারণ প্রশ্নটা "কবে এলো" নয়,
   * "কেউ কি কখনো এটা নিয়ে ভেবেছে"। তারিখ দিয়ে মাপলে দুই সপ্তাহ পর সতর্কতাটা
   * নিজে থেকেই মিলিয়ে যেত, আর পর্দাটা চিরকাল অদৃশ্য থাকত।
   *
   * ⚠️ উত্তরাধিকার এখানেও খাটে। উপরের module-এ সিদ্ধান্ত থাকলে ভেতরের পর্দাটা
   * সিদ্ধান্তহীন নয় — উত্তর সে পেয়ে গেছে। এটা না ধরলে প্রথম দিনেই ১৪৮টা পর্দা
   * "নতুন" বলে দেখাত, আর যে সতর্কতা সবকিছু নিয়ে চেঁচায় সেটা কেউ পড়ে না।
   */
  async undecided() {
    const nodes = await this.prisma.accessNode.findMany({
      where: { retiredAt: null },
      orderBy: { firstSeenAt: 'desc' },
    });
    const decided = await this.prisma.positionAccess.findMany({
      select: { nodeKey: true },
      distinct: ['nodeKey'],
    });
    const decidedKeys = new Set(decided.map((d) => d.nodeKey));
    const parentOf = new Map(nodes.map((n) => [n.key, n.parentKey]));

    const answered = (key: string): boolean => {
      let at: string | null | undefined = key;
      while (at) {
        if (decidedKeys.has(at)) return true;
        at = parentOf.get(at) ?? null;
      }
      return false;
    };

    return nodes
      .filter((n) => !answered(n.key))
      .map((n) => ({
        key: n.key,
        label: n.label,
        domain: n.domain,
        href: n.href,
        firstSeenAt: n.firstSeenAt,
      }));
  }
}
