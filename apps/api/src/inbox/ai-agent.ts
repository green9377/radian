import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConversationStatus,
  EscalationReason,
  MessageAuthor,
  MessageDirection,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxAiTools, ToolProduct } from './ai-tools';
import { AiMessage, AiToolDef, providerFor } from './ai-provider';

/*
  AI first-responder — RADIAN_INBOX_MODULE_ARCHITECTURE.md।

  মালিকের ৫ আগস্টের তিন রায় এই ফাইলের মেরুদণ্ড:

  DEC-INB-008 — staff reply AI-কে মারে না, শুধু অগ্রাধিকার নেয়। Staff-ছোঁয়া
  thread-এ নতুন গ্রাহক-message এলে AI `staffGraceMin` মিনিট অপেক্ষা করে;
  staff না এলে sweeper তাকে দিয়ে উত্তর দেওয়ায়। কেউ উত্তরহীন থাকে না।

  DEC-INB-009 — escalation-এ AI আগে চুপ: staff-কে খবর, জানালাটা তাদের।
  জানালা পেরোলে তখনই "একটু অপেক্ষা করুন — আমাদের একজন expert…" লাইনটা।

  DEC-INB-010 — সে Radian টিমের একজন, কখনোই "আমি AI/bot" নয়; জিজ্ঞেস করলে
  স্বাভাবিকভাবে "Radian support" বলে কাজের কথায় ফেরে — মিথ্যা জীবনীও বানায়
  না। আর ভাষা মানে হরফসহ: Banglish পেলে Banglish-এই, বাংলা হরফে নয়।

  ব্যর্থতার নীতি আগের মতোই: যেকোনো exception = নীরবতা; thread unread হয়ে
  মানুষের কাছে। AI মরলে দোকান ভাঙে না।
*/

const MONEY_WORDS = [
  'discount', 'refund', 'money back', 'cheaper', 'price kom', 'com dam', 'komano',
  'ছাড়', 'ডিসকাউন্ট', 'রিফান্ড', 'টাকা ফেরত', 'কম দাম', 'দাম কম', 'কমানো',
  'chhar', 'char den', 'discount den', 'taka ferot', 'taka fert', 'kom dam', 'dam kom',
];

/** কোন হরফ/ভাষায় লিখছে — ধরা-বাঁধা লাইনগুলোর জন্য (DEC-INB-010) */
type Lang = 'bn' | 'banglish' | 'en';
function detectLang(text: string): Lang {
  if (/[ঀ-৿]/.test(text)) return 'bn';
  const banglishHints = [
    'ami', 'amar', 'apn', 'vai', 'bhai', 'koi', 'kmn', 'kemon', 'krbo', 'krlm',
    'kore', 'kre', 'dibo', 'diben', 'niben', 'nibo', 'taka', 'tk', 'ache', 'nai',
    'hobe', 'hbe', 'jabe', 'chai', 'dekhan', 'dekhaw', 'koto', 'kto',
  ];
  const words = text.toLowerCase().split(/[^a-z]+/);
  const hits = words.filter((w) => banglishHints.includes(w)).length;
  return hits >= 2 ? 'banglish' : 'en';
}

const WAIT_LINE: Record<Lang, string> = {
  bn: 'একটু অপেক্ষা করুন — আমাদের একজন expert আপনার সাথে কথা বলবেন। 🌸',
  banglish: 'Ektu wait koren — amader ekjon expert apnar sathe kotha bolben. 🌸',
  en: 'Please hold on a moment — one of our experts will be with you shortly. 🌸',
};

const TOOLS: AiToolDef[] = [
  {
    name: 'search_products',
    description:
      'Search the published catalog. Use for any product/gift/budget question. Prices are in paisa (129000 = ৳1290).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'free text, e.g. "rose bouquet"' },
        budgetMinPaisa: { type: 'number' },
        budgetMaxPaisa: { type: 'number', description: '৳2000 budget → 200000' },
        categorySlug: {
          type: 'string',
          description: 'flowers | cakes | balloons | chocolates | giftboxes | combos | plants | personalised',
        },
        occasionSlug: {
          type: 'string',
          description: 'love | anniversary | birthday | congratulations | corporate | get-well | sorry | just-because',
        },
        limit: { type: 'number', description: 'default 6, max 10' },
      },
    },
  },
  {
    name: 'order_status',
    description: 'Look up order(s) by order number (RAD-xxxxx) or customer phone. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        orderNo: { type: 'string' },
        phone: { type: 'string' },
      },
    },
  },
  {
    name: 'delivery_info',
    description: 'Active delivery methods, zones, fees and cut-off times.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'shop_info',
    description: 'Published FAQ entries and policy pages (returns, delivery info etc).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'escalate',
    description:
      'Hand this conversation to a senior colleague. MUST be used for: discounts, refunds, payment disputes, delivery-time change requests, an angry customer, or anything you are not confident about. After calling it, do NOT answer the substance — just warmly say a colleague will be with them shortly.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: ['MONEY_TOPIC', 'LOW_CONFIDENCE', 'CUSTOMER_ASKED_HUMAN', 'ANGRY_CUSTOMER', 'OFF_SCRIPT'],
        },
      },
      required: ['reason'],
    },
  },
];

function systemPrompt(customerName: string | null): string {
  return [
    'You are a support person on the team of Radian — a premium flower & gift shop in Dhanmondi, Dhaka, Bangladesh.',
    'Radian delivers flowers, cakes, balloons, chocolates, gift boxes, plants and personalised gifts across Dhaka (express/same-day/midnight) and nationwide by courier.',
    '',
    'IDENTITY (DEC-INB-010, strict): You speak as a warm human member of the Radian support team. NEVER say or imply you are an AI, bot, assistant, model, or automated. If a customer asks whether you are a bot/AI, do not confirm or deny — answer naturally like "আমি Radian support থেকে বলছি 🌸" and return to helping them. Never invent a personal name, biography, or human details for yourself.',
    '',
    'LANGUAGE (strict, script matters): mirror the customer\'s LAST message exactly —',
    '- Bangla script (আমার) → reply in Bangla script.',
    '- Romanised Banglish (amar, apnader, koto) → reply in Banglish written in LATIN letters. Do NOT switch to Bangla script.',
    '- English → reply in English.',
    '',
    'HARD RULES (no exceptions, DEC-INB-001):',
    '- NEVER promise, offer or hint at a discount, refund, compensation, or delivery-time change. Call escalate(MONEY_TOPIC) and warmly say a colleague will help shortly.',
    '- NEVER invent a product, price, stock number or delivery promise. Only repeat what tools return. Prices from tools are in paisa — show as ৳ taka (129000 → ৳1,290).',
    '- Customer asks for a human → escalate(CUSTOMER_ASKED_HUMAN). Angry/upset → escalate(ANGRY_CUSTOMER), stay kind. Not sure → escalate(LOW_CONFIDENCE), never guess.',
    '',
    'STYLE: warm, brief (2-4 sentences), like a friendly shop colleague. One clarifying question at a time.',
    'When you show products via search_products, mention them briefly — the shop UI renders full product cards under your message automatically. Do not paste raw links.',
    customerName ? `The customer's name is ${customerName}.` : 'The customer has not shared a name.',
  ].join('\n');
}

@Injectable()
export class InboxAiAgent implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboxAiAgent.name);
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: InboxAiTools,
  ) {}

  /*  DEC-INB-008/009-এর ঘড়ি: প্রতি মিনিটে একবার দেখা — কোন thread-এ গ্রাহক
      অপেক্ষায় আছে আর staff-এর জানালা পেরিয়ে গেছে।  */
  onModuleInit() {
    this.sweepTimer = setInterval(() => {
      void this.sweep().catch((e) =>
        this.logger.warn(`sweep failed: ${e instanceof Error ? e.message : String(e)}`),
      );
    }, 60_000);
  }
  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /** fire-and-forget — গ্রাহকের request এতে কখনো ভাঙে না */
  async respond(conversationId: string): Promise<void> {
    try {
      await this.respondInner(conversationId, { fromSweeper: false });
    } catch (e) {
      this.logger.warn(
        `AI reply failed for ${conversationId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /* ═══════════════ sweeper — কেউ উত্তরহীন থাকবে না ═══════════════ */

  private async sweep(): Promise<void> {
    const settings = await this.prisma.db.inboxSetting.findFirst({ where: { id: 'singleton' } });
    if (!settings?.aiGloballyEnabled) return;

    const graceMs = Math.max(1, settings.staffGraceMin) * 60_000;
    const cutoff = new Date(Date.now() - graceMs);
    const floor = new Date(Date.now() - 24 * 60 * 60 * 1000); // পুরনো কবর খোঁড়া নয়

    const candidates = await this.prisma.db.conversation.findMany({
      where: {
        deletedAt: null,
        aiEnabled: true, // মালিকের hard-off সম্মানিত
        status: ConversationStatus.OPEN,
        lastMessageAt: { lt: cutoff, gt: floor },
      },
      select: { id: true },
      take: 20,
    });

    for (const c of candidates) {
      try {
        await this.respondInner(c.id, { fromSweeper: true });
      } catch (e) {
        this.logger.warn(
          `sweep respond failed ${c.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  /* ═══════════════ মূল উত্তর-যন্ত্র ═══════════════ */

  private async respondInner(
    conversationId: string,
    opts: { fromSweeper: boolean },
  ): Promise<void> {
    const settings = await this.prisma.db.inboxSetting.findFirst({ where: { id: 'singleton' } });
    if (!settings?.aiGloballyEnabled) return;

    const convo = await this.prisma.db.conversation.findFirst({
      where: { id: conversationId, deletedAt: null },
      include: {
        customer: { select: { name: true, phone: true } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 16,
          select: { direction: true, authorType: true, body: true, createdAt: true },
        },
      },
    });
    if (!convo || !convo.aiEnabled) return;

    const ordered = [...convo.messages].reverse();
    const last = ordered[ordered.length - 1];
    if (!last || last.direction !== 'IN') return; // উত্তর হয়ে গেছে / দেওয়ার কিছু নেই

    const lang = detectLang(last.body);
    const staffTouched = ordered.some((m) => m.authorType === 'STAFF');
    const lastStaffAt = [...ordered].reverse().find((m) => m.authorType === 'STAFF')?.createdAt;
    const escalatedUnanswered =
      convo.escalatedAt !== null &&
      (lastStaffAt === undefined || lastStaffAt < convo.escalatedAt);

    /*  DEC-INB-008 — staff-ছোঁয়া thread-এ তাৎক্ষণিক পথ থেমে যায়;
        জানালা পেরোলে sweeper-ই এখানে ফিরবে fromSweeper=true নিয়ে।  */
    if (!opts.fromSweeper && (staffTouched || escalatedUnanswered)) return;

    /*  DEC-INB-009 — escalation ঝুলে আছে, জানালাও পেরিয়েছে (sweeper-পথ):
        উত্তরের বদলে অপেক্ষার লাইনটা, গ্রাহকের হরফে।  */
    if (escalatedUnanswered) {
      await this.say(conversationId, WAIT_LINE[lang], {
        kind: 'wait_line', lang, escalatedAt: convo.escalatedAt,
      });
      return;
    }

    /* ── টাকার keyword gate — model-এর আগে (INB-RULE-001) ────────────── */
    const lastLower = last.body.toLowerCase();
    if (MONEY_WORDS.some((w) => lastLower.includes(w))) {
      /*  DEC-INB-009: এখন চুপ — staff-কে খবর; জানালা পেরোলে sweeper
          অপেক্ষার লাইনটা বলবে।  */
      await this.escalate(conversationId, EscalationReason.MONEY_TOPIC, settings);
      return;
    }

    /* ── model + tool loop ───────────────────────────────────────────── */
    const provider = providerFor(settings.aiProvider);
    if (!provider.configured()) return;

    const history: AiMessage[] = ordered.map((m) => ({
      role: m.direction === 'IN' ? ('user' as const) : ('assistant' as const),
      content: m.body,
    }));

    const system = systemPrompt(convo.customer?.name ?? convo.guestName);
    const model = settings.aiModel;
    let transcript: unknown[] | undefined;
    let products: ToolProduct[] = [];
    const toolsUsed: string[] = [];
    let escalated: EscalationReason | null = null;
    let finalText = '';

    for (let hop = 0; hop < 5; hop++) {
      const { turn, transcript: t } = await provider.chat({
        system,
        messages: history,
        tools: TOOLS,
        transcript,
        model,
        maxTokens: 700,
      });
      transcript = t;
      if (turn.text) finalText = turn.text;

      if (turn.stop !== 'tool_use' || turn.toolCalls.length === 0) break;

      for (const call of turn.toolCalls) {
        toolsUsed.push(call.name);
        let result: unknown;
        try {
          if (call.name === 'search_products') {
            const found = await this.tools.searchProducts(call.args);
            products = found;
            result = { products: found };
          } else if (call.name === 'order_status') {
            result = await this.tools.orderStatus(call.args as { orderNo?: string; phone?: string });
          } else if (call.name === 'delivery_info') {
            result = await this.tools.deliveryInfo();
          } else if (call.name === 'shop_info') {
            result = await this.tools.shopInfo();
          } else if (call.name === 'escalate') {
            const reason =
              (call.args.reason as EscalationReason) ?? EscalationReason.LOW_CONFIDENCE;
            escalated = reason;
            await this.escalate(conversationId, reason, settings);
            result = {
              ok: true,
              note: 'A colleague has been notified. Warmly tell the customer someone will be with them shortly — do not answer the substance.',
            };
          } else {
            result = { error: `unknown tool ${call.name}` };
          }
        } catch (e) {
          result = { error: e instanceof Error ? e.message : 'tool failed' };
        }
        transcript = provider.toolResult(transcript, call, result);
      }
    }

    if (!finalText.trim()) return;

    await this.say(conversationId, finalText.trim(), {
      provider: provider.name,
      model,
      toolsUsed,
      lang,
      ...(escalated ? { escalated } : {}),
      ...(products.length ? { products } : {}),
    });
  }

  private async say(
    conversationId: string,
    body: string,
    aiMeta: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.db.message.create({
      data: {
        conversationId,
        direction: MessageDirection.OUT,
        authorType: MessageAuthor.AI,
        body,
        aiMeta: aiMeta as Prisma.InputJsonValue,
      },
    });
    await this.prisma.db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), status: ConversationStatus.WAITING_CUSTOMER },
    });
  }

  /** INB-RULE-005 — assignee-তালিকা, খালি হলে সব OWNER; thread OPEN-ই থাকে
      (sweeper-এর নজরে), unread বাড়ে যাতে badge জ্বলে */
  private async escalate(
    conversationId: string,
    reason: EscalationReason,
    settings: { escalationAssigneeIds: Prisma.JsonValue },
  ): Promise<void> {
    const listed = Array.isArray(settings.escalationAssigneeIds)
      ? (settings.escalationAssigneeIds as string[])
      : [];
    let notify = listed;
    if (notify.length === 0) {
      const owners = await this.prisma.db.appUser.findMany({
        where: { role: 'OWNER', deletedAt: null, isActive: true },
        select: { id: true },
      });
      notify = owners.map((o) => o.id);
    }
    await this.prisma.db.escalationEvent.create({
      data: {
        conversationId,
        reason,
        notifiedUserIds: notify as Prisma.InputJsonValue,
      },
    });
    await this.prisma.db.conversation.update({
      where: { id: conversationId },
      data: { escalatedAt: new Date(), unreadForStaff: { increment: 1 } },
    });
  }
}
