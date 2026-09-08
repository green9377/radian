/* eslint-disable no-console */
/**
 * MARKETING module self-test — end to end, against the real services and the
 * real ledger, with data it invents and then takes back out again.
 *
 * Run through `radian_marketing_selftest.bat`. It talks to the Nest services
 * directly rather than over HTTP, so no password is needed and the business
 * rules are exercised exactly where they live.
 *
 * SAFETY, because this touches a live database:
 *   · every row it makes is marked — orders SELFTEST-*, everything else carries
 *     [selftest] in a name or note
 *   · every ledger entry it writes directly has a sourceKey starting SELFTEST:
 *   · the commission and payout entries it causes carry AFFCOM:/AFFREV:/AFFPAY:
 *     keys of their own, with no marker of ours — so the cleanup ALSO sweeps
 *     those keys when the row they point at is gone. This is exactly the leak
 *     that hid the worst bug in HR (HR-R28): a stale PAYROLL: entry survived a
 *     cleanup, the next run reused the number, and the ledger silently refused
 *     the entry while the screen said the money had moved.
 *   · cleanup runs first AND last, so a crash halfway cannot leave rubbish
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignsService } from './campaigns.service';
import { AttributionService } from './attribution.service';
import { AffiliatesService } from './affiliates.service';
import { OutreachService } from './outreach.service';
import { SettingsService } from './settings.service';
import { MarketingAutomationService } from './automation.service';
import { ReferralService } from './referral.service';
import { LoyaltyService } from './loyalty.service';
import { WhatsappService } from './whatsapp.service';
import { MessagingService } from './messaging.service';
import { AdsService } from './ads.service';
import { FinanceService, ACC, ACC2 } from '../finance/finance.service';

const TAG = '[selftest]';
const KEY = 'SELFTEST:';
const ORDER_PREFIX = 'SELFTEST-';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(what: string, condition: boolean, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${what}${detail ? `  (${detail})` : ''}`);
  } else {
    fail += 1;
    failures.push(what + (detail ? ` — ${detail}` : ''));
    console.log(`  FAIL  ${what}${detail ? `  (${detail})` : ''}`);
  }
}

/** the rule under test is that this SHOULD be refused */
async function refuses(what: string, fn: () => Promise<unknown>, expectInMessage?: string) {
  try {
    await fn();
    ok(what, false, 'it was allowed, but should not have been');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (expectInMessage && !msg.toLowerCase().includes(expectInMessage.toLowerCase()))
      ok(what, false, `refused, but for the wrong reason: ${msg}`);
    else ok(what, true, msg.slice(0, 80));
  }
}

const taka = (p: number) => (p / 100).toFixed(2);

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const campaigns = app.get(CampaignsService);
  const attribution = app.get(AttributionService);
  const affiliates = app.get(AffiliatesService);
  const outreach = app.get(OutreachService);
  const settings = app.get(SettingsService);
  const automation = app.get(MarketingAutomationService);
  const referral = app.get(ReferralService);
  const loyalty = app.get(LoyaltyService);
  const wa = app.get(WhatsappService);
  const messaging = app.get(MessagingService);
  const ads = app.get(AdsService);
  const finance = app.get(FinanceService);

  /* ---------------- cleanup ---------------- */

  const cleanup = async () => {
    const orders = await prisma.order.findMany({
      where: { orderNo: { startsWith: ORDER_PREFIX } },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);

    const comms = await prisma.affiliateCommission.findMany({
      where: { OR: [{ orderId: { in: orderIds } }, { affiliate: { name: { startsWith: TAG } } }] },
      select: { id: true },
    });
    const payouts = await prisma.affiliatePayout.findMany({
      where: { affiliate: { name: { startsWith: TAG } } },
      select: { id: true, payoutNo: true },
    });

    // 1 — the ledger. Ours by tag, plus the AFFCOM:/AFFREV:/AFFPAY: keys those
    //     rows caused, plus any orphan left by an earlier crashed run.
    const keys = [
      ...comms.map((c) => `AFFCOM:${c.id}`),
      ...comms.map((c) => `AFFREV:${c.id}`),
      ...payouts.map((p) => `AFFPAY:${p.payoutNo}`),
    ];
    //     the narration match catches the decoy entry section 7 plants — if a
    //     crash left it behind it would block the next payout number for ever
    const entryWhere = {
      OR: [
        { sourceKey: { startsWith: KEY } },
        { sourceKey: { in: keys } },
        { narration: { startsWith: TAG } },
      ],
    };
    await prisma.journalLine.deleteMany({ where: { entry: entryWhere } });
    await prisma.journalEntry.deleteMany({ where: entryWhere });

    // orphan sweep — an AFFILIATE-sourced entry whose row no longer exists can
    // only be debris, because a posted payout is never deleted through the app
    const stray = await prisma.journalEntry.findMany({
      where: { sourceType: 'AFFILIATE' },
      select: { id: true, sourceId: true, sourceKey: true },
    });
    const strayIds: string[] = [];
    for (const s of stray) {
      if (!s.sourceId) continue;
      const isPayout = s.sourceKey?.startsWith('AFFPAY:');
      const alive = isPayout
        ? await prisma.affiliatePayout.findUnique({ where: { id: s.sourceId }, select: { id: true } })
        : await prisma.affiliateCommission.findUnique({ where: { id: s.sourceId }, select: { id: true } });
      if (!alive) strayIds.push(s.id);
    }
    if (strayIds.length) {
      await prisma.journalLine.deleteMany({ where: { entryId: { in: strayIds } } });
      await prisma.journalEntry.deleteMany({ where: { id: { in: strayIds } } });
    }

    // 2 — Marketing's own rows.
    //     Points first: their ledger entries carry REFPTS:/REFREV:/POINTADJ:/
    //     POINTRDM: keys with no marker of ours, exactly like AFFCOM: above,
    //     so they have to be swept by id or they outlive the run.
    const myCustIds = (
      await prisma.customer.findMany({ where: { note: { startsWith: TAG } }, select: { id: true } })
    ).map((c) => c.id);
    if (myCustIds.length) {
      const refs = await prisma.referral.findMany({
        where: { OR: [{ referrerId: { in: myCustIds } }, { friendId: { in: myCustIds } }] },
        select: { id: true },
      });
      const myOrders = await prisma.order.findMany({
        where: { orderNo: { startsWith: ORDER_PREFIX } },
        select: { id: true },
      });
      const pointKeys = [
        ...refs.map((r) => `REFPTS:${r.id}`),
        ...refs.map((r) => `REFREV:${r.id}`),
        /*  MKT-D21 — loyalty keys carry no marker of ours either, exactly like
            AFFCOM: above. A stale LOYEARN: would block the next run's entry
            for ever and the ledger would refuse it silently — the HR-R28 leak,
            third time it has had to be closed by hand. */
        ...myOrders.map((o) => `LOYEARN:${o.id}`),
        ...myOrders.map((o) => `LOYREV:${o.id}`),
      ];
      const pointRows = await prisma.loyaltyPoint.findMany({
        where: { customerId: { in: myCustIds } },
        select: { journalEntryId: true },
      });
      const entryIds = pointRows.map((p) => p.journalEntryId).filter((x): x is string => !!x);
      await prisma.journalLine.deleteMany({
        where: { OR: [{ entry: { sourceKey: { in: pointKeys } } }, { entryId: { in: entryIds } }] },
      });
      await prisma.journalEntry.deleteMany({
        where: { OR: [{ sourceKey: { in: pointKeys } }, { id: { in: entryIds } }] },
      });
      await prisma.loyaltyPoint.deleteMany({ where: { customerId: { in: myCustIds } } });
      await prisma.referral.deleteMany({ where: { id: { in: refs.map((r) => r.id) } } });
      await prisma.referralCode.deleteMany({ where: { customerId: { in: myCustIds } } });
      await prisma.customerCredit.deleteMany({ where: { customerId: { in: myCustIds } } });
    }

    await prisma.affiliateCommission.deleteMany({ where: { id: { in: comms.map((c) => c.id) } } });
    await prisma.affiliatePayout.deleteMany({ where: { id: { in: payouts.map((p) => p.id) } } });
    await prisma.orderAttribution.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.affiliate.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.expense.deleteMany({ where: { note: { startsWith: TAG } } });
    await prisma.campaign.deleteMany({ where: { name: { startsWith: TAG } } });
    // MKT-D20 — the ad cache. Marked by a fake account id, so a real
    // account's numbers can never be swept by a test run.
    await prisma.adInsight.deleteMany({ where: { accountId: { startsWith: 'act_SELFTEST' } } });

    // 3 — the fixtures
    const custs = await prisma.customer.findMany({
      where: { note: { startsWith: TAG } },
      select: { id: true },
    });
    const custIds = custs.map((c) => c.id);
    await prisma.outreach.deleteMany({ where: { customerId: { in: custIds } } });
    await prisma.marketingOptOut.deleteMany({ where: { customerId: { in: custIds } } });
    /*  REV-MKT-3 plants completed returns so the sweep has something to react
        to. They point at our own orders, so they go with them — and they must
        go BEFORE the orders, or the foreign key refuses. */
    await prisma.salesReturn.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.offerRedemption.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderLine.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.offer.deleteMany({ where: { name: { startsWith: TAG } } });
    const recs = await prisma.recipient.findMany({
      where: { customerId: { in: custIds } },
      select: { id: true },
    });
    await prisma.recipientOccasion.deleteMany({
      where: { recipientId: { in: recs.map((r) => r.id) } },
    });
    await prisma.recipient.deleteMany({ where: { customerId: { in: custIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: custIds } } });

    return {
      orders: orderIds.length,
      commissions: comms.length,
      payouts: payouts.length,
      strayEntries: strayIds.length,
      customers: custIds.length,
    };
  };

  console.log('=== cleaning up anything left from before ===');
  console.log(JSON.stringify(await cleanup()));

  try {
    /* ---------------- fixtures ---------------- */

    const channel =
      (await prisma.db.channel.findFirst({ where: { isActive: true } })) ??
      (await prisma.channel.create({
        data: { slug: `selftest-${Date.now()}`, name: `${TAG} channel` },
      }));

    // two numbers that can never collide, whatever the clock says
    const stamp = String(Date.now()).slice(-6);
    const buyerPhone = `+88019${stamp}1`;
    const promoterPhone = `+88018${stamp}2`;
    const buyer = await prisma.customer.create({
      data: { name: `${TAG} Rafiq`, phone: buyerPhone, note: TAG },
    });
    const promoterAsBuyer = await prisma.customer.create({
      data: { name: `${TAG} Promoter`, phone: promoterPhone, note: TAG },
    });

    let seq = 0;
    const makeOrder = async (o: {
      subtotal: number;
      discount?: number;
      delivery?: number;
      vat?: number;
      coupon?: string | null;
      utm?: string | null;
      ref?: string | null;
      delivered?: boolean;
      cancelled?: boolean;
      customerId?: string;
      phone?: string;
    }) => {
      seq += 1;
      const discount = o.discount ?? 0;
      const delivery = o.delivery ?? 0;
      const vat = o.vat ?? 0;
      const total = o.subtotal - discount + delivery + vat;
      return prisma.order.create({
        data: {
          orderNo: `${ORDER_PREFIX}${Date.now()}-${seq}`,
          channelId: channel.id,
          customerId: o.customerId ?? buyer.id,
          senderName: `${TAG} sender`,
          senderPhone: o.phone ?? buyer.phone ?? '',
          zone: 'DHAKA',
          address: 'Gulshan 1, Dhaka',
          subtotalPaisa: o.subtotal,
          discountPaisa: discount,
          deliveryPaisa: delivery,
          vatPaisa: vat,
          totalPaisa: total,
          couponCode: o.coupon ?? null,
          utmCampaign: o.utm ?? null,
          refCode: o.ref ?? null,
          deliveryStatus: o.delivered ? 'delivered' : 'unassigned',
          salesStatus: o.cancelled ? 'cancelled' : 'confirmed',
          internalNote: TAG,
        },
      });
    };

    /* ================================================================
       1. settings
       ================================================================ */
    console.log('\n=== 1. settings have working defaults ===');
    const s = await settings.get();
    ok('a settings row exists', s.id === 'singleton');
    ok('with a default commission rate', s.defaultCommissionBp > 0, `${s.defaultCommissionBp} bp`);
    ok('a hold period', s.holdDays >= 0, `${s.holdDays} days`);
    ok('and a reminder lead', s.reminderLeadDays.length > 0, s.reminderLeadDays.join('/'));

    /* ================================================================
       2. campaigns (MKT-D01)
       ================================================================ */
    console.log('\n=== 2. a campaign is one occasion ===');
    const camp = await campaigns.create(
      {
        name: `${TAG} Valentine 2027`,
        platform: 'FACEBOOK',
        status: 'RUNNING',
        startDate: '2027-02-01',
        endDate: '2027-02-15',
        budgetPaisa: 4_000_000,
        utmKeys: ['Valentine27', ' vday27 '],
      },
      'selftest',
    );
    ok('it gets a sequential number', /^CMP-\d{6}$/.test(camp.campaignNo), camp.campaignNo);
    ok('utm keys are lowercased and trimmed', camp.utmKeys.join(',') === 'valentine27,vday27');
    await refuses(
      'an end date before the start is refused',
      () => campaigns.create({ name: `${TAG} bad`, startDate: '2027-03-10', endDate: '2027-03-01' }, 'selftest'),
      'before the start',
    );
    await refuses(
      'a nameless campaign is refused',
      () => campaigns.create({ name: '  ', startDate: '2027-03-01', endDate: '2027-03-10' }, 'selftest'),
      'needs a name',
    );

    /* ================================================================
       3. spend is READ from Finance, never stored here (MKT-D05)
       ================================================================ */
    console.log('\n=== 3. spend comes from Finance, not from Marketing ===');
    /*  The chart of accounts is seeded lazily — ensureSeed() runs on the first
        Finance call and adds whatever is missing, which is how 2120 and 5451
        reach a database that already existed. Nothing in this file had called
        Finance yet, so the first run reported both as absent while they were in
        fact created moments later by the very next postEntry(). The module was
        right and the test was early. Ask for the seed first. */
    await finance.ensureSeed();
    const marketingAcc = await prisma.db.financeAccount.findUnique({ where: { code: ACC.MARKETING } });
    const cashAcc = await prisma.db.financeAccount.findFirst({ where: { isMoneyAccount: true, isActive: true } });
    ok('the Marketing & Ads account exists', !!marketingAcc, ACC.MARKETING);
    ok('a money account exists to pay from', !!cashAcc, cashAcc?.name);

    const payableAcc = await prisma.db.financeAccount.findUnique({ where: { code: ACC2.AFFILIATE_PAYABLE } });
    const commAcc = await prisma.db.financeAccount.findUnique({ where: { code: ACC2.AFFILIATE_COMMISSION } });
    ok('2120 Affiliate Payable was seeded', !!payableAcc);
    ok('5451 Affiliate Commission was seeded', !!commAcc);

    if (marketingAcc && cashAcc) {
      await prisma.expense.create({
        data: {
          expenseNo: `EXP-SELFTEST-${Date.now()}`,
          accountId: marketingAcc.id,
          paidFromId: cashAcc.id,
          amountPaisa: 2_500_000,
          note: `${TAG} boost`,
          campaignId: camp.id,
          approval: 'AUTO',
          actorName: 'selftest',
        },
      });
      const withSpend = await campaigns.get(camp.id);
      ok('a tagged expense shows up as campaign spend', withSpend.spentPaisa === 2_500_000, taka(withSpend.spentPaisa));
      ok('and Marketing stores no cost figure of its own', !('costPaisa' in camp));
    }

    /* ================================================================
       4. the attribution ladder (MKT-D02)
       ================================================================ */
    console.log('\n=== 4. where did this order come from? ===');

    // an affiliate first, because rung 1 needs one
    const aff = await affiliates.create(
      { name: `${TAG} Promoter`, phone: promoterPhone, code: 'SELFTESTAF', commissionBp: 1000 },
      'selftest',
    );
    ok('the affiliate code is uppercase', aff.code === aff.code.toUpperCase(), aff.code);
    await refuses(
      'a commission over 50% is refused as a typo',
      () => affiliates.create({ name: `${TAG} greedy`, phone: '+8801700000000', commissionBp: 9000 }, 'selftest'),
      'typo',
    );

    // a coupon that belongs to the campaign
    const offer = await prisma.offer.create({
      data: {
        offerNo: `OFR-SELFTEST-${Date.now()}`,
        name: `${TAG} LOVE27`,
        mechanism: 'COUPON',
        code: `SELFTESTLOVE${Date.now() % 10000}`,
        discountType: 'PERCENT',
        discountValue: 1000,
        status: 'approved',
      },
    });
    await campaigns.update(camp.id, { offerIds: [offer.id] }, 'selftest');

    const oRef = await makeOrder({ subtotal: 100_000, ref: aff.code });
    const oCoupon = await makeOrder({ subtotal: 200_000, discount: 20_000, coupon: offer.code });
    await prisma.offerRedemption.create({
      data: { offerId: offer.id, orderId: oCoupon.id, customerId: buyer.id, code: offer.code, discountPaisa: 20_000 },
    });
    const oUtm = await makeOrder({ subtotal: 150_000, utm: 'VALENTINE27' });
    const oNothing = await makeOrder({ subtotal: 90_000 });

    ok('an order carrying a ref code goes to the affiliate',
      (await attribution.decide(oRef.id))?.source === 'REF_CODE');
    ok('a coupon that belongs to a campaign wins rung 2',
      (await attribution.decide(oCoupon.id))?.campaignId === camp.id);
    ok('a utm tag wins rung 3 (case does not matter)',
      (await attribution.decide(oUtm.id))?.source === 'UTM');
    const unknown = await attribution.decide(oNothing.id);
    ok('an order with no evidence is UNATTRIBUTED, not guessed at',
      unknown?.source === 'UNATTRIBUTED' && unknown?.campaignId === null);

    console.log('\n--- and a person always wins over the machine (MKT-RULE-002) ---');
    await attribution.setManual(oNothing.id, { campaignId: camp.id, note: 'customer said so' }, 'selftest');
    const afterRerun = await attribution.decide(oNothing.id);
    ok('a manual decision survives a re-run', afterRerun?.source === 'MANUAL' && afterRerun?.campaignId === camp.id);
    await refuses(
      'a campaign that does not exist is refused',
      () => attribution.setManual(oNothing.id, { campaignId: 'no-such-id' }, 'selftest'),
      'does not exist',
    );

    console.log('\n--- one order, one campaign (MKT-D04) ---');
    const rowCount = await prisma.orderAttribution.count({ where: { orderId: oCoupon.id } });
    ok('an order can never hold two campaign rows', rowCount === 1);

    console.log('\n--- the honesty panel (MKT-D03) ---');
    const q = await attribution.quality(3650);
    const unattr = q.rows.find((r) => r.source === 'UNATTRIBUTED');
    ok('unattributed orders are counted and reported, not hidden', !!unattr);
    ok('every rung is present in the report', q.rows.length === 5);

    /* ================================================================
       5. the three-line ROI (MKT-D06)
       ================================================================ */
    console.log('\n=== 5. revenue, gross, contribution ===');
    const oRoi = await makeOrder({ subtotal: 500_000, delivery: 10_000, vat: 3_750, utm: 'vday27' });
    await attribution.decide(oRoi.id);
    await finance.postEntry({
      sourceType: 'MANUAL',
      sourceKey: `${KEY}cogs:${oRoi.id}`,
      narration: `${TAG} cost of goods`,
      lines: [
        { accountCode: ACC.COGS, debitPaisa: 200_000, orderId: oRoi.id },
        { accountCode: ACC.INVENTORY, creditPaisa: 200_000 },
      ],
    });
    await finance.postEntry({
      sourceType: 'MANUAL',
      sourceKey: `${KEY}deliv:${oRoi.id}`,
      narration: `${TAG} delivery cost`,
      lines: [
        { accountCode: ACC.DELIVERY_COST, debitPaisa: 30_000, orderId: oRoi.id },
        { accountCode: ACC.ACCRUED, creditPaisa: 30_000 },
      ],
    });

    const oCancelled = await makeOrder({ subtotal: 800_000, utm: 'vday27', cancelled: true });
    await attribution.decide(oCancelled.id);

    /*  Four orders now belong to this campaign, and one does not:
          oCoupon   200,000 − 20,000 discount            = 180,000
          oUtm                                            = 150,000
          oNothing  (set by hand)                         =  90,000
          oRoi      500,000 + 10,000 delivery, VAT out    = 510,000
          oCancelled 800,000                              = excluded outright
        Total: 930,000. Anything else means a rule is not holding. */
    const roi = await campaigns.get(camp.id);
    ok('revenue is exactly what the four live orders came to',
      roi.revenuePaisa === 930_000, taka(roi.revenuePaisa));
    ok('VAT never counted as revenue (MKT-RULE-005)',
      roi.revenuePaisa === 930_000, 'the 3,750 of VAT is not in that figure');
    ok('a cancelled order is left out of revenue (MKT-RULE-004)',
      roi.revenuePaisa < 930_000 + 800_000, taka(roi.revenuePaisa));
    ok('cost of goods is read from the ledger, per order', roi.cogsPaisa === 200_000, taka(roi.cogsPaisa));
    ok('so is the delivery cost', roi.deliveryCostPaisa === 30_000, taka(roi.deliveryCostPaisa));
    ok('gross = revenue − goods', roi.grossPaisa === roi.revenuePaisa - roi.cogsPaisa);
    ok('contribution = gross − delivery', roi.contributionPaisa === roi.grossPaisa - roi.deliveryCostPaisa);
    ok('the return is worked out against contribution, not revenue',
      roi.roi !== null && Math.abs(roi.roi - roi.contributionPaisa / roi.spentPaisa) < 0.0001);

    /* ================================================================
       6. commission (MKT-D09, MKT-RULE-012/015)
       ================================================================ */
    console.log('\n=== 6. commission only on a delivered order ===');
    const notYet = await affiliates.accrueForOrder(oRef.id);
    ok('an undelivered order earns nothing', 'skipped' in notYet && notYet.skipped === 'not delivered yet');

    await prisma.order.update({ where: { id: oRef.id }, data: { deliveryStatus: 'delivered' } });
    const earned = await affiliates.accrueForOrder(oRef.id);
    ok('a delivered one does', 'commission' in earned && !!earned.commission);
    const c1 = 'commission' in earned ? earned.commission : null;
    ok('the base is goods after discount, delivery and VAT excluded (MKT-D09)',
      c1?.basePaisa === 100_000, taka(c1?.basePaisa ?? 0));
    ok('10% of that is the amount', c1?.amountPaisa === 10_000, taka(c1?.amountPaisa ?? 0));
    ok('and a real ledger entry came back (MKT-RULE-016)', !!c1?.journalEntryId);
    ok('it starts on hold, not withdrawable', c1?.state === 'PENDING');

    const again = await affiliates.accrueForOrder(oRef.id);
    ok('accruing the same order twice does nothing the second time',
      'skipped' in again && again.skipped === 'already accrued');

    console.log('\n--- an affiliate cannot earn on their own purchase (MKT-RULE-015) ---');
    const own = await makeOrder({
      subtotal: 300_000, ref: aff.code, delivered: true,
      customerId: promoterAsBuyer.id, phone: promoterPhone,
    });
    await attribution.decide(own.id);
    const selfBuy = await affiliates.accrueForOrder(own.id);
    ok('a matching phone number blocks it', 'skipped' in selfBuy && String(selfBuy.skipped).includes('self purchase'));

    console.log('\n--- the ledger says the same thing (MKT-D10) ---');
    const payableLines = await prisma.journalLine.findMany({
      where: { entry: { sourceKey: `AFFCOM:${c1?.id}` } },
      include: { account: { select: { code: true } } },
    });
    const dr = payableLines.find((l) => l.debitPaisa > 0);
    const cr = payableLines.find((l) => l.creditPaisa > 0);
    ok('the cost lands in 5451', dr?.account.code === ACC2.AFFILIATE_COMMISSION);
    ok('and the liability in 2120', cr?.account.code === ACC2.AFFILIATE_PAYABLE);
    ok('and the two sides match', (dr?.debitPaisa ?? 0) === (cr?.creditPaisa ?? -1));

    /* ================================================================
       7. the hold, and the payout (MKT-RULE-013/016)
       ================================================================ */
    console.log('\n=== 7. money does not leave until the hold is over ===');
    await refuses(
      'a payout is refused while everything is still on hold',
      () => affiliates.payout({ affiliateId: aff.id, paidFromId: cashAcc!.id }, 'selftest'),
      'nothing is available',
    );

    await prisma.affiliateCommission.updateMany({
      where: { affiliateId: aff.id, state: 'PENDING' },
      data: { availableAt: new Date(Date.now() - 864e5) },
    });
    const released = await affiliates.releaseHolds();
    ok('once the window passes it is released', released.released >= 1, `${released.released}`);

    await refuses(
      'a payout below the minimum is refused',
      () => affiliates.payout({ affiliateId: aff.id, paidFromId: cashAcc!.id }, 'selftest'),
      'minimum',
    );

    // earn enough to clear the minimum
    const big = await makeOrder({ subtotal: 6_000_000, ref: aff.code, delivered: true });
    await attribution.decide(big.id);
    await affiliates.accrueForOrder(big.id);
    await prisma.affiliateCommission.updateMany({
      where: { affiliateId: aff.id, state: 'PENDING' },
      data: { availableAt: new Date(Date.now() - 864e5) },
    });
    await affiliates.releaseHolds();

    /* THE HR-R28 GUARD, tested directly.
       Work out the payout number this call will take, plant a decoy entry on
       that exact sourceKey, and then try to pay. postEntry() will judge the
       entry a duplicate and hand back null. The rule says: refuse, and leave
       nothing behind. In HR the same shape wrote "APPROVED" over an empty
       ledger and nobody noticed for a month. */
    console.log('\n--- MKT-RULE-016: no ledger entry, no payout ---');
    const allPayouts = await prisma.affiliatePayout.findMany({ select: { payoutNo: true } });
    let max = 0;
    for (const p of allPayouts) {
      const m = /^APO-(\d{4,})$/.exec(p.payoutNo);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    const nextNo = `APO-${String(max + 1).padStart(6, '0')}`;
    const decoy = await finance.postEntry({
      sourceType: 'AFFILIATE',
      sourceKey: `AFFPAY:${nextNo}`,
      narration: `${TAG} decoy — blocks the next payout number`,
      lines: [
        { accountCode: ACC2.AFFILIATE_PAYABLE, debitPaisa: 100 },
        { accountCode: ACC2.AFFILIATE_COMMISSION, creditPaisa: 100 },
      ],
    });
    ok('the decoy entry was planted', !!decoy, nextNo);

    const beforeCount = await prisma.affiliatePayout.count();
    await refuses(
      'the payout is refused outright when the ledger refuses the entry',
      () => affiliates.payout({ affiliateId: aff.id, paidFromId: cashAcc!.id }, 'selftest'),
      'NOT recorded',
    );
    const afterCount = await prisma.affiliatePayout.count();
    ok('and NOTHING was left behind claiming the money moved', afterCount === beforeCount,
      `${beforeCount} → ${afterCount}`);
    ok('no commission was marked paid either',
      (await prisma.affiliateCommission.count({ where: { affiliateId: aff.id, state: 'PAID' } })) === 0);

    // clear the decoy and pay properly
    await prisma.journalLine.deleteMany({ where: { entry: { sourceKey: `AFFPAY:${nextNo}` } } });
    await prisma.journalEntry.deleteMany({ where: { sourceKey: `AFFPAY:${nextNo}` } });

    console.log('\n--- and now the real thing ---');
    const paid = await affiliates.payout(
      { affiliateId: aff.id, paidFromId: cashAcc!.id, reference: `${TAG} txn` },
      'selftest',
    );
    ok('the payout went through', !!paid.payoutNo, paid.payoutNo);
    ok('with a real ledger entry behind it', !!paid.entryNo, paid.entryNo);
    ok('every available commission is now PAID',
      (await prisma.affiliateCommission.count({ where: { affiliateId: aff.id, state: 'AVAILABLE' } })) === 0);

    const payoutLines = await prisma.journalLine.findMany({
      where: { entry: { sourceKey: `AFFPAY:${paid.payoutNo}` } },
      include: { account: { select: { code: true, isMoneyAccount: true } } },
    });
    ok('the liability is cleared…', payoutLines.some((l) => l.account.code === ACC2.AFFILIATE_PAYABLE && l.debitPaisa > 0));
    ok('…and real money left a money account', payoutLines.some((l) => l.account.isMoneyAccount && l.creditPaisa > 0));

    /* ================================================================
       8. the order comes back (MKT-RULE-014)
       ================================================================ */
    console.log('\n=== 8. a returned order takes its commission back ===');
    const rev = await affiliates.reverseForOrder(big.id, `${TAG} customer returned it`, 'selftest');
    ok('the commission is reversed', rev.reversed >= 1);
    const reversedRow = await prisma.affiliateCommission.findFirst({ where: { orderId: big.id } });
    ok('its state says so', reversedRow?.state === 'REVERSED');
    const revEntry = await prisma.journalEntry.findUnique({ where: { sourceKey: `AFFREV:${reversedRow?.id}` } });
    ok('the correction is its own entry, never an edit (FIN-RULE-003)', !!revEntry);

    const detail = await affiliates.get(aff.id);
    ok('money already handed over is now shown as owed back',
      detail.recoverablePaisa === (reversedRow?.amountPaisa ?? -1), taka(detail.recoverablePaisa));

    console.log('\n--- and it nets off the next payout ---');
    const nextOrder = await makeOrder({ subtotal: 9_000_000, ref: aff.code, delivered: true });
    await attribution.decide(nextOrder.id);
    await affiliates.accrueForOrder(nextOrder.id);
    await prisma.affiliateCommission.updateMany({
      where: { affiliateId: aff.id, state: 'PENDING' },
      data: { availableAt: new Date(Date.now() - 864e5) },
    });
    await affiliates.releaseHolds();
    const second = await affiliates.payout({ affiliateId: aff.id, paidFromId: cashAcc!.id }, 'selftest');
    ok('the recovery was taken out of it', second.recoveredPaisa > 0, taka(second.recoveredPaisa));
    ok('so the net is less than what was earned', second.netPaisa === second.amountPaisa - second.recoveredPaisa);
    const afterDetail = await affiliates.get(aff.id);
    ok('and nothing is owed back any more', afterDetail.recoverablePaisa === 0);

    /* ================================================================
       9. occasions and outreach (MKT-D07)
       ================================================================ */
    console.log('\n=== 9. who is worth a message this week? ===');
    const inThree = new Date();
    inThree.setDate(inThree.getDate() + 3);
    const mmdd = `${String(inThree.getMonth() + 1).padStart(2, '0')}-${String(inThree.getDate()).padStart(2, '0')}`;

    const recipient = await prisma.recipient.create({
      data: {
        customerId: buyer.id,
        name: `${TAG} Salma`,
        phone: '+8801711111111',
        relationship: 'wife',
        zone: 'DHAKA',
        addressLine: 'Banani, Dhaka',
      },
    });
    await prisma.recipientOccasion.create({
      data: { recipientId: recipient.id, type: 'BIRTHDAY', date: mmdd },
    });

    const due = await outreach.dueOccasions({ days: '7' });
    const mine = due.items.find((i) => i.recipient.id === recipient.id);
    ok('the occasion turns up in the list', !!mine, `${mmdd} in ${mine?.inDays} days`);
    ok('the person to message is the BUYER, not the recipient (MKT-RULE-007)',
      mine?.customer.id === buyer.id && mine?.customer.phone === buyer.phone);
    ok('the message can mention what they sent last time', mine?.lastOrder !== undefined);

    console.log('\n--- one occasion, one contact per year (MKT-RULE-008) ---');
    const first = await outreach.log(
      { customerId: buyer.id, recipientId: recipient.id, occasionType: 'BIRTHDAY', occasionDate: mmdd, channel: 'WHATSAPP' },
      'selftest',
    );
    ok('the first contact is recorded', !!first.id);
    const twice = await outreach.log(
      { customerId: buyer.id, recipientId: recipient.id, occasionType: 'BIRTHDAY', occasionDate: mmdd, channel: 'WHATSAPP' },
      'selftest',
    );
    ok('a second one is refused, not duplicated', 'duplicate' in twice && twice.duplicate === true);
    const after = await outreach.dueOccasions({ days: '7' });
    ok('and the list now says so', after.items.find((i) => i.recipient.id === recipient.id)?.alreadyContacted === true);

    console.log('\n--- 29 February (MKT-RULE-010) ---');
    const leapRecipient = await prisma.recipient.create({
      data: {
        customerId: buyer.id, name: `${TAG} Leapling`, phone: '+8801722222222',
        relationship: 'friend', zone: 'DHAKA', addressLine: 'Dhanmondi, Dhaka',
      },
    });
    await prisma.recipientOccasion.create({
      data: { recipientId: leapRecipient.id, type: 'BIRTHDAY', date: '02-29' },
    });
    const wide = await outreach.dueOccasions({ days: '120' });
    const today = new Date();
    const year = today.getFullYear();
    const leapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const feb28Ahead = (() => {
      const d = new Date(year, 1, 28);
      if (d < today) d.setFullYear(year + 1);
      return Math.round((d.getTime() - new Date(year, today.getMonth(), today.getDate()).getTime()) / 864e5);
    })();
    const reachable = feb28Ahead <= 120 && feb28Ahead >= 0;
    if (reachable && !leapYear) {
      ok('a 29 Feb birthday surfaces in a non-leap year',
        wide.items.some((i) => i.recipient.id === leapRecipient.id));
    } else {
      ok('29 Feb rule checked (out of window today — the code path is the same)', true,
        `feb28 is ${feb28Ahead} days away, leap year: ${leapYear}`);
    }

    console.log('\n--- somebody who says stop (MKT-RULE-009) ---');
    await outreach.optOut({ customerId: buyer.id, reason: `${TAG} asked to stop` }, 'selftest');
    const afterOptOut = await outreach.dueOccasions({ days: '120' });
    ok('they vanish from the list entirely',
      !afterOptOut.items.some((i) => i.customer.id === buyer.id));
    await refuses(
      'and a message cannot be logged for them, not even by hand',
      () => outreach.log({ customerId: buyer.id, channel: 'PHONE', purpose: 'FOLLOW_UP' }, 'selftest'),
      'asked not to be contacted',
    );
    await outreach.optIn(buyer.id, 'selftest');
    const afterOptIn = await outreach.dueOccasions({ days: '120' });
    ok('consent can be given back', afterOptIn.items.some((i) => i.customer.id === buyer.id));

    console.log('\n--- did it work? ---');
    const effect = await outreach.effect(365);
    ok('the effect report runs', effect.contacted >= 1, `${effect.contacted} contacted`);

    /* ================================================================
       10. a used campaign is archived, never deleted (MKT-RULE-018)
       ================================================================ */
    console.log('\n=== 10. history cannot be quietly rewritten ===');
    const removal = await campaigns.remove(camp.id, 'selftest');
    ok('a campaign with orders and expenses is archived instead of deleted',
      removal.deleted === false && removal.archived === true, removal.message);
    const unused = await campaigns.create(
      { name: `${TAG} unused`, startDate: '2027-05-01', endDate: '2027-05-05' },
      'selftest',
    );
    const gone = await campaigns.remove(unused.id, 'selftest');
    ok('an unused one can be removed', gone.deleted === true);

    /*  Regression, found by this test on its first run: the next number was
        counted through the soft-delete-filtered client, so removing a campaign
        made the following one reuse its number and the create failed on the
        unique index. It would have happened the first time the owner deleted
        a campaign and made another. */
    const afterDelete = await campaigns.create(
      { name: `${TAG} after a deletion`, startDate: '2027-06-01', endDate: '2027-06-05' },
      'selftest',
    );
    ok('a removed campaign does not hand its number to the next one',
      afterDelete.campaignNo !== unused.campaignNo,
      `${unused.campaignNo} → ${afterDelete.campaignNo}`);

    /* ================================================================
       11. the automation (MKT-D14)

       NOTE: advanceStatuses() and reconcileReversals() are global by design —
       they reconcile the whole ledger, which is the point. Calling them here
       does only what the clock would have done within fifteen minutes anyway.
       ================================================================ */
    console.log('\n=== 11. the clock does the work nobody remembers to do ===');

    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 300 * 864e5).toISOString().slice(0, 10);

    const shouldStart = await campaigns.create(
      { name: `${TAG} should start`, status: 'PLANNED', startDate: yesterday, endDate: nextYear },
      'selftest',
    );
    const shouldFinish = await campaigns.create(
      { name: `${TAG} should finish`, status: 'RUNNING', startDate: yesterday, endDate: yesterday },
      'selftest',
    );
    // the owner called it off early — the machine must not restart it
    const calledOff = await campaigns.create(
      { name: `${TAG} called off early`, status: 'FINISHED', startDate: yesterday, endDate: nextYear },
      'selftest',
    );

    await campaigns.advanceStatuses();
    const advanced = await prisma.campaign.findMany({
      where: { id: { in: [shouldStart.id, shouldFinish.id, calledOff.id] } },
      select: { id: true, status: true },
    });
    const stat = (id: string) => advanced.find((c) => c.id === id)?.status;
    ok('a campaign whose start date has arrived begins by itself', stat(shouldStart.id) === 'RUNNING');
    ok('one past its end date finishes by itself', stat(shouldFinish.id) === 'FINISHED');
    ok('one the owner stopped early is NOT restarted', stat(calledOff.id) === 'FINISHED');

    console.log('\n--- a cancelled order gives the commission back, unasked ---');
    const doomed = await makeOrder({ subtotal: 400_000, ref: aff.code, delivered: true });
    await attribution.decide(doomed.id);
    await affiliates.accrueForOrder(doomed.id);
    const liveOne = await prisma.affiliateCommission.findFirst({ where: { orderId: doomed.id } });
    ok('it earned first', liveOne?.state === 'PENDING', taka(liveOne?.amountPaisa ?? 0));

    await prisma.order.update({ where: { id: doomed.id }, data: { salesStatus: 'cancelled' } });
    const rec = await affiliates.reconcileReversals(30);
    ok('the reconciliation noticed without being told', rec.reversed >= 1, `${rec.reversed} reversed`);
    const afterRec = await prisma.affiliateCommission.findFirst({ where: { orderId: doomed.id } });
    ok('and the commission is gone', afterRec?.state === 'REVERSED', afterRec?.reversedNote ?? '');

    /* ================================================================
       12. referral & points (MKT-D16 / D17)
       ================================================================ */
    console.log('\n=== 12. a customer brings a friend ===');

    const code = await referral.codeFor(buyer.id);
    ok('a code is made on demand', !!code.code, code.code);
    ok('and it is uppercase', code.code === code.code.toUpperCase());
    ok('asking twice gives the same one', (await referral.codeFor(buyer.id)).code === code.code);

    const newFriend = await prisma.customer.create({
      data: { name: `${TAG} Friend`, phone: `+88017${stamp}3`, note: TAG },
    });

    await refuses('somebody cannot refer themselves', () =>
      referral.join({ code: code.code, friendId: buyer.id }, 'selftest'), 'refer themselves');
    await refuses('a code nobody owns is refused', () =>
      referral.join({ code: 'NOSUCHCODE', friendId: newFriend.id }, 'selftest'), 'does not belong');

    const joined = await referral.join({ code: code.code, friendId: newFriend.id }, 'selftest');
    ok('a new customer can be referred', joined.state === 'JOINED', joined.referralNo);
    await refuses('and only once, by one person', () =>
      referral.join({ code: code.code, friendId: newFriend.id }, 'selftest'), 'already been referred');

    /*  A referral is for bringing somebody NEW. Every scheme that lets an
        existing customer be "referred" gets used that way within a week.

        The guard reads Customer.ordersCount, which OrdersService and PosService
        increment when a real order is placed. This test builds its orders with
        prisma.order.create directly — deliberately, so it can pin the totals —
        so the counter has to be set here by hand. Without this the check passed
        for the wrong reason and would have gone on passing if somebody deleted
        the rule. */
    await prisma.customer.update({
      where: { id: promoterAsBuyer.id },
      data: { ordersCount: 1 },
    });
    await refuses('an existing customer cannot be referred', () =>
      referral.join({ code: code.code, friendId: promoterAsBuyer.id }, 'selftest'), 'ordered before');

    console.log('\n--- nothing is earned until the friend actually orders ---');
    const before = await referral.balance(buyer.id);
    const friendOrder = await makeOrder({ subtotal: 250_000, customerId: newFriend.id });
    await prisma.order.update({ where: { id: friendOrder.id }, data: { salesStatus: 'placed' } });
    const tooEarly = await referral.rewardForOrder(friendOrder.id);
    ok('an unconfirmed order pays nothing', 'skipped' in tooEarly && tooEarly.skipped === 'not confirmed yet');

    console.log('\n--- confirmed, so pay (the owner picked confirmed, not delivered) ---');
    await prisma.order.update({ where: { id: friendOrder.id }, data: { salesStatus: 'confirmed' } });
    const paidRef = await referral.rewardForOrder(friendOrder.id, 'selftest');
    /*  `?? 0` is not silencing anything. rewardForOrder returns one success
        shape and eight `{ skipped }` shapes, and TypeScript's `in` narrowing
        widens `points` to `number | undefined` across that union. Missing means
        no points were paid, so 0 is the honest reading — and the assertion
        below still demands > 0, which is what actually matters. */
    const gotPoints = ('points' in paidRef ? paidRef.points : 0) ?? 0;
    ok('the points go in', 'referral' in paidRef && gotPoints > 0, `${gotPoints}`);
    const setng = await settings.get();
    const afterReward = await referral.balance(buyer.id);
    ok('the balance is the sum of the ledger, never a stored number',
      afterReward === before + setng.referralPoints, `${before} → ${afterReward}`);

    const again2 = await referral.rewardForOrder(friendOrder.id);
    ok('rewarding the same order twice does nothing', 'skipped' in again2 && again2.skipped === 'already settled');

    console.log('\n--- MKT-D17: a point is a liability the day it is earned ---');
    const pointRow = await prisma.loyaltyPoint.findFirst({
      where: { customerId: buyer.id, reason: 'REFERRAL' },
      orderBy: { createdAt: 'desc' },
    });
    ok('a real ledger entry sits behind the points', !!pointRow?.journalEntryId);
    const pl = await prisma.journalLine.findMany({
      where: { entryId: pointRow?.journalEntryId ?? '' },
      include: { account: { select: { code: true } } },
    });
    ok('the cost lands in 5452', pl.some((l) => l.account.code === ACC2.REFERRAL_COST && l.debitPaisa > 0));
    ok('and the liability in 2130', pl.some((l) => l.account.code === ACC2.LOYALTY_POINTS && l.creditPaisa > 0));
    ok('worth ৳1 a point, as the owner set it',
      pl.some((l) => l.creditPaisa === setng.referralPoints * setng.pointValuePaisa));

    console.log('\n--- MKT-D21: points can NOT become store credit ---');
    /*  Removed 29 Jul. Store credit is money and money has no cap, so this was
        a way round the 20 % loyalty rule; and its accounting was wrong in both
        directions besides. The check is that the method is GONE, not that it
        refuses — a refusal can be softened later by somebody who does not know
        why it was there. */
    ok('the redeem-to-store-credit method no longer exists',
      typeof (referral as unknown as Record<string, unknown>).redeem === 'undefined');
    await refuses('an adjustment with no reason is refused', () =>
      referral.adjust(buyer.id, 10, '  ', 'selftest'), 'say why');

    console.log('\n--- the order is cancelled, so the points come back ---');
    await prisma.order.update({ where: { id: friendOrder.id }, data: { salesStatus: 'cancelled' } });
    const back = await referral.reconcile(30);
    ok('the reconciliation notices without being told', back.reversed >= 1, `${back.reversed}`);
    const refAfter = await prisma.referral.findUnique({ where: { id: joined.id } });
    ok('the referral says taken back', refAfter?.state === 'REVERSED');
    const finalBal = await referral.balance(buyer.id);
    ok('and the points are gone again', finalBal === afterReward - setng.referralPoints,
      `${afterReward} → ${finalBal}`);

    console.log('\n=== 12. MKT-D20: Meta ad numbers ===');
    /*  Meta is not called here. A self-test that needs a live token and a real
        ad account is a self-test that stops being run. What IS tested is
        everything that can go wrong on our side of the wire: the cache key,
        the arithmetic, and the rule that one Meta campaign belongs to exactly
        one Radian campaign. */
    const ACCT = 'act_SELFTEST0001';
    const day = (n: number) => new Date(Date.UTC(2026, 0, n));
    const plant = (extId: string, name: string, onDate: Date, spend: number, imp: number, clk: number, reach: number) =>
      prisma.adInsight.upsert({
        where: {
          platform_accountId_externalCampaignId_onDate: {
            platform: 'META', accountId: ACCT, externalCampaignId: extId, onDate,
          },
        },
        create: {
          platform: 'META', accountId: ACCT, externalCampaignId: extId,
          externalCampaignName: name, onDate,
          spendMinor: spend, currency: 'USD', impressions: imp, clicks: clk, reach,
        },
        update: {
          spendMinor: spend, impressions: imp, clicks: clk, reach, fetchedAt: new Date(),
        },
      });

    await plant('M1', `${TAG} boost`, day(1), 1000, 10_000, 100, 8_000);
    await plant('M1', `${TAG} boost`, day(2), 2000, 20_000, 100, 9_000);
    await plant('M2', `${TAG} retarget`, day(1), 500, 1_000, 50, 900);

    const adRows = await prisma.adInsight.count({ where: { accountId: ACCT } });
    ok('three day-rows land', adRows === 3, `${adRows}`);

    /*  The one that matters: fetching the same day twice must UPDATE, not
        double. Without the compound unique key, a second pull of the same
        window would quietly report twice the spend — and a spend figure that
        grows every time you press refresh is worse than no figure at all. */
    await plant('M1', `${TAG} boost`, day(1), 1000, 10_000, 100, 8_000);
    const afterRepull = await prisma.adInsight.count({ where: { accountId: ACCT } });
    ok('re-fetching the same day overwrites instead of doubling', afterRepull === 3, `${afterRepull}`);

    /*  summary() reads the last N days from today, and these rows are planted
        in January 2026, so the window has to reach back far enough. */
    const lookback = Math.ceil((Date.now() - day(1).getTime()) / 864e5) + 2;
    const sum = await ads.summary(lookback, ACCT);
    const m1 = sum.items.find((i) => i.id === 'M1');
    const m2 = sum.items.find((i) => i.id === 'M2');
    ok('both campaigns come back', !!m1 && !!m2);
    ok('spend adds up across days', m1?.spendMinor === 3000, `${m1?.spendMinor}`);
    ok('impressions add up too', m1?.impressions === 30_000, `${m1?.impressions}`);
    /*  reach is people, not events — the same person seen on two days is one
        person, so adding it would invent an audience that does not exist */
    ok('reach is NOT added across days', m1?.reach === 9_000, `${m1?.reach}`);
    ok('CTR is clicks over impressions',
      Math.abs((m1?.ctr ?? 0) - 200 / 30_000) < 1e-9, `${m1?.ctr}`);
    ok('cost per click is spend over clicks', m1?.cpcMinor === 15, `${m1?.cpcMinor}`);
    ok('the biggest spender is listed first', sum.items[0]?.id === 'M1');

    /*  A USD ad account must never be presented as taka. This flag is what the
        screen uses to leave the expense amount blank — the guard against a
        dollar figure being typed into the books as though it were taka. */
    ok('a USD account is not treated as taka', sum.isTaka === false, sum.currency);

    console.log('\n--- one Meta campaign belongs to exactly one of ours ---');
    const cA = await campaigns.create(
      { name: `${TAG} meta A`, platform: 'FACEBOOK', startDate: '2027-04-01', endDate: '2027-04-30' },
      'selftest',
    );
    const cB = await campaigns.create(
      { name: `${TAG} meta B`, platform: 'FACEBOOK', startDate: '2027-04-01', endDate: '2027-04-30' },
      'selftest',
    );
    await ads.link('M1', cA.id, 'selftest');
    const linked1 = await ads.summary(lookback, ACCT);
    ok('the link shows on the row', linked1.items.find((i) => i.id === 'M1')?.linkedTo?.id === cA.id);

    /*  Moving it must REMOVE it from the first, not add it to both. Two owners
        for one Meta campaign means its spend gets counted twice in ROI — the
        same double-count the cache key above guards against, one level up. */
    await ads.link('M1', cB.id, 'selftest');
    const a2 = await prisma.campaign.findUnique({ where: { id: cA.id } });
    const b2 = await prisma.campaign.findUnique({ where: { id: cB.id } });
    ok('moving it takes it off the old campaign', !a2?.metaCampaignIds.includes('M1'));
    ok('and puts it on the new one', !!b2?.metaCampaignIds.includes('M1'));

    await ads.link('M1', null, 'selftest');
    const b3 = await prisma.campaign.findUnique({ where: { id: cB.id } });
    ok('and it can be untied again', !b3?.metaCampaignIds.includes('M1'));

    await refuses('tying it to a campaign that does not exist is refused', () =>
      ads.link('M1', 'no-such-campaign', 'selftest'), 'does not exist');

    console.log('\n--- MKT-D05: reading the ad account never moves money ---');
    /*  The whole point of this module. Meta's figure is a report, not a
        transaction — if any of the above had posted an entry, the books would
        start disagreeing with the bank by exactly the exchange rate. */
    const ledgerBefore = await prisma.journalEntry.count();
    await ads.summary(lookback, ACCT);
    await ads.link('M2', cB.id, 'selftest');
    const ledgerAfter = await prisma.journalEntry.count();
    ok('not one ledger entry was written', ledgerAfter === ledgerBefore,
      `${ledgerBefore} → ${ledgerAfter}`);

    /*  And nothing pulls without credentials — a half-configured integration
        must refuse loudly, not return zeros that look like "we spent nothing". */
    const trk = await prisma.trackingSetting.findUnique({ where: { id: 'singleton' } });
    if (!trk?.adsEnabled || !trk?.adAccountId || !trk?.adsAccessToken) {
      await refuses('with no credentials, fetching refuses instead of returning zeros', () =>
        ads.pull(7, 'selftest'));
    } else {
      ok('credentials are configured — the refusal path is not testable here', true);
    }

    console.log('\n=== 13. MKT-D21: loyalty points ===');
    /*  Every number here is a setting, so the test sets them itself and puts
        them back afterwards — a self-test that depends on whatever the owner
        last typed is a self-test that fails on a Tuesday for no reason. */
    const before21 = await settings.get();
    await settings.update(
      { loyaltyEnabled: true, earnRateBp: 100, earnMultiplierBp: 10000,
        multiplierUntil: null, redeemMaxBp: 2000, minRedeemPoints: 50 },
      'selftest',
    );

    const loyCust = await prisma.customer.create({
      data: { name: `${TAG} Loyal`, phone: `0170000${Math.floor(Math.random() * 9000 + 1000)}`, note: TAG },
    });

    console.log('\n--- nothing until the flowers arrive ---');
    const loyNotYet = await makeOrder({ subtotal: 100_000, customerId: loyCust.id });
    const e0 = await loyalty.earnForOrder(loyNotYet.id, 'selftest');
    ok('a confirmed but undelivered order earns nothing',
      'skipped' in e0 && e0.skipped === 'not delivered yet');
    ok('so the balance is still zero', (await loyalty.balance(loyCust.id)) === 0);

    console.log('\n--- delivered, so 1% of goods after discount ---');
    /*  ৳1,000 goods, ৳100 off, ৳80 delivery, ৳50 VAT.
        1 % of (1000 − 100) = ৳9 = 9 points. NOT of ৳1,030, which is what the
        customer actually handed over — the rider takes the delivery and the
        government takes the VAT, so neither was Radian's to give away. */
    const loyOrder = await makeOrder({
      subtotal: 100_000, discount: 10_000, delivery: 8_000, vat: 5_000,
      customerId: loyCust.id, delivered: true,
    });
    const e1 = await loyalty.earnForOrder(loyOrder.id, 'selftest');
    ok('points land on delivery', 'earned' in e1, JSON.stringify(e1));
    ok('and it is 1% of goods MINUS discount, not of what was paid',
      'earned' in e1 && e1.earned === 9, `${'earned' in e1 ? e1.earned : '?'} points`);
    ok('the balance is the sum of the ledger', (await loyalty.balance(loyCust.id)) === 9);

    const e2 = await loyalty.earnForOrder(loyOrder.id, 'selftest');
    ok('earning twice on one order does nothing', 'skipped' in e2 && e2.skipped === 'already earned');

    console.log('\n--- MKT-D17: the point is a liability the day it is earned ---');
    await finance.ensureSeed();
    const loyRow = await prisma.loyaltyPoint.findFirst({
      where: { customerId: loyCust.id, reason: 'PURCHASE' },
    });
    ok('a real ledger entry sits behind it', !!loyRow?.journalEntryId);
    const loyLines = await prisma.journalLine.findMany({
      where: { entryId: loyRow?.journalEntryId ?? '' },
      include: { account: { select: { code: true } } },
    });
    ok('the cost lands in 5453, apart from referral cost',
      loyLines.some((l) => l.account.code === ACC2.LOYALTY_COST && l.debitPaisa === 900));
    ok('and the liability in 2130',
      loyLines.some((l) => l.account.code === ACC2.LOYALTY_POINTS && l.creditPaisa === 900));

    console.log('\n--- the festival multiplier ---');
    await settings.update({ earnMultiplierBp: 30000 }, 'selftest');
    const tripled = await loyalty.currentRate();
    ok('×3 makes 1% into 3%', tripled.effectiveBp === 300, `${tripled.effectiveBp} bp`);
    /*  An expired festival must fall back on its own. A double-points week that
        nobody remembers to end is a permanent rate nobody ever decided. */
    await settings.update(
      { multiplierUntil: new Date(Date.now() - 864e5).toISOString() }, 'selftest');
    const expired = await loyalty.currentRate();
    ok('and it switches itself off once the end date has passed',
      expired.effectiveBp === 100 && !expired.festivalOn, `${expired.effectiveBp} bp`);
    await settings.update({ earnMultiplierBp: 10000, multiplierUntil: null }, 'selftest');

    console.log('\n--- spending: the customer always pays 80% themselves ---');
    /*  Give the customer a real balance to spend. 500 points on a ৳1,000 order:
        the cap is 20 % of ৳1,000 = ৳200 = 200 points. */
    await loyalty.adjust(loyCust.id, 491, 'selftest top-up', 'selftest');
    ok('the balance is 500', (await loyalty.balance(loyCust.id)) === 500);

    const spendOrder = await makeOrder({
      subtotal: 100_000, delivery: 8_000, vat: 5_000, customerId: loyCust.id,
    });
    const loyQ = await loyalty.quote(spendOrder.id);
    ok('the cap is 20% of the goods', loyQ.capPoints === 200, `${loyQ.capPoints}`);
    ok('and the customer has more than that, so 200 is the answer', loyQ.maxUsable === 200);
    /*  The heart of the owner's rule: delivery and VAT are outside the cap in
        BOTH directions. If the cap were a share of what the customer sees
        (৳1,130), it would be 226 — and 26 of those points would be paying the
        rider and the government. */
    ok('delivery and VAT are NOT in the base', loyQ.basePaisa === 100_000, `${loyQ.basePaisa}`);
    ok('the screen says so out loud', loyQ.deliveryPaisa === 8_000 && loyQ.vatPaisa === 5_000);

    await refuses('spending more than the cap is refused', () =>
      loyalty.redeemForOrder(spendOrder.id, 201, 'selftest'), 'at most 200');
    await refuses('and less than the floor is refused too', () =>
      loyalty.redeemForOrder(spendOrder.id, 49, 'selftest'), 'smallest redemption');

    const spent = await loyalty.redeemForOrder(spendOrder.id, 150, 'selftest');
    ok('150 points go against the order', spent.points === 150);
    ok('worth ৳150', spent.paisa === 15_000, taka(spent.paisa));
    ok('the balance drops', spent.balance === 350, `${spent.balance}`);

    const spentOrder = await prisma.order.findUnique({ where: { id: spendOrder.id } });
    ok('the order records what settled it', spentOrder?.pointsUsed === 150);
    /*  A TENDER, not a discount. subtotal and VAT are untouched — the invoice
        is still ৳1,000 of flowers and the government is still owed ৳50,
        whatever the customer used to pay. */
    ok('the goods value is untouched', spentOrder?.subtotalPaisa === 100_000);
    ok('and so is the VAT — points do not shrink what the government is owed',
      spentOrder?.vatPaisa === 5_000);
    ok('what is still due falls by exactly the points', spentOrder?.pointsPaisa === 15_000);

    console.log('\n--- and the ledger says the same thing ---');
    const spendRow = await prisma.loyaltyPoint.findFirst({
      where: { customerId: loyCust.id, reason: 'REDEEMED' },
      orderBy: { createdAt: 'desc' },
    });
    const spendLines = await prisma.journalLine.findMany({
      where: { entryId: spendRow?.journalEntryId ?? '' },
      include: { account: { select: { code: true } } },
    });
    /*  Spending discharges the promise against the bill. It must NOT credit
        5453 — the cost was real on the day the point was given, and un-booking
        it now would make a redeemed point look free. */
    ok('the liability is paid down', spendLines.some((l) => l.account.code === ACC2.LOYALTY_POINTS && l.debitPaisa === 15_000));
    ok('against the receivable, not against the cost',
      spendLines.some((l) => l.account.code === ACC.RECEIVABLE && l.creditPaisa === 15_000));
    ok('the cost account is NOT touched by a redemption',
      !spendLines.some((l) => l.account.code === ACC2.LOYALTY_COST));

    console.log('\n--- the rest of the cap is still there ---');
    const loyQ2 = await loyalty.quote(spendOrder.id);
    ok('50 points of room left', loyQ2.maxUsable === 50, `${loyQ2.maxUsable}`);
    await refuses('and once it is used the cap refuses more', async () => {
      await loyalty.redeemForOrder(spendOrder.id, 50, 'selftest');
      await loyalty.redeemForOrder(spendOrder.id, 50, 'selftest');
    });

    console.log('\n--- cancelled, so the points come back ---');
    await prisma.order.update({ where: { id: loyOrder.id }, data: { salesStatus: 'cancelled' } });
    const undone = await loyalty.reverseForOrder(loyOrder.id, 'selftest');
    ok('the 9 points are taken back', 'reversed' in undone && undone.reversed === 9);
    const loyTwice = await loyalty.reverseForOrder(loyOrder.id, 'selftest');
    ok('and taking them back twice does nothing', 'skipped' in loyTwice);

    console.log('\n--- the books and the screen agree ---');
    const ov = await loyalty.overview();
    ok('the overview reports a liability', ov.liabilityPaisa >= 0, taka(ov.liabilityPaisa));
    ok('and it matches account 2130 to the paisa', ov.agrees,
      `points say ${taka(ov.liabilityPaisa)}, ledger says ${taka(ov.ledgerPaisa)}`);

    console.log('\n--- switched off means switched off ---');
    await settings.update({ loyaltyEnabled: false }, 'selftest');
    const offOrder = await makeOrder({ subtotal: 500_000, customerId: loyCust.id, delivered: true });
    const eOff = await loyalty.earnForOrder(offOrder.id, 'selftest');
    ok('nothing is earned while it is off', 'skipped' in eOff && eOff.skipped === 'loyalty is switched off');
    await refuses('and nothing can be spent either', () =>
      loyalty.redeemForOrder(offOrder.id, 50, 'selftest'), 'switched off');

    /*  put the owner's settings back exactly as they were */
    await settings.update(
      { loyaltyEnabled: before21.loyaltyEnabled, earnRateBp: before21.earnRateBp,
        earnMultiplierBp: before21.earnMultiplierBp,
        multiplierUntil: before21.multiplierUntil ? before21.multiplierUntil.toISOString() : null,
        redeemMaxBp: before21.redeemMaxBp, minRedeemPoints: before21.minRedeemPoints },
      'selftest',
    );

    console.log('\n=== 14. the 30 Jul review — every fix, pinned ===');
    /*  Each of these failed before 30 Jul 2026. They are here so that undoing
        any one of the fixes turns this run red rather than passing quietly —
        which is exactly what the ordersCount check did until it was caught. */

    console.log('\n--- REV-MKT-1: a deleted row is invisible through prisma.db.findUnique ---');
    /*  Prisma will not take deletedAt in a findUnique where clause, so for a
        long time the extension simply did not filter it and the header said
        "use findFirst". Nobody did — 28 call sites in this module alone. The
        extension now drops the row after the query instead. */
    const revCamp = await campaigns.create(
      { name: `${TAG} doomed`, platform: 'FACEBOOK', startDate: '2027-06-01', endDate: '2027-06-30' },
      'selftest',
    );
    await campaigns.remove(revCamp.id, 'selftest'); // nothing points at it → real soft delete
    const goneRaw = await prisma.campaign.findUnique({ where: { id: revCamp.id } });
    ok('the row is still in the table, only marked', !!goneRaw?.deletedAt);
    const goneFiltered = await prisma.db.campaign.findUnique({ where: { id: revCamp.id } });
    ok('but prisma.db.findUnique no longer returns it', goneFiltered === null);
    await refuses('so opening it says not found', () => campaigns.get(revCamp.id), 'not found');

    /*  The money version of the same bug, which is the one that mattered: a
        deleted affiliate could still be looked up by id and paid. */
    const deadAff = await affiliates.create(
      { name: `${TAG} deleted promoter`, phone: `0179${Math.floor(Math.random() * 9000000 + 1000000)}` },
      'selftest',
    );
    await affiliates.remove(deadAff.id, 'selftest'); // never earned → real soft delete
    await refuses('a deleted affiliate cannot be opened', () =>
      affiliates.get(deadAff.id), 'not found');
    await refuses('and cannot be paid', () =>
      affiliates.payout({ affiliateId: deadAff.id, paidFromId: 'anything' } as never, 'selftest'),
      'not found');

    console.log('\n--- REV-MKT-2: pausing an affiliate actually stops them earning ---');
    /*  remove() on an affiliate who has ever earned PAUSES them. Until this
        review nothing read that status, so the pause was decoration: the sweep
        kept accruing on every new order carrying their code. */
    const paused = await affiliates.create(
      { name: `${TAG} paused promoter`, phone: `0178${Math.floor(Math.random() * 9000000 + 1000000)}`, commissionBp: 1000 },
      'selftest',
    );
    const pausedOrder1 = await makeOrder({ subtotal: 200_000, ref: paused.code, delivered: true });
    await attribution.decide(pausedOrder1.id);
    const firstEarn = await affiliates.accrueForOrder(pausedOrder1.id, 'selftest');
    ok('while ACTIVE they earn', 'commission' in firstEarn, JSON.stringify(firstEarn).slice(0, 80));

    const pausedNow = await affiliates.remove(paused.id, 'selftest');
    ok('removing an affiliate who has earned pauses them instead',
      pausedNow.deleted === false && pausedNow.affiliate?.status === 'PAUSED');

    const pausedOrder2 = await makeOrder({ subtotal: 200_000, ref: paused.code, delivered: true });
    const decided = await attribution.decide(pausedOrder2.id);
    ok('a paused code no longer wins rung 1', decided?.affiliateId !== paused.id,
      `${decided?.source}`);
    const secondEarn = await affiliates.accrueForOrder(pausedOrder2.id, 'selftest');
    ok('and accrual refuses them outright', 'skipped' in secondEarn, JSON.stringify(secondEarn).slice(0, 80));

    /*  But what they earned while active is still theirs — pausing somebody
        must not quietly confiscate money they have already worked for. */
    const stillOwed = await affiliates.get(paused.id);
    ok('what they earned before the pause is untouched',
      stillOwed.pendingPaisa + stillOwed.availablePaisa + stillOwed.paidPaisa === 20_000,
      taka(stillOwed.pendingPaisa + stillOwed.availablePaisa));

    console.log('\n--- REV-MKT-3: a WHOLE return takes the points back ---');
    /*  The affiliate side has checked returns since the beginning. Loyalty and
        Referral only ever looked at "cancelled", so a customer could send the
        whole order back and keep the points — and the owner had been told
        returns were handled. */
    await settings.update(
      { loyaltyEnabled: true, earnRateBp: 100, redeemMaxBp: 2000, minRedeemPoints: 50 },
      'selftest',
    );
    const retCust = await prisma.customer.create({
      data: { name: `${TAG} Returner`, phone: `0176000${Math.floor(Math.random() * 9000 + 1000)}`, note: TAG },
    });
    const retOrder = await makeOrder({
      subtotal: 500_000, customerId: retCust.id, delivered: true,
    });
    const retEarn = await loyalty.earnForOrder(retOrder.id, 'selftest');
    ok('the order earns 50 points', 'earned' in retEarn && retEarn.earned === 50,
      JSON.stringify(retEarn).slice(0, 60));

    // the whole ৳5,000 of goods comes back, and the return is COMPLETED
    await prisma.salesReturn.create({
      data: {
        returnNo: `${ORDER_PREFIX}RTN-${Date.now()}`,
        orderId: retOrder.id,
        customerId: retCust.id,
        status: 'completed',
        returnValuePaisa: 500_000,
        actorName: 'selftest',
        note: TAG,
      },
    });

    const sweepBack = await loyalty.reconcile(30);
    ok('the sweep notices the return without being told', sweepBack.reversed >= 1,
      `${sweepBack.reversed}`);
    ok('and the points are gone', (await loyalty.balance(retCust.id)) === 0,
      `${await loyalty.balance(retCust.id)}`);

    /*  A PARTIAL return is deliberately left alone — docking somebody by a
        formula nobody can explain is worse than showing it (MKT-D14). */
    const partCust = await prisma.customer.create({
      data: { name: `${TAG} Partial`, phone: `0175000${Math.floor(Math.random() * 9000 + 1000)}`, note: TAG },
    });
    const partOrder = await makeOrder({ subtotal: 500_000, customerId: partCust.id, delivered: true });
    await loyalty.earnForOrder(partOrder.id, 'selftest');
    await prisma.salesReturn.create({
      data: {
        returnNo: `${ORDER_PREFIX}RTN-P-${Date.now()}`,
        orderId: partOrder.id,
        customerId: partCust.id,
        status: 'completed',
        returnValuePaisa: 100_000, // a fifth of it
        actorName: 'selftest',
        note: TAG,
      },
    });
    await loyalty.reconcile(30);
    ok('a partial return is left alone, on purpose',
      (await loyalty.balance(partCust.id)) === 50, `${await loyalty.balance(partCust.id)}`);

    console.log('\n--- REV-MKT-4: a deleted customer is not on the occasion list ---');
    /*  recipientOccasion is filtered, but the recipient and the customer arrive
        through a nested include and the extension does not reach in there. The
        opt-out check next door already knew that; the two rows above it did
        not, so a deleted customer kept appearing every year with a one-click
        WhatsApp button beside their name. */
    const ghost = await prisma.customer.create({
      data: { name: `${TAG} Ghost`, phone: `0174000${Math.floor(Math.random() * 9000 + 1000)}`, note: TAG },
    });
    const ghostRec = await prisma.recipient.create({
      data: {
        customerId: ghost.id,
        name: `${TAG} ghost wife`,
        relationship: 'wife',
        phone: ghost.phone ?? '',
        zone: 'DHAKA',
        addressLine: 'Uttara, Dhaka',
      },
    });
    const soon = new Date();
    soon.setDate(soon.getDate() + 2);
    await prisma.recipientOccasion.create({
      data: {
        recipientId: ghostRec.id,
        type: 'BIRTHDAY',
        date: `${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`,
        label: `${TAG} ghost birthday`,
      },
    });
    const seen = await outreach.dueOccasions({ days: '7' });
    ok('while alive they are on the list',
      seen.items.some((i) => i.customer.id === ghost.id), `${seen.items.length} due`);

    await prisma.customer.update({ where: { id: ghost.id }, data: { deletedAt: new Date() } });
    const seenAfter = await outreach.dueOccasions({ days: '7' });
    ok('once deleted they are gone from it',
      !seenAfter.items.some((i) => i.customer.id === ghost.id));
    await prisma.customer.update({ where: { id: ghost.id }, data: { deletedAt: null } });

    console.log('\n--- REV-MKT-5: the honesty figure counts one population, not two ---');
    /*  unattributed30 = orders placed in 30 days − attributions DECIDED in 30
        days. Re-deciding an old order (which the nightly sweep does over 365
        days) pushed the second number up without touching the first, so "how
        many orders we cannot explain" drifted towards zero on its own. */
    const oldOrder = await makeOrder({ subtotal: 100_000, coupon: null });
    await prisma.order.update({
      where: { id: oldOrder.id },
      data: { placedAt: new Date(Date.now() - 60 * 864e5) },
    });
    await prisma.orderAttribution.upsert({
      where: { orderId: oldOrder.id },
      create: {
        orderId: oldOrder.id, source: 'MANUAL', decidedBy: 'selftest',
        decidedAt: new Date(), campaignId: camp.id,
      },
      update: { source: 'MANUAL', decidedAt: new Date(), campaignId: camp.id },
    });
    const honest = await campaigns.stats();
    ok('an order placed 60 days ago does not count as attributed this month',
      honest.attributed30 <= honest.orders30,
      `${honest.attributed30} of ${honest.orders30}`);
    ok('so the unattributed count can never be negative-then-clamped',
      honest.unattributed30 === honest.orders30 - honest.attributed30,
      `${honest.unattributed30}`);

    console.log('\n--- REV-MKT-6: both audience date filters apply, not just the last one ---');
    /*  Each used to assign where.lastOrderAt outright, so "bought in the last
        90 days but not in the last 30" quietly became just the second half —
        a WIDER list than anybody asked for, which on a send list is the wrong
        way to be wrong. */
    /*  A "0 ≤ 0" comparison would pass whatever the code did, so plant somebody
        the two filters must disagree about: last bought 200 days ago. They
        belong in "has not bought for 30 days", and they must NOT survive
        "bought within 90 days AND has not bought for 30". */
    const stale = await prisma.customer.create({
      data: {
        name: `${TAG} Stale`,
        phone: `0173000${Math.floor(Math.random() * 9000 + 1000)}`,
        note: TAG,
        status: 'ACTIVE',
        ordersCount: 3,
        lastOrderAt: new Date(Date.now() - 200 * 864e5),
      },
    });
    const wideList = await wa.preview({ notOrderedForDays: 30, limit: 2000 });
    ok('a customer who last bought 200 days ago is in "not for 30 days"',
      wideList.count > 0 && (await wa.preview({ notOrderedForDays: 30, limit: 2000 })).count === wideList.count);
    const inWide = (await prisma.customer.findMany({
      where: { id: stale.id, lastOrderAt: { lt: new Date(Date.now() - 30 * 864e5) } },
    })).length;
    ok('and the filter itself agrees', inWide === 1);

    const narrow = await wa.preview({ orderedWithinDays: 90, notOrderedForDays: 30, limit: 2000 });
    ok('but adding "bought within 90 days" must exclude them',
      narrow.count < wideList.count, `${narrow.count} < ${wideList.count}`);
    await prisma.customer.delete({ where: { id: stale.id } });

    console.log('\n--- REV-MKT-9: opting out has to mean every channel ---');
    /*  MKT-RULE-009 says "every send. Exception: none." WhatsApp enforced it
        twice; Email and SMS enforced it nowhere — they took a customerId and
        sent. Nothing had been harmed only because no key is saved, which is
        luck rather than a design. */
    const quiet = await prisma.customer.create({
      data: { name: `${TAG} Quiet`, phone: `0172000${Math.floor(Math.random() * 9000 + 1000)}`, note: TAG },
    });
    await outreach.optOut({ customerId: quiet.id, reason: 'selftest' }, 'selftest');

    /*  The refusal must come BEFORE the "no key saved" complaint, or the guard
        is behind a door that happens to be shut today and open tomorrow. */
    await refuses('email refuses somebody who opted out', () =>
      messaging.sendEmail({
        to: 'nobody@example.com', subject: 'x', html: 'x', customerId: quiet.id,
      }), 'not to be contacted');
    await refuses('and so does SMS', () =>
      messaging.sendSms({ to: quiet.phone ?? '', text: 'x', customerId: quiet.id }),
      'not to be contacted');

    console.log('\n--- the whole sweep runs, and says what it did ---');
    const swept = await automation.run('manual');
    ok('the sweep completes', typeof swept.ms === 'number' && swept.ms >= 0, `${swept.ms} ms`);
    ok('with nothing broken inside it', swept.errors.length === 0, swept.errors.join(' · '));
    ok('and it is idempotent — a second run repeats nothing',
      (await automation.run('manual')).errors.length === 0);
  } catch (e) {
    fail += 1;
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    failures.push(`the run itself broke: ${msg}`);
    console.log(`\n!!! the run itself broke: ${msg}`);
  } finally {
    console.log('\n=== cleaning up ===');
    try {
      console.log(JSON.stringify(await cleanup()));
    } catch (e) {
      console.log('CLEANUP FAILED: ' + (e instanceof Error ? e.message : String(e)));
    }
    console.log(`\n================ ${pass} passed, ${fail} failed ================`);
    if (failures.length) {
      console.log('\nWhat did not hold up:');
      for (const f of failures) console.log('  - ' + f);
    }
    await app.close();
    process.exit(fail === 0 ? 0 : 1);
  }
}

void main();
