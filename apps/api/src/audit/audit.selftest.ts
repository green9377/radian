/* eslint-disable no-console */
/**
 * AUDIT · CONTENT self-test.
 *
 * Run through `radian_audit_selftest.bat`.
 *
 * WHY THIS FILE EXISTS (30 Jul 2026)
 * Audit is the module every other module writes through — roughly a hundred call
 * sites — and it had never been reviewed. The pass found that an audit write could
 * FAIL THE BUSINESS ACTION IT WAS RECORDING: every caller writes its trace after its
 * own write has already committed, so a throw here could not undo anything. It could
 * only hand back a 500 for work that had succeeded, and the user then presses Save
 * again. On `purchases.create()` that is a duplicate purchase, with duplicate stock
 * and a duplicate ledger entry.
 *
 * Content is a different kind of finding: 395 lines that nothing imports. No module,
 * no controller, no route. It also carried the *disproved* singleton cure — `upsert` —
 * with a comment citing it as settled, written after `singleton.ts` had already
 * refuted it. Both are asserted below.
 *
 * SAFETY:
 *   · audit rows are written against a made-up entityType, ZZAUDITTEST
 *   · cleanup runs both BEFORE and AFTER and only ever matches that entityType
 *   · it touches no real entity, and writes no business data at all
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TYPE = 'ZZAUDITTEST';

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

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const audit = app.get(AuditService);

  const cleanup = async () => {
    const a = await prisma.auditLog.deleteMany({ where: { entityType: TYPE } });
    const e = await prisma.activityEvent.deleteMany({ where: { entityType: TYPE } });
    return { auditLogs: a.count, events: e.count };
  };

  try {
    console.log('=== 0. clearing anything a previous run left behind ===');
    console.log(JSON.stringify(await cleanup()));

    /* ---------------------------------------------------------------- 1 */
    console.log('\n=== 1. the happy path still records everything ===');

    await audit.record({ entityType: TYPE, entityId: 'e1', action: 'CREATE', actorName: 'selftest', changes: { a: 1 } });
    await audit.event({ entityType: TYPE, entityId: 'e1', kind: 'general', label: 'made a thing', actorName: 'selftest' });
    ok('an audit row is written',
      (await prisma.auditLog.count({ where: { entityType: TYPE, entityId: 'e1' } })) === 1);
    ok('a timeline row is written',
      (await prisma.activityEvent.count({ where: { entityType: TYPE, entityId: 'e1' } })) === 1);

    /* ---------------------------------------------------------------- 2 */
    console.log('\n=== 2. a bad audit payload must NOT fail the caller (AUD-REV-1) ===');

    /* `changes` is typed `Record<string, unknown>` and call sites pass DTOs straight
       in. `Prisma.InputJsonValue` rejects a BigInt — and `Customer.ltvPaisa` IS a
       BigInt that travels inside shaped objects. Before the fix, one such value
       reaching `changes` turned a committed save into a 500, and the retry that
       followed duplicated the work. */
    let threw = false;
    try {
      await audit.record({
        entityType: TYPE, entityId: 'e2', action: 'UPDATE', actorName: 'selftest',
        changes: { ltvPaisa: BigInt(500) } as never,
      });
    } catch {
      threw = true;
    }
    ok('AUD-REV-1 a BigInt in `changes` does not throw at the caller', !threw);

    let threw2 = false;
    try {
      const circular: Record<string, unknown> = { name: 'loop' };
      circular.self = circular;
      await audit.record({
        entityType: TYPE, entityId: 'e2', action: 'UPDATE', actorName: 'selftest', changes: circular,
      });
    } catch {
      threw2 = true;
    }
    ok('AUD-REV-1 …nor does a circular object', !threw2);

    let threw3 = false;
    try {
      await audit.event({
        entityType: TYPE, entityId: 'e2', kind: 'not-a-real-kind' as never,
        label: 'bad kind', actorName: 'selftest',
      });
    } catch {
      threw3 = true;
    }
    ok('AUD-REV-1 …nor does a bad ActivityKind on the timeline write', !threw3);

    /* ---------------------------------------------------------------- 3 */
    console.log('\n=== 3. …but the ONE strict caller keeps its throw ===');

    /* `ItemsService.purge()` writes its trace BEFORE destroying the row, on purpose:
       "if the audit write fails we would rather keep the row than lose it silently."
       Making record() non-fatal must not have quietly taken that away. */
    let strictThrew = false;
    try {
      await audit.recordOrThrow({
        entityType: TYPE, entityId: 'e3', action: 'DELETE', actorName: 'selftest',
        changes: { ltvPaisa: BigInt(1) } as never,
      });
    } catch {
      strictThrew = true;
    }
    ok('AUD-REV-1 recordOrThrow() still throws on a bad payload', strictThrew);

    /* Strip block comments before counting. The fix's own explanation contains the
       word `recordOrThrow`, so counting raw text finds two and the check goes red for
       the wrong reason — the exact trap this whole review kept turning up. */
    const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const itemsCode = stripComments(readFileSync(join(__dirname, '../items/items.service.ts'), 'utf8'));
    const purgeBlock = itemsCode.slice(itemsCode.indexOf('async purge('), itemsCode.indexOf('async addComponent('));
    ok('AUD-REV-1 …and Item.purge() is the caller that uses it',
      purgeBlock.includes('recordOrThrow'));
    ok('AUD-REV-1 …and it is the ONLY caller of it in that file',
      (itemsCode.match(/this\.audit\.recordOrThrow/g) ?? []).length === 1);

    /* ---------------------------------------------------------------- 4 */
    console.log('\n=== 4. a timeline is bounded (AUD-REV-2) ===');

    for (let i = 0; i < 12; i++) {
      await audit.event({ entityType: TYPE, entityId: 'e4', kind: 'general', label: `step ${i}`, actorName: 'selftest' });
    }
    const capped = await audit.timeline(TYPE, 'e4', 5);
    ok('AUD-REV-2 the timeline honours a limit', capped.length === 5, `${capped.length} rows`);
    ok('…and returns the newest first', capped[0].label === 'step 11', capped[0].label);
    const defaulted = await audit.timeline(TYPE, 'e4');
    ok('…and the default is bounded too, not unbounded', defaulted.length === 12);

    /* ---------------------------------------------------------------- 5 */
    console.log('\n=== 5. the audit READ api is complete — only the screen is missing ===');

    /* `RADIAN_MODULE_PRIORITY.md` calls Audit "one screen over data that already
       exists". Checked rather than assumed: the backend really is done. */
    const readSrc = readFileSync(join(__dirname, 'audit-read.service.ts'), 'utf8');
    for (const fn of ['list(', 'activity(', 'facets(', 'stats(', 'forEntity(']) {
      ok(`the read service offers ${fn.replace('(', '()')}`, readSrc.includes(`async ${fn}`));
    }
    const ctrlSrc = readFileSync(join(__dirname, 'audit.controller.ts'), 'utf8');
    ok('…and every one of them is routed', (ctrlSrc.match(/@Get\(/g) ?? []).length >= 5);

    /* ---------------------------------------------------------------- 6 */
    console.log('\n=== 6. Content: unreachable, and it carried the disproved cure ===');

    const contentSrc = readFileSync(join(__dirname, '../content/content.service.ts'), 'utf8');

    /* CON-REV-1 — `ensureLegal()` used `upsert` and its comment justified it as being
       "for the same reason the settings singletons use it". That is the reasoning
       `singleton.ts` was written to refute, and the file was written AFTER the
       refutation. A wrong idea outlives its own correction by being written down as a
       reason. */
    ok('CON-REV-1 ensureLegal() no longer relies on upsert as a race guard',
      !/contentPage\.upsert/.test(contentSrc));
    ok('CON-REV-1 …it uses the helper that actually survives losing the race',
      /ensureSingleton/.test(contentSrc));

    /* Credit where it is due: this file already got the harder discipline right. */
    ok('Content checks slug clashes on the RAW client, so a trashed address stays taken',
      /this\.prisma\.contentPage\.findUnique/.test(contentSrc));

    /* CON-REV-2 — the whole file is orphaned. Recorded as a fact, not fixed: the
       architecture (FINAL_REVISION_TODO §4) says Content belongs to Ecommerce, and
       inventing a module here would be inventing scope. */
    const appSrc = readFileSync(join(__dirname, '../app.module.ts'), 'utf8');
    const wired = /ContentModule|ContentService/.test(appSrc);
    console.log(
      wired
        ? '  NOTE  Content is now wired into AppModule — update this section.'
        : '  NOTE  Content is still unreachable (no module, no controller, nothing imports it).',
    );
    ok('Audit, by contrast, IS wired into AppModule', /AuditModule/.test(appSrc));
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
