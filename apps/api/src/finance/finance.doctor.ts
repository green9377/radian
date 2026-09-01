/* eslint-disable no-console */
/**
 * Finance doctor — READ ONLY.
 *
 * Runs the real drift checker, then goes through the ledger entry by entry and
 * says, for each one, whether it looks like practice or like a real trade. At
 * the end it gives a verdict: is this book worth cleaning up piece by piece, or
 * should it simply be started again?
 *
 * It changes NOTHING. Run it as often as you like.
 *
 * How an entry is judged — evidence, not guesswork:
 *   DEMO:      sourceKey — written by the Finance practice seed, definitely fake
 *   SELFTEST:  written by a self-test, definitely fake
 *   TEST WORDS the narration says "test", "delete me", "demo", "practice"
 *   ORPHAN     it points at an order/purchase/expense that no longer exists
 *   ORDER      it is backed by a real Order row — the only kind that could be
 *              a genuine sale, so those are listed individually for the owner
 *              to recognise or not
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceDriftService } from './finance-drift.service';

const taka = (p: number | null | undefined) =>
  p === null || p === undefined ? '—' : (p / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });

const TEST_WORDS = /\b(test|delete me|demo|practice|dummy|sample|checked by)\b/i;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const drift = app.get(FinanceDriftService);

  console.log('\n############################################################');
  console.log('#  FINANCE DOCTOR — read only, nothing is changed          #');
  console.log('############################################################');

  /* ------------------------------------------------------------ 1. drift */
  console.log('\n=== 1. THE DRIFT CHECK — books versus the shop ===\n');
  const report = await drift.run();
  console.log(`worst: ${report.worst.toUpperCase()}   wrong: ${report.wrongCount}   watch: ${report.watchCount}\n`);
  for (const c of report.checks) {
    const mark = c.severity === 'ok' ? '  ok  ' : c.severity === 'watch' ? ' WATCH' : ' WRONG';
    console.log(`${mark}  ${c.title}`);
    if (c.severity !== 'ok') {
      if (c.booksPaisa !== null || c.realPaisa !== null)
        console.log(`         books ${taka(c.booksPaisa)}   shop ${taka(c.realPaisa)}   difference ${taka(c.diffPaisa)}`);
      if (c.count) console.log(`         count: ${c.count}`);
      console.log(`         ${c.advice}`);
      if (c.examples?.length) console.log(`         e.g. ${c.examples.slice(0, 4).join(', ')}`);
    }
  }

  /* ------------------------------------------------- 2. classify the ledger */
  console.log('\n\n=== 2. EVERY LEDGER ENTRY, JUDGED ===\n');
  const entries = await prisma.journalEntry.findMany({
    include: { lines: true },
    orderBy: [{ entryDate: 'asc' }, { entryNo: 'asc' }],
  });

  const orderNos = new Set(
    (await prisma.order.findMany({ select: { orderNo: true } })).map((o) => o.orderNo),
  );

  type Verdict = 'PRACTICE' | 'LOOKS REAL' | 'OPENING' | 'UNCLEAR';
  const rows: { entryNo: string; date: string; verdict: Verdict; why: string; amount: number; narration: string }[] = [];

  for (const e of entries) {
    const amount = e.lines.reduce((n, l) => n + l.debitPaisa, 0);
    const key = e.sourceKey ?? '';
    let verdict: Verdict = 'UNCLEAR';
    let why = 'no marker either way';

    if (key.startsWith('DEMO:')) { verdict = 'PRACTICE'; why = 'written by the practice seed'; }
    else if (key.startsWith('SELFTEST:')) { verdict = 'PRACTICE'; why = 'written by a self-test'; }
    else if (TEST_WORDS.test(e.narration ?? '')) { verdict = 'PRACTICE'; why = 'the narration says so'; }
    else if (e.sourceType === 'OPENING') { verdict = 'OPENING'; why = 'the go-live opening balance'; }
    else if (e.sourceType === 'ORDER' || e.sourceType === 'PAYMENT') {
      /*  The prefix is per environment now (ORDER_NO_PREFIX), so this must not
          look for RAD. Hardcoding it made every DEV- order's entry read
          "points at an order that is not there any more" - a wrong verdict on
          a real entry. The real test is the next line: the number has to be
          one of THIS shop's order numbers. */
      const mentioned = /\b([A-Z]{2,6}-[A-Z0-9-]+)\b/.exec(e.narration ?? '')?.[1];
      if (mentioned && orderNos.has(mentioned)) { verdict = 'LOOKS REAL'; why = `backed by order ${mentioned}`; }
      else { verdict = 'PRACTICE'; why = 'points at an order that is not there any more'; }
    } else if (e.isManual) { verdict = 'UNCLEAR'; why = 'entered by hand — only you can say'; }

    rows.push({
      entryNo: e.entryNo,
      date: e.entryDate.toISOString().slice(0, 10),
      verdict,
      why,
      amount,
      narration: (e.narration ?? '').slice(0, 46),
    });
  }

  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  console.log(`${pad('entry', 11)}${pad('date', 12)}${pad('verdict', 12)}${'amount'.padStart(12)}  narration`);
  console.log('-'.repeat(100));
  for (const r of rows)
    console.log(`${pad(r.entryNo, 11)}${pad(r.date, 12)}${pad(r.verdict, 12)}${taka(r.amount).padStart(12)}  ${r.narration}  · ${r.why}`);

  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  console.log(
    `\n  practice ${count('PRACTICE')}   looks real ${count('LOOKS REAL')}   opening ${count('OPENING')}   unclear ${count('UNCLEAR')}   (of ${rows.length})`,
  );

  /* ----------------------------------------------------------- 3. orders */
  console.log('\n\n=== 3. THE ORDERS — the one thing only you can judge ===\n');
  const orders = await prisma.db.order.findMany({
    select: {
      orderNo: true, placedAt: true, salesStatus: true, deliveryStatus: true,
      totalPaisa: true, paidPaisa: true,
      customer: { select: { name: true, phone: true } },
      channel: { select: { name: true } },
    },
    orderBy: { placedAt: 'asc' },
  });
  console.log(`${pad('order', 12)}${pad('date', 12)}${pad('customer', 20)}${pad('channel', 12)}${'total'.padStart(11)}${'paid'.padStart(11)}  status`);
  console.log('-'.repeat(100));
  for (const o of orders)
    console.log(
      `${pad(o.orderNo, 12)}${pad(o.placedAt.toISOString().slice(0, 10), 12)}${pad(o.customer?.name ?? '—', 20)}` +
        `${pad(o.channel?.name ?? '—', 12)}${taka(o.totalPaisa).padStart(11)}${taka(o.paidPaisa).padStart(11)}  ${o.salesStatus}/${o.deliveryStatus}`,
    );
  console.log(`\n  ${orders.length} orders. Do any of these names look like a real customer of yours?`);

  /* ------------------------------------------------- 4. the other records */
  console.log('\n\n=== 4. WHAT ELSE IS SITTING IN THE BOOKS ===\n');
  const [assets, prepaid, loans, remits, partners, expenses, incomes, purchases, customers, items, employees] =
    await Promise.all([
      prisma.db.fixedAsset.findMany({ select: { assetNo: true, name: true, costPaisa: true } }),
      prisma.db.prepaidItem.findMany({ select: { name: true, totalPaisa: true } }),
      prisma.db.loan.findMany({ select: { loanNo: true, lenderName: true, principalPaisa: true, note: true } }),
      prisma.db.carrierRemittance.findMany({ select: { remittanceNo: true, carrierName: true, netPaisa: true } }),
      prisma.db.partner.findMany({ select: { name: true, kind: true } }),
      prisma.db.expense.count(),
      prisma.db.income.count(),
      prisma.db.purchase.count(),
      prisma.db.customer.count(),
      prisma.db.item.count(),
      prisma.db.employee.count(),
    ]);
  for (const a of assets) console.log(`  asset      ${a.assetNo}  ${a.name}  ${taka(a.costPaisa)}`);
  for (const p of prepaid) console.log(`  prepaid    ${p.name}  ${taka(p.totalPaisa)}`);
  for (const l of loans) console.log(`  loan       ${l.loanNo}  from ${l.lenderName}  ${taka(l.principalPaisa)}  ${l.note ?? ''}`);
  for (const r of remits) console.log(`  remittance ${r.remittanceNo}  ${r.carrierName}  ${taka(r.netPaisa)}`);
  for (const p of partners) console.log(`  partner    ${p.name}  (${p.kind})`);
  console.log(
    `\n  expenses ${expenses} · incomes ${incomes} · purchases ${purchases} · customers ${customers} · items ${items} · employees ${employees}`,
  );

  /* --------------------------------------------------------- 5. settings */
  console.log('\n\n=== 5. SETTINGS THAT AFFECT ALL OF THE ABOVE ===\n');
  const setting = await prisma.db.financeSetting.findFirst();
  console.log(`  go-live date        ${setting?.goLiveDate?.toISOString().slice(0, 10) ?? 'NOT SET — every check treats the whole history as live'}`);
  console.log(`  closed up to        ${setting?.lastClosedDate?.toISOString().slice(0, 10) ?? 'nothing closed'}`);
  console.log(`  opening posted      ${entries.some((e) => e.sourceType === 'OPENING') ? 'YES — and it can never be posted a second time' : 'no'}`);
  console.log(`  BIN                 ${setting?.businessBin ?? 'not set (Mushak 6.3 waits for this)'}`);
  const noBehaviour = await prisma.db.financeAccount.count({ where: { type: 'EXPENSE', costBehavior: null } });
  console.log(`  expense accounts without fixed/variable: ${noBehaviour}`);

  /* --------------------------------------------------------- 6. verdict */
  console.log('\n\n############################################################');
  console.log('#  VERDICT                                                 #');
  console.log('############################################################\n');
  const real = count('LOOKS REAL');
  if (real === 0) {
    console.log('  Nothing in this ledger is backed by a trade that survives inspection.');
    console.log('  The cheapest and safest move is to START THE BOOKS AGAIN rather than');
    console.log('  pick through them. That also dissolves the opening-balance problem,');
    console.log('  which otherwise has to be reversed by hand.');
  } else {
    console.log(`  ${real} entries are backed by orders that still exist. Read the order list in`);
    console.log('  section 3 and decide whether any of those were real customers. If none');
    console.log('  were, the books can be started again. If even one was, we clean up');
    console.log('  selectively instead, which is slower but keeps that history.');
  }
  console.log('\n  Nothing was changed by this file.\n');

  await app.close();
  process.exit(0);
}

void main();
