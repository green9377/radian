import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ConversationStatus,
  InboxChannel,
  MessageAuthor,
  MessageDirection,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { ensureSingleton } from '../common/singleton';
import { Public } from '../auth/auth.guard';
import { InboxAiTools } from './ai-tools';
import { InboxAiAgent } from './ai-agent';
import { InboxPresence } from './presence';
import { MessagingModule } from '../messaging/messaging.controller';
import { ChannelSender } from '../messaging/channel-sender.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  INBOX — Phase 1 (web live chat, মানুষ উত্তর দেয়)।
  RADIAN_INBOX_MODULE_ARCHITECTURE.md · DEC-INB-001…006

  Phase 1-এ AI নেই — `InboxSetting.aiGloballyEnabled` জন্ম থেকেই false।
  তবু `Conversation.aiEnabled` আর INB-RULE-003 (staff লিখলেই off) আজই কাজ
  করে, যাতে Phase 2-তে AI নামলে হাতবদলের নিয়মটা আগে থেকেই প্রমাণিত থাকে।

  WEB_CHAT-এর পরিচয় = `clientKey` (ব্রাউজারের localStorage-এ থাকা secret)।
  যার হাতে key, thread টা তার — গ্রাহকের কোনো login লাগে না (DEC-INB-006-এর
  guest পথ)। Login-করা গ্রাহক: storefront নিজের session থেকে name/phone
  পাঠায়, INB-RULE-007 তাকে Customer-এর সাথে জুড়ে দেয়।
  ═══════════════════════════════════════════════════════════════════════════
*/

const ENTITY = 'Conversation';

/** guard যা বসায় (auth.guard.ts:60) — controller-এ actor পড়ার জন্য */
interface ActorRequest {
  actor?: { id: string; name: string; role: string };
}

/** "01712345678" → "+8801712345678" — Customer.phone-এর ঘরের রূপ (INB-RULE-007) */
function normalizeBdPhone(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, '');
  if (/^01\d{9}$/.test(digits)) return `+880${digits.slice(1)}`;
  if (/^8801\d{9}$/.test(digits)) return `+${digits}`;
  return digits;
}

/** BD সময়ে এখন মধ্যরাত থেকে কত মিনিট — INB-RULE-008-এর ঘড়ি */
const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
function bdMinutesNow(): number {
  const bd = new Date(Date.now() + BD_OFFSET_MS);
  return bd.getUTCHours() * 60 + bd.getUTCMinutes();
}

interface StartChatDto {
  name?: string;
  phone?: string;
}
interface PostMessageDto {
  conversationId: string;
  clientKey: string;
  body: string;
}
interface IdentifyDto {
  conversationId: string;
  clientKey: string;
  name?: string;
  phone?: string;
}
interface ReplyDto {
  body: string;
}
interface SettingsDto {
  aiGloballyEnabled?: boolean;
  aiDefaultForNew?: boolean;
  aiProvider?: 'ANTHROPIC' | 'OPENAI';
  aiModel?: string;
  staffGraceSec?: number;
  escalationAssigneeIds?: string[];
  supportOpenMin?: number;
  supportCloseMin?: number;
  offHoursMessage?: string;
  reopenWindowDays?: number;
  webChatEnabled?: boolean;
}

@Injectable()
export class InboxService {
  private readonly log = new Logger('Inbox');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ai: InboxAiAgent,
    private readonly sender: ChannelSender,
  ) {}

  /* ── settings (singleton, ঘরের ensureSingleton ধাঁচ) ─────────────────── */

  settings() {
    return ensureSingleton(
      () => this.prisma.db.inboxSetting.findFirst({ where: { id: 'singleton' } }),
      () => this.prisma.db.inboxSetting.create({ data: { id: 'singleton' } }),
    );
  }

  async updateSettings(dto: SettingsDto, actorName: string) {
    const s = await this.settings();
    const updated = await this.prisma.db.inboxSetting.update({
      where: { id: s.id },
      data: {
        aiGloballyEnabled: dto.aiGloballyEnabled,
        aiDefaultForNew: dto.aiDefaultForNew,
        aiProvider: dto.aiProvider,
        aiModel: dto.aiModel,
        staffGraceSec: dto.staffGraceSec,
        escalationAssigneeIds: dto.escalationAssigneeIds as Prisma.InputJsonValue | undefined,
        supportOpenMin: dto.supportOpenMin,
        supportCloseMin: dto.supportCloseMin,
        offHoursMessage: dto.offHoursMessage,
        reopenWindowDays: dto.reopenWindowDays,
        webChatEnabled: dto.webChatEnabled,
      },
    });
    await this.audit.record({
      entityType: 'InboxSetting',
      entityId: s.id,
      action: 'UPDATE',
      actorName,
      changes: dto as Record<string, unknown>,
    });
    return updated;
  }

  /* ── গ্রাহকের দিক (public) ───────────────────────────────────────────── */

  async startChat(dto: StartChatDto) {
    const s = await this.settings();
    if (!s.webChatEnabled) throw new BadRequestException('Chat is switched off right now');

    const phone = dto.phone?.trim() ? normalizeBdPhone(dto.phone) : null;
    // INB-RULE-007 — ফোন মিললে FK, কপি নয়
    const customer = phone
      ? await this.prisma.db.customer.findFirst({ where: { phone }, select: { id: true, name: true } })
      : null;

    const convo = await this.prisma.db.conversation.create({
      data: {
        channel: InboxChannel.WEB_CHAT,
        guestName: dto.name?.trim() || null,
        guestPhone: phone,
        customerId: customer?.id ?? null,
        aiEnabled: s.aiDefaultForNew,
      },
    });

    await this.maybeOffHoursLine(convo.id, s);
    return this.publicView(convo.id, convo.clientKey);
  }

  /** clientKey না মিললে thread-টা এই ব্রাউজারের নয় — এক শব্দও ফাঁস হবে না */
  private async ownedConversation(conversationId: string, clientKey: string) {
    const convo = await this.prisma.db.conversation.findFirst({
      where: { id: conversationId, deletedAt: null },
    });
    if (!convo || convo.clientKey !== clientKey) throw new ForbiddenException('Not your conversation');
    return convo;
  }

  async postCustomerMessage(dto: PostMessageDto) {
    const body = dto.body?.trim();
    if (!body) throw new BadRequestException('Empty message');
    if (body.length > 2000) throw new BadRequestException('Message too long');

    const convo = await this.ownedConversation(dto.conversationId, dto.clientKey);
    const s = await this.settings();

    /*  INB-RULE-006 — পুরনো RESOLVED thread window-এর ভেতরে হলে নতুন
        message-এ আবার খোলে; বাইরে হলেও এই একই thread-ই খোলে (WEB_CHAT-এ
        ব্রাউজার-key-ই পরিচয়, নতুন thread মানে গ্রাহকের ইতিহাস হারানো)।  */
    await this.prisma.db.message.create({
      data: {
        conversationId: convo.id,
        direction: MessageDirection.IN,
        authorType: MessageAuthor.CUSTOMER,
        body,
      },
    });
    await this.prisma.db.conversation.update({
      where: { id: convo.id },
      data: {
        status: ConversationStatus.OPEN,
        lastMessageAt: new Date(),
        unreadForStaff: { increment: 1 },
      },
    });

    await this.maybeOffHoursLine(convo.id, s);

    /*  Phase 2 — AI জাগে এখানে, কিন্তু await নয়: গ্রাহকের request সাথে সাথে
        ফেরে, উত্তরটা সে পরের poll-এ (৪ সে) পায়। Agent-এর ভেতরের সব ব্যর্থতা
        সেখানেই গেলা হয় — এই request কখনো তাতে ভাঙে না।  */
    void this.ai.respond(convo.id);

    return this.publicView(convo.id, convo.clientKey);
  }

  /** DEC-INB-006 — guest পরে নাম/ফোন দিলে thread পিছন থেকে জুড়ে যায় */
  async identify(dto: IdentifyDto) {
    const convo = await this.ownedConversation(dto.conversationId, dto.clientKey);
    const phone = dto.phone?.trim() ? normalizeBdPhone(dto.phone) : null;
    const customer = phone
      ? await this.prisma.db.customer.findFirst({ where: { phone }, select: { id: true } })
      : null;
    await this.prisma.db.conversation.update({
      where: { id: convo.id },
      data: {
        guestName: dto.name?.trim() || convo.guestName,
        guestPhone: phone ?? convo.guestPhone,
        customerId: customer?.id ?? convo.customerId,
      },
    });
    return this.publicView(convo.id, convo.clientKey);
  }

  /** poll — গ্রাহকের ব্রাউজার কয়েক সেকেন্ড পরপর এটাই ডাকে */
  async publicView(conversationId: string, clientKey: string) {
    const convo = await this.ownedConversation(conversationId, clientKey);
    const messages = await this.prisma.db.message.findMany({
      where: { conversationId: convo.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true, direction: true, authorType: true, body: true, createdAt: true,
        aiMeta: true,
      },
    });
    return {
      conversationId: convo.id,
      clientKey: convo.clientKey,
      status: convo.status,
      guestName: convo.guestName,
      identified: Boolean(convo.guestPhone || convo.customerId),
      messages: messages.map((m) => {
        /*  aiMeta-র ভেতর থেকে শুধু products বাইরে যায় (DEC-INB-007-এর card)।
            provider/model/tool-তালিকা ভেতরের কথা — গ্রাহকের ব্রাউজারে নয়।  */
        const meta = m.aiMeta as { products?: unknown[] } | null;
        return {
          id: m.id,
          direction: m.direction,
          authorType: m.authorType,
          body: m.body,
          createdAt: m.createdAt,
          products: Array.isArray(meta?.products) ? meta.products : undefined,
        };
      }),
    };
  }

  /*  INB-RULE-008 — বন্ধের সময়ের সৌজন্য-বার্তা, এক thread-এ দিনে একবার।
      শর্তে "AI globally off" আছে: AI চালু থাকলে সে-ই ২৪ ঘণ্টার উত্তরদাতা।  */
  private async maybeOffHoursLine(conversationId: string, s: { aiGloballyEnabled: boolean; supportOpenMin: number; supportCloseMin: number; offHoursMessage: string }) {
    if (s.aiGloballyEnabled) return;
    const now = bdMinutesNow();
    const open = now >= s.supportOpenMin && now < s.supportCloseMin;
    if (open) return;

    const dayStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const already = await this.prisma.db.message.findFirst({
      where: {
        conversationId,
        authorType: MessageAuthor.SYSTEM,
        createdAt: { gte: dayStart },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (already) return;

    await this.prisma.db.message.create({
      data: {
        conversationId,
        direction: MessageDirection.OUT,
        authorType: MessageAuthor.SYSTEM,
        body: s.offHoursMessage,
      },
    });
  }

  /* ── admin-এর দিক ────────────────────────────────────────────────────── */

  async list(q: { status?: string; search?: string }) {
    const where: Prisma.ConversationWhereInput = { deletedAt: null };
    if (q.status && q.status !== 'ALL') where.status = q.status as ConversationStatus;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { guestName: { contains: s, mode: 'insensitive' } },
        { guestPhone: { contains: s } },
        { customer: { name: { contains: s, mode: 'insensitive' } } },
        { customer: { phone: { contains: s } } },
      ];
    }
    const rows = await this.prisma.db.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      include: {
        customer: { select: { id: true, name: true, phone: true, ordersCount: true } },
        assignee: { select: { id: true, name: true } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, authorType: true, createdAt: true },
        },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      channel: c.channel,
      status: c.status,
      aiEnabled: c.aiEnabled,
      unreadForStaff: c.unreadForStaff,
      lastMessageAt: c.lastMessageAt,
      guestName: c.guestName,
      guestPhone: c.guestPhone,
      customer: c.customer,
      assignee: c.assignee,
      lastMessage: c.messages[0] ?? null,
    }));
  }

  /** sidebar-এর badge — মোট unread */
  async badge() {
    const agg = await this.prisma.db.conversation.aggregate({
      where: { deletedAt: null, status: { not: ConversationStatus.RESOLVED } },
      _sum: { unreadForStaff: true },
    });
    return { unread: agg._sum.unreadForStaff ?? 0 };
  }

  async detail(id: string) {
    const convo = await this.prisma.db.conversation.findFirst({
      where: { id, deletedAt: null },
      include: {
        customer: {
          select: {
            id: true, name: true, phone: true, email: true,
            ordersCount: true, lastOrderAt: true,
          },
        },
        assignee: { select: { id: true, name: true } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          take: 500,
          select: {
            id: true, direction: true, authorType: true, body: true,
            createdAt: true, authorUser: { select: { name: true } },
          },
        },
        escalations: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!convo) throw new NotFoundException('Conversation not found');

    // staff দেখল — unread শূন্য
    if (convo.unreadForStaff > 0) {
      await this.prisma.db.conversation.update({
        where: { id },
        data: { unreadForStaff: 0 },
      });
    }
    return convo;
  }

  /*  Staff-এর reply। DEC-INB-008 (৫ আগস্ট, DEC-INB-004-কে বদলে): এটা আর
      AI-কে স্থায়ীভাবে থামায় না — staff-এর STAFF message থাকা মানেই পরের
      গ্রাহক-message-এ AI grace-জানালা মেনে অপেক্ষা করবে (sweeper দেখুন,
      ai-agent.ts)। per-thread `aiEnabled` toggle এখন শুধুই মালিকের হাতের
      hard-off।  */
  async reply(id: string, dto: ReplyDto, actor: { id: string; name: string }) {
    const body = dto.body?.trim();
    if (!body) throw new BadRequestException('Empty reply');

    const convo = await this.prisma.db.conversation.findFirst({ where: { id, deletedAt: null } });
    if (!convo) throw new NotFoundException('Conversation not found');

    await this.prisma.db.message.create({
      data: {
        conversationId: id,
        direction: MessageDirection.OUT,
        authorType: MessageAuthor.STAFF,
        authorUserId: actor.id,
        body,
      },
    });

    await this.prisma.db.conversation.update({
      where: { id },
      data: {
        status: ConversationStatus.WAITING_CUSTOMER,
        lastMessageAt: new Date(),
      },
    });

    /*
      A reply typed here has to leave the building. Fire and forget: staff
      should not wait on Meta, and a failure must not lose the reply that is
      already recorded.

      Free text only works inside the 24-hour window Meta allows after the
      customer's last message. Outside it the send is refused, and the refusal
      is logged rather than hidden — a reply that silently never arrived is
      worse than one that visibly failed.
    */
    void this.sender
      .send(convo, body)
      .then((r) => {
        if (!r.ok && !r.skipped) this.log.warn(`reply not delivered for ${id}: ${r.error}`);
      })
      .catch(() => undefined);

    return this.detail(id);
  }

  async setStatus(id: string, status: ConversationStatus, actor: { id: string; name: string }) {
    const convo = await this.prisma.db.conversation.findFirst({ where: { id, deletedAt: null } });
    if (!convo) throw new NotFoundException('Conversation not found');
    await this.prisma.db.conversation.update({ where: { id }, data: { status } });
    await this.audit.record({
      entityType: ENTITY, entityId: id, action: 'UPDATE',
      actorName: actor.name, actorId: actor.id,
      changes: { status: { from: convo.status, to: status } },
    });
    return this.detail(id);
  }

  async assign(id: string, assigneeId: string | null, actor: { id: string; name: string }) {
    const convo = await this.prisma.db.conversation.findFirst({ where: { id, deletedAt: null } });
    if (!convo) throw new NotFoundException('Conversation not found');
    if (assigneeId) {
      const user = await this.prisma.db.appUser.findFirst({
        where: { id: assigneeId, deletedAt: null, isActive: true },
        select: { id: true },
      });
      if (!user) throw new BadRequestException('No such user');
    }
    await this.prisma.db.conversation.update({ where: { id }, data: { assigneeId } });
    await this.audit.record({
      entityType: ENTITY, entityId: id, action: 'UPDATE',
      actorName: actor.name, actorId: actor.id,
      changes: { assigneeId: { from: convo.assigneeId, to: assigneeId } },
    });
    return this.detail(id);
  }

  /** DEC-INB-004-এর হাতে-ফেরানো দিক — per-thread AI on/off, audited */
  async setAi(id: string, enabled: boolean, actor: { id: string; name: string }) {
    const convo = await this.prisma.db.conversation.findFirst({ where: { id, deletedAt: null } });
    if (!convo) throw new NotFoundException('Conversation not found');
    await this.prisma.db.conversation.update({ where: { id }, data: { aiEnabled: enabled } });
    await this.audit.record({
      entityType: ENTITY, entityId: id, action: 'UPDATE',
      actorName: actor.name, actorId: actor.id,
      changes: { aiEnabled: { from: convo.aiEnabled, to: enabled, why: 'manual toggle' } },
    });
    return this.detail(id);
  }
}

/* ═══════════════ গ্রাহকের controller — @Public, দোকান থেকে ═══════════════ */

@Controller('shop/chat')
export class ShopChatController {
  constructor(private readonly svc: InboxService) {}

  @Public()
  @Post('start')
  start(@Body() dto: StartChatDto) {
    return this.svc.startChat(dto ?? {});
  }

  @Public()
  @Post('message')
  message(@Body() dto: PostMessageDto) {
    return this.svc.postCustomerMessage(dto);
  }

  @Public()
  @Post('identify')
  identify(@Body() dto: IdentifyDto) {
    return this.svc.identify(dto);
  }

  @Public()
  @Get('poll')
  poll(@Query('conversationId') conversationId: string, @Query('clientKey') clientKey: string) {
    return this.svc.publicView(conversationId, clientKey);
  }
}

/* ═══════════════ admin controller — global guard-এর পেছনে ═══════════════ */

@Controller('inbox')
export class InboxController {
  constructor(
    private readonly svc: InboxService,
    private readonly presence: InboxPresence,
  ) {}

  /*  Inbox পর্দা প্রতি ১০ সেকেন্ডে তালিকা টানে — সেই ডাকই staff-উপস্থিতির
      প্রমাণ (DEC-INB-008 rev)। আলাদা heartbeat নেই, দরকারও নেই।  */
  @Get()
  list(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Req() req?: ActorRequest,
  ) {
    this.presence.touch(req?.actor?.id);
    return this.svc.list({ status, search });
  }

  @Get('badge')
  badge(@Req() req?: ActorRequest) {
    this.presence.touch(req?.actor?.id);
    return this.svc.badge();
  }

  @Get('settings')
  settings() {
    return this.svc.settings();
  }

  @Patch('settings')
  updateSettings(@Body() dto: SettingsDto, @Req() req: ActorRequest) {
    return this.svc.updateSettings(dto, req.actor?.name ?? 'Admin');
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() req?: ActorRequest) {
    this.presence.touch(req?.actor?.id);
    return this.svc.detail(id);
  }

  @Post(':id/reply')
  reply(@Param('id') id: string, @Body() dto: ReplyDto, @Req() req: ActorRequest) {
    return this.svc.reply(id, dto, req.actor ?? { id: '', name: 'Admin' });
  }

  @Post(':id/resolve')
  resolve(@Param('id') id: string, @Req() req: ActorRequest) {
    return this.svc.setStatus(id, ConversationStatus.RESOLVED, req.actor ?? { id: '', name: 'Admin' });
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string, @Req() req: ActorRequest) {
    return this.svc.setStatus(id, ConversationStatus.OPEN, req.actor ?? { id: '', name: 'Admin' });
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() dto: { assigneeId: string | null }, @Req() req: ActorRequest) {
    return this.svc.assign(id, dto.assigneeId ?? null, req.actor ?? { id: '', name: 'Admin' });
  }

  @Post(':id/ai')
  setAi(@Param('id') id: string, @Body() dto: { enabled: boolean }, @Req() req: ActorRequest) {
    return this.svc.setAi(id, Boolean(dto.enabled), req.actor ?? { id: '', name: 'Admin' });
  }
}

@Module({
  imports: [MessagingModule],
  providers: [InboxService, InboxAiTools, InboxAiAgent, InboxPresence],
  controllers: [ShopChatController, InboxController],
})
export class InboxModule {}
