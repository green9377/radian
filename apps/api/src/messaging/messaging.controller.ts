import { Body, Controller, Get, Module, Post, Query } from '@nestjs/common';
import { CheckoutLeadStatus } from '@prisma/client';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppCloudModule } from '../common/whatsapp-cloud';
import { Public, Roles } from '../auth/auth.guard';
import { MessagingSettingsService } from './messaging-settings.service';
import { OrderMessagesService } from './order-messages.service';
import { CheckoutLeadsService, type LeadPing } from './checkout-leads.service';
import { MessagingSweeper } from './messaging.sweeper';

/*
  MESSAGING — হারানো order ফেরানোর পর্দার পেছনের কাজ। DEC-WA-002…008।

  ⚠️ দুই রকম endpoint, দুই রকম দরজা:
    · `/shop/checkout-lead` — গ্রাহকের ব্রাউজার ডাকে, তাই Public
    · বাকি সব — মালিক/ম্যানেজারের, তাই Roles
*/

@Controller('messaging')
export class MessagingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: CheckoutLeadsService,
    private readonly orderMessages: OrderMessagesService,
    private readonly sweeper: MessagingSweeper,
    private readonly settings: MessagingSettingsService,
  ) {}

  @Get('settings')
  @Roles('OWNER', 'MANAGER')
  getSettings() {
    return this.settings.get();
  }

  /** এক order নিয়ে কী কী পাঠানো হয়েছে — order পাতায় দেখানোর জন্য */
  @Get('order/:orderId')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  async forOrder(@Query('orderId') orderId: string) {
    return this.prisma.db.orderMessage.findMany({
      where: { orderId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * অসমাপ্ত checkout-এর তালিকা — staff এখান থেকে ফোন করবে।
   * মালিকের কথা ৬ আগস্ট: "৯০ দিন এদের customer-এ convert করার চেষ্টা করব"।
   * বার্তা একটা পথ; ফোন প্রায়ই ভালো পথ, বিশেষত বড় অঙ্কের cart-এ।
   */
  @Get('leads')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  async leadList(
    @Query('status') status?: CheckoutLeadStatus,
    @Query('take') take = '100',
  ) {
    return this.prisma.db.checkoutLead.findMany({
      where: { deletedAt: null, ...(status ? { status } : {}) },
      orderBy: { lastSeenAt: 'desc' },
      take: Math.min(Number(take) || 100, 500),
    });
  }

  /**
   * "এখনই চালান" — Demo-তে sweeper বন্ধ (DEC-WA-007), তাই যাচাই করার
   * একমাত্র উপায় এটাই। Real-এও কাজে লাগে: কিছু আটকে গেলে অপেক্ষা না করে
   * চালিয়ে দেখা যায়।
   */
  @Post('sweep')
  @Roles('OWNER')
  sweepNow() {
    return this.sweeper.runOnce();
  }

  /** একটা আটকে থাকা বার্তা আবার পাঠানোর চেষ্টা */
  @Post('retry')
  @Roles('OWNER')
  async retry(@Body() b: { id: string }) {
    await this.prisma.db.orderMessage.updateMany({
      where: { id: b.id },
      data: { status: 'QUEUED', dueAt: new Date(), error: null },
    });
    return { result: await this.orderMessages.sendOne(b.id) };
  }
}

/*  গ্রাহকের ব্রাউজার এটাই ডাকে। আলাদা controller, কারণ পথটা `/shop/...`-এর
    নিচে থাকলে storefront-এর বাকি সবকিছুর মতো একই জায়গায় পড়ে।  */
@Controller('shop')
export class CheckoutLeadController {
  constructor(private readonly leads: CheckoutLeadsService) {}

  /**
   * ⚠️ Public — গ্রাহক তো লগইন করা নন। তাই যা আসে তার কিছুই বিশ্বাস করা
   * হয় না: `scrub()` কার্ড-জাতীয় ঘর ছেঁকে ফেলে, লম্বা লেখা বাদ যায়, আর
   * সব ব্যর্থতা চুপচাপ গিলে ফেলা হয় — checkout কখনো এর জন্য আটকাবে না।
   */
  @Public()
  @Post('checkout-lead')
  ping(@Body() b: LeadPing) {
    return this.leads.ping(b ?? ({} as LeadPing));
  }
}

@Module({
  imports: [PrismaModule, WhatsAppCloudModule],
  providers: [MessagingSettingsService, OrderMessagesService, CheckoutLeadsService, MessagingSweeper],
  controllers: [MessagingController, CheckoutLeadController],
  exports: [OrderMessagesService, CheckoutLeadsService],
})
export class MessagingModule {}
