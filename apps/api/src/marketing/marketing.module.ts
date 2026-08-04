import { Module } from '@nestjs/common';
import { MarketingController } from './marketing.controller';
import { CampaignsService } from './campaigns.service';
import { AttributionService } from './attribution.service';
import { AffiliatesService } from './affiliates.service';
import { OutreachService } from './outreach.service';
import { SettingsService } from './settings.service';
import { MarketingAutomationService } from './automation.service';
import { TrackingService } from './tracking.service';
import { ReferralService } from './referral.service';
import { WhatsappService } from './whatsapp.service';
import { MessagingService } from './messaging.service';
import { AdsService } from './ads.service';
import { LoyaltyService } from './loyalty.service';
import { WhatsAppCloudModule } from '../common/whatsapp-cloud';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { FinanceModule } from '../finance/finance.module';

/*  MARKETING & GROWTH — RADIAN_MARKETING_MODULE_ARCHITECTURE.md (28 Jul 2026).

    Marketing owns Campaign, OrderAttribution, Affiliate, AffiliateCommission,
    AffiliatePayout, Outreach, MarketingOptOut and MarketingSetting — and
    nothing else. It reads Order, Customer, Recipient, RecipientOccasion,
    Offer, OfferRedemption, Expense and the ledger, and writes none of them.

    One-way dependency on Finance, the same shape as HR: commission and payout
    call FinanceService.postEntry() with one balanced, completed event, and
    check what comes back (MKT-RULE-016). Finance never imports Marketing.

    AffiliatesService and AttributionService are exported so Sales/Delivery can
    call them when an order is delivered, returned or cancelled — the module
    receives completed business events, it does not poll. */
@Module({
  imports: [PrismaModule, CommonModule, FinanceModule, WhatsAppCloudModule],
  controllers: [MarketingController],
  providers: [
    CampaignsService,
    AttributionService,
    AffiliatesService,
    OutreachService,
    SettingsService,
    MarketingAutomationService,
    TrackingService,
    ReferralService,
    WhatsappService,
    MessagingService,
    AdsService,
    LoyaltyService,
  ],
  exports: [
    CampaignsService, AttributionService, AffiliatesService, OutreachService,
    ReferralService, LoyaltyService,
  ],
})
export class MarketingModule {}
