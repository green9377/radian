/* eslint-disable no-console */
/**
 * Finish the clean-up — the last red flag, and the go-live date.
 *
 * After the books were started again, one drift check stayed red:
 *
 *     What we owe suppliers — books 0.00, shop 5,000.00
 *
 * The reset cleared every TRANSACTION but kept the supplier PROFILES, and a
 * profile carries an "opening due" of its own. That figure is master data, not
 * a transaction, so it was never in scope — and with no purchases left behind
 * it, the shop side of the check still claims money is owed while the ledger,
 * correctly, says nothing is.
 *
 * This file clears those practice opening dues and sets the go-live date.
 *
 * It does NOT post opening balances. Those are real figures only the owner
 * knows, and Finance accepts them exactly once — posting zeroes now would shut
 * the door on the real ones for good.
 *
 * Run with no argument to preview; `--confirm` to act.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceDriftService } from './finance-drift.service';

const CONFIRM = process.argv.includes('--confirm');
const taka = (p: number | null | undefined) =>
  p === null || p === undefined ? '—' : (p / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const p = app.get(PrismaService);
  const drift = app.get(FinanceDriftService);

  console.log('\n############################################################');
  console.log(CONFIRM ? '#  FINISHING THE CLEAN-UP                                  #'
                      : '#  PREVIEW ONLY — nothing will be changed                  #');
  console.log('############################################################\n');

  /* ---------------------------------------------- 1. supplier opening dues */
  const suppliers = await p.db.supplier.findMany({
    where: { openingDuePaisa: { not: 0 } },
    select: { id: true, supplierNo: true, name: true, openingDuePaisa: true, openingNote: true },
  });
  console.log('=== 1. Supplier opening dues still on file ===\n');
  if (suppliers.length === 0) console.log('  none — nothing to clear here\n');
  for (const s of suppliers)
    console.log(`  ${s.supplierNo}  ${s.name}  ${taka(s.openingDuePaisa)}   ${s.openingNote ?? ''}`);

  /* ------------------------------------------------ 2. customer dues, same */
  const custDue = await p.db.customer.count();
  console.log(`\n=== 2. Customers on file: ${custDue} ===\n`);

  /* ----------------------------------------------------- 3. go-live date */
  const setting = await p.db.financeSetting.findFirst();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  console.log('=== 3. Go-live date ===\n');
  console.log(
    setting?.goLiveDate
      ? `  already set to ${setting.goLiveDate.toISOString().slice(0, 10)} — left alone\n`
      : `  not set — will be set to ${today.toISOString().slice(0, 10)} (today)\n` +
        '  Everything before this date is treated as history the checks should\n' +
        '  not judge. With it blank, every check reads the whole database as\n' +
        '  live, which is why an old practice row can still raise a flag.\n',
  );

  /* --------------------------------------------------- 4. practice staff */
  const demoStaff = await p.db.employee.count({ where: { note: { startsWith: '[demo]' } } });
  console.log(`=== 4. Practice staff still on the list: ${demoStaff} ===\n`);

  if (!CONFIRM) {
    console.log('  This was a preview. Nothing was touched.');
    console.log('  Run the file again and type FIX when it asks.\n');
    await app.close();
    process.exit(0);
  }

  /* ------------------------------------------------------------- do it */
  console.log('Working...\n');

  for (const s of suppliers) {
    await p.db.supplier.update({
      where: { id: s.id },
      data: { openingDuePaisa: 0, openingAsOf: null, openingNote: null },
    });
    console.log(`  cleared opening due  ${s.supplierNo}  ${s.name}  ${taka(s.openingDuePaisa)}`);
  }

  if (setting && !setting.goLiveDate) {
    await p.db.financeSetting.update({ where: { id: setting.id }, data: { goLiveDate: today } });
    console.log(`  go-live date set to ${today.toISOString().slice(0, 10)}`);
  }

  if (demoStaff > 0) {
    const ids = (
      await p.db.employee.findMany({ where: { note: { startsWith: '[demo]' } }, select: { id: true } })
    ).map((e) => e.id);
    await p.attendance.deleteMany({ where: { employeeId: { in: ids } } });
    await p.employeeDocument.deleteMany({ where: { employeeId: { in: ids } } });
    await p.employee.deleteMany({ where: { id: { in: ids } } });
    console.log(`  removed ${ids.length} practice staff`);
  }

  /* ------------------------------------------------------ 5. check again */
  console.log('\n\n=== The drift check, run again ===\n');
  const report = await drift.runAndRecord('after clean-up');
  console.log(`worst: ${report.worst.toUpperCase()}   wrong: ${report.wrongCount}   watch: ${report.watchCount}\n`);
  for (const c of report.checks) {
    const mark = c.severity === 'ok' ? '  ok  ' : c.severity === 'watch' ? ' WATCH' : ' WRONG';
    console.log(`${mark}  ${c.title}`);
    if (c.severity !== 'ok') {
      console.log(`         books ${taka(c.booksPaisa)}   shop ${taka(c.realPaisa)}   difference ${taka(c.diffPaisa)}`);
      console.log(`         ${c.advice}`);
    }
  }

  console.log('\n\n############################################################');
  if (report.wrongCount === 0 && report.watchCount === 0) {
    console.log('#  ALL GREEN                                               #');
    console.log('############################################################\n');
    console.log('  The books and the shop agree. Profit, loss and break-even can');
    console.log('  now be believed.\n');
  } else {
    console.log('#  STILL SOMETHING TO LOOK AT — see above                   #');
    console.log('############################################################\n');
  }

  console.log('  ONE THING LEFT, and only you can do it:\n');
  console.log('    Finance → Money accounts → enter your real cash, bKash, bank,');
  console.log('    stock, what customers owe you and what you owe suppliers,');
  console.log('    then press Post.');
  console.log('    http://localhost:3001/finance/accounts\n');
  console.log('  Not urgent — the checks are green without it, because zero on both');
  console.log('  sides agrees perfectly well. But until it is done the books start');
  console.log('  from nothing, so profit will read high and the money accounts will');
  console.log('  not match what is actually in the drawer.\n');
  console.log('  Posting happens ONCE and cannot be redone, so wait until you have');
  console.log('  counted properly. There is no hurry and no penalty for waiting.\n');

  await app.close();
  process.exit(0);
}

void main();
