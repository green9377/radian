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
import { InboxPresence } from './presence';
import { AiMessage, AiToolDef, providerFor } from './ai-provider';
import { ChannelSender } from '../messaging/channel-sender.service';
import { EscalationNotifier } from '../messaging/escalation-notifier.service';

/*
  AI first-responder — RADIAN_INBOX_MODULE_ARCHITECTURE.md।

  Three rulings from the owner on 5 Aug are the backbone of this file:

  DEC-INB-008 rev — presence-based: if a staff member is active in the Inbox
  the AI gives them `staffGraceSec` (30s) first; if nobody is active the AI
  answers at once. The owner: a customer should never wait three minutes for a
  reply to their first message.

  DEC-INB-009 — on an escalation the AI stays quiet first: staff are told, and
  the window is theirs. Only once it passes does the "please hold on, one of our
  experts will speak with you" line go out.

  DEC-INB-010 — it speaks as a member of the Radian team and never says "I am
  an AI/bot"; asked directly, it answers naturally as Radian support and returns
  to the work, and it invents no personal biography either. And language means
  the script too: Banglish in, Banglish out, never Bangla letters.

  The failure rule is unchanged: any exception means silence, and the thread
  goes unread to a person. The shop does not break because the AI does.
*/

const MONEY_WORDS = [
  'discount', 'refund', 'money back', 'cheaper', 'price kom', 'com dam', 'komano',
  /* Bangla money words, kept as data: this is a live matcher, not prose. */
  'ছাড়', 'ডিসকাউন্ট', 'রিফান্ড', 'টাকা ফেরত', 'কম দাম', 'দাম কম', 'কমানো',
  'chhar', 'char den', 'discount den', 'taka ferot', 'taka fert', 'kom dam', 'dam kom',
];

/** Which script the customer is writing in — for the fixed lines (DEC-INB-010). */
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
  /* The Bangla wait line is a message to a customer, not a comment. */
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

function systemPrompt(customerName: string | null, lang: Lang): string {
  /*  The first attempt only said "mirror the language" — and Haiku answered in
      Bangla script even when the customer wrote Banglish (5 Aug, the owner
      caught it). Now the server decides the script and the instruction is
      blunt; if it still comes back wrong, rescript() below fixes it in one
      pass.  */
  const langLine =
    lang === 'banglish'
      ? 'THE CUSTOMER IS WRITING ROMANISED BANGLISH. You MUST reply in Banglish using LATIN LETTERS ONLY (e.g. "Ji vai, amader kache..."). You are FORBIDDEN from using Bangla script (অ-ৎ) in this reply.'
      : lang === 'bn'
        ? 'The customer is writing in Bangla script. Reply in natural Bangla script.'
        : 'The customer is writing in English. Reply in English.';

  return [
    'You are a support person on the team of Radian — a premium flower & gift shop in Dhanmondi, Dhaka, Bangladesh.',
    'Radian delivers flowers, cakes, balloons, chocolates, gift boxes, plants and personalised gifts across Dhaka (express/same-day/midnight) and nationwide by courier.',
    '',
    'IDENTITY (DEC-INB-010, strict): You speak as a warm human member of the Radian support team. NEVER say or imply you are an AI, bot, assistant, model, or automated. If a customer asks whether you are a bot/AI, do not confirm or deny — answer naturally like "আমি Radian support থেকে বলছি 🌸" and return to helping them. Never invent a personal name, biography, or human details for yourself.',
    '',
    `LANGUAGE (strict): ${langLine}`,
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
    private readonly presence: InboxPresence,
    private readonly sender: ChannelSender,
    private readonly notifier: EscalationNotifier,
  ) {}

  /*  The clock behind DEC-INB-008/009: once a minute, look for a thread where
      a customer is waiting and the staff window has passed.  */
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

  /*  Fire-and-forget — a customer's request never breaks because of this.

      DEC-INB-008 rev (the owner, 5 Aug): a customer should never wait three
      minutes for an answer to their first message.
        - nobody active in the Inbox -> the AI answers IMMEDIATELY.
        - a staff member active -> they get `staffGraceSec` (default 30s)
          first, and the AI writes only if they do not.  */
  async respond(conversationId: string): Promise<void> {
    try {
      if (!this.presence.anyStaffActive()) {
        await this.respondInner(conversationId);
        return;
      }
      const settings = await this.prisma.db.inboxSetting.findFirst({ where: { id: 'singleton' } });
      const graceMs = Math.max(5, settings?.staffGraceSec ?? 30) * 1000;
      setTimeout(() => {
        void this.respondInner(conversationId).catch((e) =>
          this.logger.warn(
            `deferred AI reply failed ${conversationId}: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
      }, graceMs);
      /*  respondInner checks for itself whether the last message is still the
          customer's — if a staff member got there first it returns quietly. So
          the delayed path is safe.  */
    } catch (e) {
      this.logger.warn(
        `AI reply failed for ${conversationId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /* ═════════════ sweeper — nobody is left without an answer ══════════════ */

  /*  Safety net — a setTimeout lost to a deploy or restart, an escalation's
      waiting line, any thread that slipped through a gap: swept once a
      minute.  */
  private async sweep(): Promise<void> {
    const settings = await this.prisma.db.inboxSetting.findFirst({ where: { id: 'singleton' } });
    if (!settings?.aiGloballyEnabled) return;

    const graceMs = Math.max(5, settings.staffGraceSec) * 1000;
    const cutoff = new Date(Date.now() - graceMs);
    const floor = new Date(Date.now() - 24 * 60 * 60 * 1000); // not digging up old graves

    const candidates = await this.prisma.db.conversation.findMany({
      where: {
        deletedAt: null,
        /*
          No longer filtered on aiEnabled — the owner removed the per-thread
          switch on 1 Sep (see respondInner below). Kept as a comment rather
          than a filter so the sweeper and the responder cannot disagree.
        */
        status: ConversationStatus.OPEN,
        lastMessageAt: { lt: cutoff, gt: floor },
      },
      select: { id: true },
      take: 20,
    });

    for (const c of candidates) {
      try {
        await this.respondInner(c.id);
      } catch (e) {
        this.logger.warn(
          `sweep respond failed ${c.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  /* ═══════════════════ the answering engine itself ═══════════════════════ */

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
          select: { direction: true, authorType: true, body: true, createdAt: true },
        },
      },
    });
    /*
      DEC-INB-011 (the owner, 1 Sep 2026) — THE AI SWITCH IS ONE SWITCH.
      "akdom uporer off ar on sob jaygay auto kaj krbe alaadavabe jen na thake."

      This used to also read `convo.aiEnabled`, the per-thread toggle from
      DEC-INB-004. It is gone. A thread someone had quietly switched off months
      ago would stay off forever after the global switch was turned on, and
      nobody would know why that one customer never got an answer — the exact
      shape of fault this project keeps paying for.

      The column stays in the schema (nothing is destroyed) but nothing reads it
      any more. `aiGloballyEnabled`, checked above, is the only authority. This
      is house rule 15: if it is true about the SHOP, it is written once.
    */
    if (!convo) return;

    const ordered = [...convo.messages].reverse();
    const last = ordered[ordered.length - 1];
    if (!last || last.direction !== 'IN') return; // already answered, or nothing to answer

    const lang = detectLang(last.body);
    const lastStaffAt = [...ordered].reverse().find((m) => m.authorType === 'STAFF')?.createdAt;
    const escalatedUnanswered =
      convo.escalatedAt !== null &&
      (lastStaffAt === undefined || lastStaffAt < convo.escalatedAt);

    /*  DEC-INB-009 — an escalation is still open: the AI does not enter a
        conversation about money, it only says the waiting line once, in the
        customer's own script. Once a staff member answers,
        escalatedUnanswered goes false and the thread returns to normal.  */
    if (escalatedUnanswered) {
      await this.say(conversationId, WAIT_LINE[lang], {
        kind: 'wait_line', lang, escalatedAt: convo.escalatedAt,
      });
      return;
    }

    /* ── the money keyword gate, ahead of the model (INB-RULE-001) ─────── */
    const lastLower = last.body.toLowerCase();
    if (MONEY_WORDS.some((w) => lastLower.includes(w))) {
      await this.escalate(conversationId, EscalationReason.MONEY_TOPIC, settings);
      /*  DEC-INB-009 plus the owner's 30-second rule: if a staff member is
          active, stay quiet — the window is theirs. If not, the customer gets
          the reassuring line straight away.  */
      if (!this.presence.anyStaffActive()) {
        await this.say(conversationId, WAIT_LINE[lang], {
          kind: 'wait_line', lang, gate: 'keyword',
        });
      }
      return;
    }

    /* ── model + tool loop ───────────────────────────────────────────── */
    const provider = providerFor(settings.aiProvider);
    if (!provider.configured()) return;

    const history: AiMessage[] = ordered.map((m) => ({
      role: m.direction === 'IN' ? ('user' as const) : ('assistant' as const),
      content: m.body,
    }));

    const system = systemPrompt(convo.customer?.name ?? convo.guestName, lang);
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
    let reply = finalText.trim();

    /*  Script safety net — if Bangla letters come out despite Banglish being
        asked for, rescript in one pass. No tools, negligible cost; if it fails
        the original goes as it is, because the wrong script is less bad than no
        answer at all.  */
    if (lang === 'banglish' && /[ঀ-৿]/.test(reply)) {
      try {
        const { turn } = await provider.chat({
          system:
            'Rewrite the given reply in romanised Banglish using LATIN LETTERS ONLY. Keep the meaning, warmth and emoji identical. Output ONLY the rewritten reply.',
          messages: [{ role: 'user', content: reply }],
          tools: [],
          model,
          maxTokens: 700,
        });
        if (turn.text.trim() && !/[ঀ-৿]/.test(turn.text)) reply = turn.text.trim();
      } catch {
        /* the rescue failed — let the original answer go */
      }
    }

    await this.say(conversationId, reply, {
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
    const saved = await this.prisma.db.message.create({
      data: {
        conversationId,
        direction: MessageDirection.OUT,
        authorType: MessageAuthor.AI,
        body,
        aiMeta: aiMeta as Prisma.InputJsonValue,
      },
    });
    const convo = await this.prisma.db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), status: ConversationStatus.WAITING_CUSTOMER },
    });

    /*
      Web chat is polled by the customer's own browser; nothing else is.
      Without this the AI answers into a screen only staff can see, and the
      customer waits on a reply that was written and never sent.
    */
    /*  'ai-reply', not 'inbox-reply': a stuck model loops faster than a
        person types, and the limit that catches it should name the right
        sender.  */
    const r = await this.sender.send(convo, body, 'ai-reply');
    if (!r.ok && !r.skipped) {
      this.logger.warn(`AI reply not delivered for ${conversationId}: ${r.error}`);
      return;
    }
    // same self-recognition tag as inbox.ts reply() — see the comment there
    if (r.providerMessageId) {
      await this.prisma.db.message
        .update({ where: { id: saved.id }, data: { externalMessageId: r.providerMessageId } })
        .catch(() => undefined);
    }
  }

  /** INB-RULE-005 — the assignee list, or every OWNER when it is empty. The
      thread stays OPEN (so the sweeper keeps watching it) and unread goes up so
      the badge lights. */
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
    const event = await this.prisma.db.escalationEvent.create({
      data: {
        conversationId,
        reason,
        notifiedUserIds: notify as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await this.prisma.db.conversation.update({
      where: { id: conversationId },
      data: { escalatedAt: new Date(), unreadForStaff: { increment: 1 } },
    });

    /*  Rung 0 of the ladder. Awaited, not fired and forgotten: this whole
        method is already called from a background path, and a customer who
        asked for a person should not wait on the next ticker. It cannot
        throw - see escalation-notifier.service.ts.  */
    await this.notifier.notifyNew(event.id);
  }
}
