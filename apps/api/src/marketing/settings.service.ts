import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type { MarketingSettingDto } from './marketing.dto';
import { ensureSingleton } from '../common/singleton';

/*
  Singleton settings — the "singleton" id pattern (DEC-OFR-004), not PosSetting's
  cuid slip, so there can never be two rows arguing about the commission rate.

  Everything the owner was asked to decide but has not yet fixed lives here with
  a sensible default, so nothing is blocked waiting on an answer and every
  answer is one screen away:
     defaultCommissionBp  1000 = 10 %
     holdDays             7 after delivery
     minWithdrawPaisa     ৳500
     refWindowDays        30
     reminderLeadDays     [7, 3] — a week out, then three days out
     whatsappTemplate     the owner's own words go here
*/

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /*  ⚠️ UPSERT IS NOT ATOMIC HERE. The comment that used to sit on this method
      said "upsert is one statement, so there is no gap between looking and
      writing". That is not true: Prisma only compiles an upsert into a single
      `INSERT … ON CONFLICT` under some conditions, and otherwise still emits
      SELECT-then-INSERT. Intelligence proved it on 29 Jul by returning
      P2002 on its first ever page load.
      ensureSingleton keeps the fast path and simply survives losing the race —
      see common/singleton.ts. */
  async get() {
    return ensureSingleton(
      () => this.prisma.db.marketingSetting.findUnique({ where: { id: 'singleton' } }),
      () => this.prisma.db.marketingSetting.create({ data: { id: 'singleton' } }),
    );
  }

  async update(dto: MarketingSettingDto, actorName: string) {
    await this.get(); // make sure the row exists
    const data: Prisma.MarketingSettingUpdateInput = {};
    if (dto.defaultCommissionBp !== undefined)
      data.defaultCommissionBp = clamp(dto.defaultCommissionBp, 0, 5000);
    if (dto.holdDays !== undefined) data.holdDays = clamp(dto.holdDays, 0, 90);
    if (dto.minWithdrawPaisa !== undefined)
      data.minWithdrawPaisa = clamp(dto.minWithdrawPaisa, 0, 100_000_00);
    if (dto.refWindowDays !== undefined) data.refWindowDays = clamp(dto.refWindowDays, 1, 180);
    if (dto.reminderLeadDays !== undefined) {
      const days = [...new Set(dto.reminderLeadDays.map((d) => clamp(d, 0, 60)))].sort(
        (a, b) => b - a,
      );
      data.reminderLeadDays = days.length ? days : [7, 3];
    }
    if (dto.whatsappTemplate !== undefined)
      data.whatsappTemplate = dto.whatsappTemplate.slice(0, 1200);

    /*  MKT-D16 — the referral rules. The owner asked for the reward amount to
        be changeable whenever he likes, so it lives here and nowhere in code.
        Changing it only affects referrals from that moment on; points already
        given are history and history is not rewritten (FIN-RULE-003). */
    if (dto.referralEnabled !== undefined) data.referralEnabled = !!dto.referralEnabled;
    if (dto.referralPoints !== undefined) data.referralPoints = clamp(dto.referralPoints, 0, 1_000_000);
    if (dto.pointValuePaisa !== undefined) data.pointValuePaisa = clamp(dto.pointValuePaisa, 1, 100_000);
    if (dto.friendDiscountBp !== undefined) data.friendDiscountBp = clamp(dto.friendDiscountBp, 0, 5000);
    if (dto.friendDiscountMaxPaisa !== undefined)
      data.friendDiscountMaxPaisa = clamp(dto.friendDiscountMaxPaisa, 0, 100_000_00);
    if (dto.referralMinOrderPaisa !== undefined)
      data.referralMinOrderPaisa = clamp(dto.referralMinOrderPaisa, 0, 100_000_00);

    /*  MKT-D21 — loyalty. Every number the owner locked on 29 Jul is here and
        nowhere in code, because he asked to change them himself later.

        The clamps are not decoration:
          · earnRateBp is capped at 1000 (10 %) — above that the scheme costs
            more than a fifth of the gross margin on every order, which is a
            decision that should be taken deliberately and not by a typo.
          · redeemMaxBp is capped at 5000 (50 %) — the owner's rule is that
            nobody ever buys with points alone, so 100 % must be unreachable
            through this field however hard somebody leans on the keyboard.
          · the festival multiplier is capped at ×5. */
    if (dto.loyaltyEnabled !== undefined) data.loyaltyEnabled = !!dto.loyaltyEnabled;
    if (dto.earnRateBp !== undefined) data.earnRateBp = clamp(dto.earnRateBp, 0, 1000);
    if (dto.earnMultiplierBp !== undefined)
      data.earnMultiplierBp = clamp(dto.earnMultiplierBp, 10000, 50000);
    if (dto.multiplierUntil !== undefined)
      data.multiplierUntil = dto.multiplierUntil ? new Date(dto.multiplierUntil) : null;
    if (dto.redeemMaxBp !== undefined) data.redeemMaxBp = clamp(dto.redeemMaxBp, 0, 5000);
    if (dto.minRedeemPoints !== undefined)
      data.minRedeemPoints = clamp(dto.minRedeemPoints, 1, 100_000);

    const row = await this.prisma.db.marketingSetting.update({
      where: { id: 'singleton' },
      data,
    });
    await this.audit.record({
      entityType: 'MarketingSetting',
      entityId: 'singleton',
      action: 'UPDATE',
      actorName,
      changes: data as Record<string, unknown>,
    });
    return row;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  const n = Math.round(Number(v) || 0);
  return Math.min(hi, Math.max(lo, n));
}
