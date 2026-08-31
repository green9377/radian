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
  INBOX — Phase 1 (web live chat, answered by a person).
  RADIAN_INBOX_MODULE_ARCHITECTURE.md · DEC-INB-001…006

  There is no AI in Phase 1 — `InboxSetting.aiGloballyEnabled` was born false.
  Even so, `Conversation.aiEnabled` and INB-RULE-003 (a staff reply switches it
  off) already work today, so that when AI lands in Phase 2 the hand-over rule
  has already been proved rather than being written the same day it is needed.

  A WEB_CHAT identity is the `clientKey` — a secret in the browser's
  localStorage. Whoever holds the key owns the thread, and the customer never
  logs in (the guest path of DEC-INB-006). A logged-in customer is different:
  the storefront sends name and phone from its own session and INB-RULE-007
  joins the thread to the Customer row.
  ═══════════════════════════════════════════════════════════════════════════
*/

const ENTITY = 'Conversation';

/** What the guard puts there (auth.guard.ts:60), so a controller can read the actor. */
interface ActorRequest {
  actor?: { id: string; name: string; role: string };
}

/** "01712345678" -> "+8801712345678" — the shape Customer.phone is stored in (INB-RULE-007). */
function normalizeBdPhone(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, '');
  if (/^01\d{9}$/.test(digits)) return `+880${digits.slice(1)}`;
  if (/^8801\d{9}$/.test(digits)) return `+${digits}`;
  return digits;
}

/** Minutes since midnight in Bangladesh — the clock INB-RULE-008 reads. */
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

  /* ── settings (singleton, the house ensureSingleton shape) ───────────── */

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

  /* ── the customer's side (public) ────────────────────────────────────── */

  async startChat(dto: StartChatDto) {
    const s = await this.settings();
    if (!s.webChatEnabled) throw new BadRequestException('Chat is switched off right now');

    const phone = dto.phone?.trim() ? normalizeBdPhone(dto.phone) : null;
    // INB-RULE-007 — when the phone matches, an FK; never a copy.
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

  /** If the clientKey does not match, the thread is not this browser's — not one word leaks. */
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

    /*  INB-RULE-006 — a RESOLVED thread reopens on a new message if it is
        inside the window; outside it, this same thread still reopens. On
        WEB_CHAT the browser key IS the identity, so starting a fresh thread
        would throw away the customer's history.  */
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

    /*  Phase 2 — the AI wakes here, but is not awaited: the customer's request
        returns at once and the answer reaches them on the next poll (4s). Every
        failure inside the agent is swallowed there, so this request can never
        break because of one.  */
    void this.ai.respond(convo.id);

    return this.publicView(convo.id, convo.clientKey);
  }

  /** DEC-INB-006 — when a guest gives a name or phone later, the thread is joined up retroactively. */
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

  /** The poll the customer's browser calls every few seconds. */
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
        /*  Only `products` leaves aiMeta (the card in DEC-INB-007). The
            provider, the model and the tool list are house business and do not
            belong in a customer's browser.  */
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

  /*  INB-RULE-008 — the after-hours courtesy line, once per thread per day.
      The condition includes "AI globally off": when the AI is on, it is the
      one answering around the clock and the line would be noise.  */
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

  /* ── the admin's side ────────────────────────────────────────────────── */

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
          /*
            authorUser comes along so the list can tell a reply sent THROUGH
            Radian (it carries its author) from one typed in Meta's own inbox
            (it never can — Meta's API names only the shop account).
          */
          select: {
            body: true,
            authorType: true,
            createdAt: true,
            authorUser: { select: { name: true } },
          },
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

  /** The sidebar badge — total unread. */
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

    // Staff has looked — unread goes to zero.
    if (convo.unreadForStaff > 0) {
      await this.prisma.db.conversation.update({
        where: { id },
        data: { unreadForStaff: 0 },
      });
    }
    return convo;
  }

  /*  A staff reply. DEC-INB-008 (5 Aug, replacing DEC-INB-004): this no longer
      stops the AI permanently — the presence of a STAFF message means that on
      the next customer message the AI waits out the grace window instead (see
      the sweeper, ai-agent.ts). The per-thread `aiEnabled` toggle is now only
      the owner's own
      hard-off।  */
  async reply(id: string, dto: ReplyDto, actor: { id: string; name: string }) {
    const body = dto.body?.trim();
    if (!body) throw new BadRequestException('Empty reply');

    const convo = await this.prisma.db.conversation.findFirst({ where: { id, deletedAt: null } });
    if (!convo) throw new NotFoundException('Conversation not found');

    const saved = await this.prisma.db.message.create({
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
        if (!r.ok && !r.skipped) {
          this.log.warn(`reply not delivered for ${id}: ${r.error}`);
          return;
        }
        /*  Tags this row with Meta's own id for the send, so the echo of this
            exact message (meta-webhook.ts) recognises it as already saved and
            does not create a second copy. Without this, every Messenger and
            Instagram reply sent from the admin would double up the moment the
            echo arrived — found 8 Aug, alongside the mirror bug: a reply typed
            directly in the phone's Messenger/Instagram app never reached the
            admin at all, because every echo was being thrown away unread. */
        if (r.providerMessageId) {
          void this.prisma.db.message
            .update({ where: { id: saved.id }, data: { externalMessageId: r.providerMessageId } })
            .catch(() => undefined);
        }
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

  /** The hand-back side of DEC-INB-004 — per-thread AI on/off, audited. */
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

/* ═════════════ the customer's controller — @Public, from the shop ═════════ */

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

/* ═══════════ the admin controller — behind the global guard ══════════════ */

@Controller('inbox')
export class InboxController {
  constructor(
    private readonly svc: InboxService,
    private readonly presence: InboxPresence,
  ) {}

  /*  The inbox screen pulls the list every 10 seconds, and that call is itself
      the proof a staff member is present (DEC-INB-008 rev). There is no
      separate heartbeat, and there does not need to be.  */
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
