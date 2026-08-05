import { Injectable, Logger } from '@nestjs/common';
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
  AI first-responder — RADIAN_INBOX_MODULE_ARCHITECTURE.md-র "AI reply" workflow।

  ক্রমটা নকশার হুবহু:
    1. টাকার-প্রসঙ্গ keyword gate (INB-RULE-001) — model-কে ডাকার আগেই।
       Model-এর ভেতরেও escalate tool আছে — বেল্ট আর সাসপেন্ডার দুটোই।
    2. Model + tool loop (সর্বোচ্চ ৫ পাক) — সব tool শুধুই পড়ে (DEC-INB-005)।
    3. উত্তর Message(OUT, AI) — পণ্য থাকলে aiMeta.products-এ, card আঁকে widget।
    4. যেকোনো ব্যর্থতা = চুপ — thread unread থেকে মানুষের কাছে যায়। AI মরলে
       দোকান ভাঙে না; এটা নকশার exception-পথ, দুর্ঘটনা না।

  ভাষা (DEC-INB-002): system prompt-এ, hardcode-detect নয় — model-ই ভালো পারে।
*/

const MONEY_WORDS = [
  // English
  'discount', 'refund', 'money back', 'cheaper', 'price kom', 'com dam', 'komano',
  // Bangla script
  'ছাড়', 'ডিসকাউন্ট', 'রিফান্ড', 'টাকা ফেরত', 'কম দাম', 'দাম কম', 'কমানো',
  // Banglish
  'chhar', 'char den', 'discount den', 'taka ferot', 'taka fert', 'kom dam', 'dam kom',
];

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
      'Hand this conversation to a human. MUST be used for: discounts, refunds, payment disputes, delivery-time change requests, an angry customer, or anything you are not confident about. After calling it, tell the customer politely that a team member will reply shortly.',
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
    'You are the support assistant of Radian — a premium flower & gift shop in Dhanmondi, Dhaka, Bangladesh.',
    'Radian delivers flowers, cakes, balloons, chocolates, gift boxes, plants and personalised gifts across Dhaka (express/same-day/midnight) and nationwide by courier.',
    '',
    'LANGUAGE (strict): reply in the language of the customer\'s LAST message — Bangla script gets Bangla, English gets English, romanised Banglish gets Banglish. Mirror them naturally.',
    '',
    'HARD RULES (no exceptions, DEC-INB-001):',
    '- NEVER promise, offer or hint at a discount, refund, compensation, or delivery-time change. Those are human-only: call escalate(MONEY_TOPIC) and say a team member will help.',
    '- NEVER invent a product, price, stock number or delivery promise. Only repeat what tools return. Prices from tools are in paisa — show as ৳ taka (129000 → ৳1,290).',
    '- If the customer asks for a human, call escalate(CUSTOMER_ASKED_HUMAN).',
    '- If the customer is angry or upset, call escalate(ANGRY_CUSTOMER) and stay kind.',
    '- If you are not sure, escalate(LOW_CONFIDENCE) — never guess.',
    '',
    'STYLE: warm, brief (2-4 sentences), like a friendly shop assistant. One clarifying question at a time.',
    'When you show products via search_products, mention them briefly — the shop UI renders full product cards under your message automatically. Do not paste raw links.',
    customerName ? `The customer's name is ${customerName}.` : 'The customer has not shared a name.',
  ].join('\n');
}

@Injectable()
export class InboxAiAgent {
  private readonly logger = new Logger(InboxAiAgent.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: InboxAiTools,
  ) {}

  /**
   * fire-and-forget — postCustomerMessage এটা await করে না।
   * এখানকার কোনো ব্যর্থতা গ্রাহকের request-এ পৌঁছায় না।
   */
  async respond(conversationId: string): Promise<void> {
    try {
      await this.respondInner(conversationId);
    } catch (e) {
      // চুপ করে থাকা = thread unread থেকে মানুষের কাছে (নকশার exception-পথ)
      this.logger.warn(
        `AI reply failed for ${conversationId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private async respondInner(conversationId: string): Promise<void> {
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
          select: { direction: true, authorType: true, body: true },
        },
      },
    });
    if (!convo || !convo.aiEnabled) return; // DEC-INB-004 — staff-এর thread-এ AI ঢোকে না

    const provider = providerFor(settings.aiProvider);
    if (!provider.configured()) return; // key নেই = AI নীরব, মানুষ আছে

    const ordered = [...convo.messages].reverse();
    const last = ordered[ordered.length - 1];
    if (!last || last.direction !== 'IN') return; // উত্তর দেওয়ার কিছু নেই

    /* ── ধাপ ১: টাকার keyword gate — model-এর আগে (INB-RULE-001) ─────── */
    const lastLower = last.body.toLowerCase();
    if (MONEY_WORDS.some((w) => lastLower.includes(w))) {
      await this.escalate(conversationId, EscalationReason.MONEY_TOPIC, settings);
      await this.say(
        conversationId,
        /[ঀ-৿]/.test(last.body)
          ? 'এটা আমাদের টিমের একজন দেখবেন — একটু পরেই আপনাকে উত্তর দেবেন। 🌸'
          : 'One of our team members will help you with this — they will reply shortly. 🌸',
        { escalated: 'MONEY_TOPIC', provider: provider.name, gate: 'keyword' },
      );
      return;
    }

    /* ── ধাপ ২: model + tool loop ────────────────────────────────────── */
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
            products = found; // শেষ খোঁজার ফলই card হয়
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
            result = { ok: true, note: 'A human has been notified. Tell the customer politely.' };
          } else {
            result = { error: `unknown tool ${call.name}` };
          }
        } catch (e) {
          result = { error: e instanceof Error ? e.message : 'tool failed' };
        }
        transcript = provider.toolResult(transcript, call, result);
      }
    }

    if (!finalText.trim()) return; // model কিছুই বলল না — মানুষের কাছে থাক

    await this.say(conversationId, finalText.trim(), {
      provider: provider.name,
      model,
      toolsUsed,
      ...(escalated ? { escalated } : {}),
      ...(products.length ? { products } : {}),
    });
  }

  /** AI-র উত্তর জমা — গ্রাহকের widget পরের poll-এই পেয়ে যায় */
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

  /** INB-RULE-005 — কার কাছে খবর যায়: assignee-তালিকা, খালি হলে সব OWNER */
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
