/*
  MARKETING — request shapes.
  RADIAN_MARKETING_MODULE_ARCHITECTURE.md (28 Jul 2026).

  Money is always integer paisa. Rates are always basis points (1000 = 10 %).
  Neither ever arrives as a decimal, for the same reason as everywhere else in
  this system: 0.1 + 0.2 is not 0.3.
*/

export type CampaignPlatformDto =
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'GOOGLE'
  | 'TIKTOK'
  | 'YOUTUBE'
  | 'INFLUENCER'
  | 'PRINT'
  | 'EVENT'
  | 'PARTNERSHIP'
  | 'OTHER';

export type CampaignStatusDto = 'PLANNED' | 'RUNNING' | 'FINISHED' | 'ARCHIVED';

export interface CampaignWriteDto {
  name?: string;
  platform?: CampaignPlatformDto;
  status?: CampaignStatusDto;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;
  budgetPaisa?: number;
  goalNote?: string | null;
  note?: string | null;
  offerIds?: string[];
  utmKeys?: string[];
}

export interface CampaignListQuery {
  status?: CampaignStatusDto;
  search?: string;
  includeArchived?: string;
}

/* ---------------- attribution ---------------- */

export interface AttributionSetDto {
  campaignId?: string | null;
  affiliateId?: string | null;
  note?: string | null;
}

export interface AttributionRunDto {
  /** re-run the rules over orders placed on/after this date. Default: 90 days */
  from?: string;
}

/* ---------------- affiliates ---------------- */

export interface AffiliateWriteDto {
  type?: 'INDIVIDUAL' | 'BUSINESS';
  status?: 'ACTIVE' | 'PAUSED';
  name?: string;
  phone?: string;
  email?: string | null;
  contactName?: string | null;
  address?: string | null;
  note?: string | null;
  code?: string;
  commissionBp?: number;
  payoutMethod?: string | null;
  payoutNumber?: string | null;
  customerId?: string | null;
}

export interface PayoutDto {
  affiliateId: string;
  /** which commissions to settle. Empty = every AVAILABLE one. */
  commissionIds?: string[];
  paidFromId: string;
  method?: string;
  reference?: string;
  note?: string;
}

/* ---------------- outreach ---------------- */

export interface OccasionQuery {
  /** how many days ahead to look. Defaults to the largest reminder lead day. */
  days?: string;
  search?: string;
}

export interface OutreachLogDto {
  customerId: string;
  recipientId?: string | null;
  occasionType?: string | null;
  occasionDate?: string | null; // "MM-DD"
  occasionYear?: number | null;
  channel?: 'WHATSAPP' | 'PHONE' | 'SMS' | 'EMAIL';
  purpose?: 'OCCASION' | 'FOLLOW_UP' | 'CORPORATE' | 'WIN_BACK' | 'OTHER';
  message?: string | null;
  note?: string | null;
  campaignId?: string | null;
}

export interface OutreachResultDto {
  result: 'SENT' | 'REPLIED' | 'ORDERED' | 'NO_ANSWER' | 'REFUSED';
  resultOrderId?: string | null;
  note?: string | null;
}

export interface OptOutDto {
  customerId: string;
  reason?: string | null;
}

/* ---------------- settings ---------------- */

export interface MarketingSettingDto {
  defaultCommissionBp?: number;
  holdDays?: number;
  minWithdrawPaisa?: number;
  refWindowDays?: number;
  reminderLeadDays?: number[];
  whatsappTemplate?: string;
  // MKT-D16 — referral reward rules
  referralEnabled?: boolean;
  pointValuePaisa?: number;
  referralPoints?: number;
  friendDiscountBp?: number;
  friendDiscountMaxPaisa?: number;
  referralMinOrderPaisa?: number;
  // MKT-D21 — loyalty points on ordinary purchases
  loyaltyEnabled?: boolean;
  earnRateBp?: number;
  earnMultiplierBp?: number;
  multiplierUntil?: string | null;
  redeemMaxBp?: number;
  minRedeemPoints?: number;
}
