/* eslint-disable no-console */
/**
 * HR module self-test — end to end, against the real services and the real
 * ledger, with data it invents and then takes back out again.
 *
 * Run through `radian_hr_selftest.bat`. It talks to the Nest services directly
 * rather than over HTTP, so no password is needed and the business rules are
 * exercised exactly where they live.
 *
 * SAFETY, because this touches a live database:
 *   · every employee it makes carries SELFTEST_TAG in the note
 *   · every ledger entry it makes carries a sourceKey starting SELFTEST:
 *   · it cleans up first AND last, and the cleanup only ever matches those two
 *     markers — nothing of yours is in scope at any point
 *   · the payroll window is five days wide on purpose, so the attendance freeze
 *     an approved run creates cannot reach across a month you actually use
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeesService } from './employees.service';
import { AttendanceService } from './attendance.service';
import { PayrollService } from './payroll.service';
import { FinanceService, ACC, ACC2 } from '../finance/finance.service';

const TAG = '[selftest]';
const KEY = 'SELFTEST:';

/* the window everything happens in — deliberately narrow */
const PERIOD = '2026-07';
const FROM = new Date(Date.UTC(2026, 6, 1));
const TO = new Date(Date.UTC(2026, 6, 5));

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
    else ok(what, true, msg.slice(0, 70));
  }
}

const taka = (p: number) => (p / 100).toFixed(2);

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const employees = app.get(EmployeesService);
  const attendance = app.get(AttendanceService);
  const payroll = app.get(PayrollService);
  const finance = app.get(FinanceService);

  const cleanup = async () => {
    const mine = await prisma.employee.findMany({
      where: { note: { startsWith: TAG } },
      select: { id: true },
    });
    const ids = mine.map((m) => m.id);

    /*  Two kinds of ledger row to take back out.
        1. the ones this file wrote itself, tagged SELFTEST:
        2. the one PAYROLL APPROVAL wrote, whose sourceKey is PAYROLL:<no> and
           therefore carries no tag of ours at all.
        The first version of this cleanup forgot the second, so a payroll entry
        was left behind in a real ledger — and on the next run the payroll
        number was reused, the sourceKey collided, and approval silently posted
        nothing. Both the leak and the silence are fixed; this is the leak.
        Only ORPHANS are matched: a PAYROLL: entry whose payroll row no longer
        exists cannot belong to anything real, because an approved run can
        never be deleted through the app. */
    const payrollNos = new Set(
      (await prisma.payroll.findMany({ select: { payrollNo: true } })).map((p) => p.payrollNo),
    );
    const orphanPayrollEntries = (
      await prisma.journalEntry.findMany({
        where: { sourceKey: { startsWith: 'PAYROLL:' } },
        select: { id: true, sourceKey: true },
      })
    ).filter((e) => !payrollNos.has((e.sourceKey ?? '').slice('PAYROLL:'.length)));

    const entries = [
      ...(await prisma.journalEntry.findMany({
        where: { sourceKey: { startsWith: KEY } },
        select: { id: true },
      })),
      ...orphanPayrollEntries.map((e) => ({ id: e.id })),
    ];
    if (ids.length) {
      // payroll rows first, so the orphan sweep below can see their entries
      const runs = await prisma.payroll.findMany({
        where: { lines: { some: { employeeId: { in: ids } }, every: { employeeId: { in: ids } } } },
        select: { id: true, payrollNo: true },
      });
      if (runs.length) {
        const mineByKey = await prisma.journalEntry.findMany({
          where: { sourceKey: { in: runs.map((r) => `PAYROLL:${r.payrollNo}`) } },
          select: { id: true },
        });
        entries.push(...mineByKey);
        await prisma.payrollLine.deleteMany({ where: { payrollId: { in: runs.map((r) => r.id) } } });
        await prisma.payroll.deleteMany({ where: { id: { in: runs.map((r) => r.id) } } });
      }
      await prisma.attendance.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.employeeDocument.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.employee.deleteMany({ where: { id: { in: ids } } });
    }
    const entryIds = [...new Set(entries.map((e) => e.id))];
    if (entryIds.length) {
      await prisma.journalLine.deleteMany({ where: { entryId: { in: entryIds } } });
      await prisma.journalEntry.deleteMany({ where: { id: { in: entryIds } } });
    }
    await prisma.employeeRole.deleteMany({ where: { name: { startsWith: TAG } } });
    return { people: ids.length, ledgerEntries: entryIds.length };
  };

  try {
    console.log('\n=== cleaning up anything left from a previous run ===');
    console.log(JSON.stringify(await cleanup()));

    /* ---------------------------------------------------------- 1. roles */
    console.log('\n=== 1. job roles ===');
    const role = await employees.createRole({ name: `${TAG} Florist`, actorName: 'selftest' });
    ok('a role can be created', !!role.id);
    await refuses('the same role name twice is refused', () =>
      employees.createRole({ name: `${TAG} Florist` }), 'already');

    /* ------------------------------------------------------ 2. employees */
    console.log('\n=== 2. employees, one of each pay type ===');
    const monthly = await employees.create({
      name: `${TAG} Monthly Person`, roleId: role.id, joinedOn: '2026-01-01',
      payType: 'MONTHLY', ratePaisa: 1_500_000, dutyHoursPerDay: 10,
      shiftStart: '09:00', shiftEnd: '19:00', note: `${TAG} remove me`, actorName: 'selftest',
    });
    const daily = await employees.create({
      name: `${TAG} Daily Person`, roleId: role.id, joinedOn: '2026-02-01',
      payType: 'DAILY', ratePaisa: 80_000, dutyHoursPerDay: 12,
      shiftStart: '08:00', shiftEnd: '20:00', note: `${TAG} remove me`, actorName: 'selftest',
    });
    const hourly = await employees.create({
      name: `${TAG} Hourly Person`, roleId: role.id, joinedOn: '2026-03-01',
      payType: 'HOURLY', ratePaisa: 12_000, dutyHoursPerDay: 5,
      shiftStart: '20:00', shiftEnd: '01:00', note: `${TAG} remove me`, actorName: 'selftest',
    });
    ok('three employees created', !!monthly.id && !!daily.id && !!hourly.id);
    ok('EMP- numbers are sequential', /^EMP-\d{6}$/.test(monthly.employeeNo), monthly.employeeNo);
    await refuses('an employee with no name is refused', () => employees.create({ name: '  ' }), 'name');

    console.log('\n=== 3. the midnight shift is read as five hours, not minus nineteen ===');
    const sheetProbe = await attendance.sheet('2026-07-01');
    const hRow = sheetProbe.rows.find((r) => r.employeeId === hourly.id);
    ok('20:00 to 01:00 counts as 5 hours', hRow?.minutes === 300, `${hRow?.minutes} minutes`);
    const mRow = sheetProbe.rows.find((r) => r.employeeId === monthly.id);
    ok('09:00 to 19:00 counts as 10 hours', mRow?.minutes === 600, `${mRow?.minutes} minutes`);
    ok('an unmarked sheet still defaults everybody to present', mRow?.status === 'PRESENT');

    /* --------------------------------------------------- 4. attendance */
    console.log('\n=== 4. five days of attendance ===');
    const days = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'];
    for (const [i, d] of days.entries()) {
      await attendance.save({
        onDate: d,
        actorName: 'selftest',
        rows: [
          // monthly: present every day except day 3, which is absent
          { employeeId: monthly.id, status: i === 2 ? 'ABSENT' : 'PRESENT' },
          // daily: present, but day 4 is a half day
          { employeeId: daily.id, status: i === 3 ? 'HALF_DAY' : 'PRESENT' },
          // hourly: real clock times, day 5 is paid leave
          i === 4
            ? { employeeId: hourly.id, status: 'LEAVE', isPaidLeave: true }
            : { employeeId: hourly.id, inTime: '20:00', outTime: '01:00' },
        ],
      });
    }
    const totals = await attendance.totals(FROM, TO, [monthly.id, daily.id, hourly.id]);
    const tM = totals.get(monthly.id)!;
    const tD = totals.get(daily.id)!;
    const tH = totals.get(hourly.id)!;
    ok('monthly: 4 paid days, 1 absent', tM.days === 4 && tM.absent === 1, `${tM.days}/${tM.absent}`);
    ok('daily: 4.5 paid days (half day counts as half)', tD.days === 4.5, String(tD.days));
    ok('daily: the missing half is 0.5 absent', tD.absent === 0.5, String(tD.absent));
    ok('paid days + absent days = days recorded', tD.days + tD.absent === tD.marked, `${tD.marked}`);
    ok('hourly: 4 worked days x 5h = 1200 minutes', tH.minutes === 1200, `${tH.minutes}`);
    ok('hourly: paid leave still earns a day', tH.days === 5, String(tH.days));

    console.log('\n=== 5. the clock decides the status ===');
    await attendance.save({
      onDate: '2026-07-02', actorName: 'selftest',
      rows: [
        { employeeId: monthly.id, status: 'PRESENT' },
        { employeeId: daily.id, status: 'PRESENT' },
        // three hours of a five hour day, and NO status sent
        { employeeId: hourly.id, inTime: '20:00', outTime: '23:00' },
      ],
    });
    const s2 = await attendance.sheet('2026-07-02');
    const h2 = s2.rows.find((r) => r.employeeId === hourly.id);
    ok('3h of a 5h day is read as a half day', h2?.status === 'HALF_DAY', `${h2?.status} · ${h2?.minutes}m`);
    // put it back so the payroll numbers below stay the ones we reasoned about
    await attendance.save({
      onDate: '2026-07-02', actorName: 'selftest',
      rows: [
        { employeeId: monthly.id, status: 'PRESENT' },
        { employeeId: daily.id, status: 'PRESENT' },
        { employeeId: hourly.id, inTime: '20:00', outTime: '01:00' },
      ],
    });

    await refuses('a future day cannot be marked', () =>
      attendance.save({ onDate: '2030-01-01', rows: [{ employeeId: monthly.id, status: 'PRESENT' }] }), 'not happened');

    /* ------------------------------------------------ 6. the money gate */
    console.log('\n=== 6. no advance without a real employee (HR-D06) ===');
    await refuses('an advance with no employee is refused', () =>
      finance.giveStaffAdvance({ amountPaisa: 50_000 }), 'pick who');
    await refuses('an advance to an unknown id is refused', () =>
      finance.giveStaffAdvance({ employeeId: 'not-a-real-id', amountPaisa: 50_000 }), 'not on the staff list');

    const advanceEntry = await finance.postEntry({
      sourceType: 'EXPENSE',
      sourceKey: `${KEY}ADVANCE:${monthly.id}`,
      entryDate: new Date(Date.UTC(2026, 6, 2)),
      narration: `${TAG} advance`,
      isManual: true,
      actorName: 'selftest',
      lines: await (async () => {
        const adv = await prisma.db.financeAccount.findUnique({ where: { code: ACC2.EMPLOYEE_ADVANCE } });
        const cash = await prisma.db.financeAccount.findFirst({ where: { isMoneyAccount: true, isActive: true } });
        return [
          { accountId: adv!.id, debitPaisa: 300_000, employeeId: monthly.id, employeeName: monthly.name },
          { accountId: cash!.id, creditPaisa: 300_000 },
        ];
      })(),
    });
    ok('an advance can be posted against a real person', !!advanceEntry);
    ok('the advance shows up as outstanding', (await employees.advanceFor(monthly.id)) === 300_000,
      taka(await employees.advanceFor(monthly.id)));

    /* ----------------------------------------------------- 7. payroll */
    console.log('\n=== 7. payroll build ===');
    const run = await payroll.build({
      period: PERIOD,
      periodStart: FROM.toISOString(),
      periodEnd: TO.toISOString(),
      employeeIds: [monthly.id, daily.id, hourly.id],
      actorName: 'selftest',
    });
    const line = (id: string) => run.lines.find((l) => l.employeeId === id)!;
    ok('all three are on the run', run.lines.length === 3, String(run.lines.length));
    ok('monthly base is the agreed figure, whatever the days',
      line(monthly.id).basePaisa === 1_500_000, taka(line(monthly.id).basePaisa));
    ok('daily base is 4.5 days x 800', line(daily.id).basePaisa === 360_000, taka(line(daily.id).basePaisa));
    ok('hourly base is 20h x 120', line(hourly.id).basePaisa === 240_000, taka(line(hourly.id).basePaisa));
    ok('nobody has advance recovery proposed for them (HR-R05)',
      run.lines.every((l) => l.advanceRecoveredPaisa === 0));
    ok("the monthly person's absence carries a suggested deduction",
      line(monthly.id).suggestedAbsenceDeductionPaisa === 300_000,
      taka(line(monthly.id).suggestedAbsenceDeductionPaisa));
    ok('the outstanding advance is visible on the payslip',
      line(monthly.id).advanceOutstandingPaisa === 300_000);

    console.log('\n=== 8. editing the draft ===');
    await refuses('recovering more advance than is owed is refused', () =>
      payroll.patch(run.id, { lines: [{ employeeId: monthly.id, advanceRecoveredPaisa: 500_000 }] }),
      'only owes');
    await refuses('a deduction bigger than the pay is refused', () =>
      payroll.patch(run.id, { lines: [{ employeeId: daily.id, deductionPaisa: 9_999_999 }] }),
      'more than the pay');

    const edited = await payroll.patch(run.id, {
      actorName: 'selftest',
      lines: [
        { employeeId: monthly.id, extraPaisa: 200_000, extraNote: 'Eid bonus', advanceRecoveredPaisa: 100_000 },
        { employeeId: daily.id, deductionPaisa: 20_000, deductionNote: 'late' },
      ],
    });
    const em = edited.lines.find((l) => l.employeeId === monthly.id)!;
    ok('bonus is added and advance recovery netted off',
      em.netPaisa === 1_500_000 + 200_000 - 100_000, taka(em.netPaisa));
    ok('a bonus does not disturb the base', em.basePaisa === 1_500_000);
    const ed = edited.lines.find((l) => l.employeeId === daily.id)!;
    ok('a deduction comes off the pay', ed.netPaisa === 360_000 - 20_000, taka(ed.netPaisa));
    const expectedNet = edited.lines.reduce((n, l) => n + l.netPaisa, 0);
    ok('the run total equals the sum of the payslips', edited.netPaisa === expectedNet, taka(edited.netPaisa));

    /* --------------------------------------------------- 9. approval */
    console.log('\n=== 9. approval, and what lands in the books ===');
    const cash = await prisma.db.financeAccount.findFirst({ where: { isMoneyAccount: true, isActive: true } });
    const approved = await payroll.approve(run.id, { paidFromId: cash!.id, actorName: 'selftest' });
    ok('the run is approved', approved.status === 'APPROVED');
    ok('a journal entry was written', !!approved.journalEntryId);

    const entry = await prisma.db.journalEntry.findUnique({
      where: { id: approved.journalEntryId! },
      include: { lines: { include: { account: true } } },
    });
    const debit = entry!.lines.reduce((n, l) => n + l.debitPaisa, 0);
    const credit = entry!.lines.reduce((n, l) => n + l.creditPaisa, 0);
    ok('the entry balances', debit === credit, `${taka(debit)} vs ${taka(credit)}`);
    const salaryLines = entry!.lines.filter((l) => l.account.code === ACC.STAFF_SALARY);
    const advLines = entry!.lines.filter((l) => l.account.code === ACC2.EMPLOYEE_ADVANCE);
    const cashLines = entry!.lines.filter((l) => l.accountId === cash!.id);
    ok('salary cost went to 5420', salaryLines.length === 3, `${salaryLines.length} lines`);
    ok('every salary line carries the person, not just a name',
      salaryLines.every((l) => !!l.employeeId && !!l.employeeName));
    ok('the recovered advance came off 1210',
      advLines.length === 1 && advLines[0].creditPaisa === 100_000, taka(advLines[0]?.creditPaisa ?? 0));
    ok('only the net actually left the money account',
      cashLines.length === 1 && cashLines[0].creditPaisa === expectedNet, taka(cashLines[0]?.creditPaisa ?? 0));
    ok('the advance still owed is now 2,000',
      (await employees.advanceFor(monthly.id)) === 200_000, taka(await employees.advanceFor(monthly.id)));

    ok('the run total was written back from the recomputed figures',
      approved.netPaisa === expectedNet, taka(approved.netPaisa));

    console.log('\n=== 10. once approved, everything is frozen ===');
    await refuses('an approved run cannot be edited', () =>
      payroll.patch(run.id, { lines: [{ employeeId: monthly.id, extraPaisa: 1 }] }), 'approved');
    await refuses('an approved run cannot be deleted', () =>
      payroll.remove(run.id, 'selftest'), 'never deleted');
    await refuses('a day inside an approved run cannot be re-marked', () =>
      attendance.save({ onDate: '2026-07-03', rows: [{ employeeId: monthly.id, status: 'PRESENT' }] }),
      'cannot be changed');
    await refuses('approving twice is refused', () =>
      payroll.approve(run.id, { paidFromId: cash!.id }), 'already approved');

    console.log('\n=== 11. nobody gets paid twice for the same month (HR-R22) ===');
    const second = await payroll.build({
      period: PERIOD,
      periodStart: FROM.toISOString(),
      periodEnd: TO.toISOString(),
      employeeIds: [monthly.id, daily.id, hourly.id],
      actorName: 'selftest',
    }).catch((e: Error) => e);
    ok('a second run for the same people is refused outright',
      second instanceof Error && /already paid/i.test(second.message),
      second instanceof Error ? second.message.slice(0, 60) : 'a run was built');

    console.log('\n=== 12. somebody who leaves ===');
    await employees.update(hourly.id, { status: 'INACTIVE', leftOn: '2026-07-04', actorName: 'selftest' });
    const payable = await employees.payable();
    ok('a leaver is still reachable for a final settlement',
      payable.some((p) => p.id === hourly.id && p.hasLeft));
    await refuses('but a NEW advance to a leaver is refused', () =>
      finance.giveStaffAdvance({ employeeId: hourly.id, amountPaisa: 10_000 }), 'marked as left');
    const sheetAfterLeaving = await attendance.sheet('2026-07-03');
    ok('a leaver still appears on the days they actually worked',
      sheetAfterLeaving.rows.some((r) => r.employeeId === hourly.id));
    const sheetToday = await attendance.sheet();
    ok('but not on today\'s sheet', !sheetToday.rows.some((r) => r.employeeId === hourly.id));

    console.log('\n=== 13. documents are the owner\'s alone (HR-R26) ===');
    await refuses('a MANAGER cannot list documents', () =>
      employees.listDocuments(monthly.id, 'MANAGER'), 'owner only');
    await refuses('a MANAGER cannot attach one', () =>
      employees.addDocument(monthly.id, { title: 'NID', dataUrl: 'data:text/plain;base64,aGk=' }, 'MANAGER'),
      'owner only');
    const doc = await employees.addDocument(
      monthly.id,
      { title: 'NID copy', fileName: 'nid.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,aGk=', actorName: 'selftest' },
      'OWNER',
    );
    ok('the owner can attach one', !!doc.id);
    const docs = await employees.listDocuments(monthly.id, 'OWNER');
    ok('and it is listed back', docs.length === 1);
    ok('the list does not drag the file itself along', !('dataUrl' in (docs[0] as object)));
    await refuses('an oversized file is refused', () =>
      employees.addDocument(monthly.id, { title: 'big', dataUrl: `data:x;base64,${'A'.repeat(4_000_000)}` }, 'OWNER'),
      'too big');

    console.log('\n=== 14. private fields are hidden from a MANAGER (HR-R10) ===');
    await employees.update(monthly.id, { nid: '1234567890', address: 'Dhaka', actorName: 'selftest' });
    const asOwner = await employees.get(monthly.id, 'OWNER');
    const asManager = await employees.get(monthly.id, 'MANAGER');
    ok('the owner sees the NID', asOwner.nid === '1234567890');
    ok('a manager does not', asManager.nid === null && asManager.privateHidden === true);
    ok('but a manager still sees the working fields', asManager.name === monthly.name && asManager.ratePaisa > 0);

    console.log('\n=== 15. an employee holding money cannot be removed ===');
    await refuses('removal is refused while an advance is outstanding', () =>
      employees.remove(monthly.id, 'selftest'), 'advance outstanding');
    const removable = await employees.remove(daily.id, 'selftest');
    ok('somebody who owes nothing can be removed', removable.deleted === true);
    const inTrash = await employees.trash();
    ok('and they turn up in the trash, not gone', inTrash.items.some((i) => i.id === daily.id));
    await employees.restore(daily.id, 'selftest');
    ok('and can be put back', !!(await employees.get(daily.id, 'OWNER')));

    console.log('\n=== 16. a role in use cannot be deleted ===');
    await refuses('deleting a role somebody holds is refused', () =>
      employees.removeRole(role.id, 'selftest'), 'switch it off');
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
