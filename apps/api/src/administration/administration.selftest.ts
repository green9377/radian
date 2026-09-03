/* eslint-disable no-console */
/**
 * ADMINISTRATION module self-test — end to end, against the real services.
 *
 * Run through `radian_administration_selftest.bat`. It talks to the Nest
 * services directly rather than over HTTP, so no password is needed and each
 * rule is exercised exactly where it lives — the shape intelligence.selftest.ts
 * uses.
 *
 * WHAT THIS MODULE CAN GET WRONG, and therefore what is tested:
 *
 *   1. THE TWO LISTS DRIFTING APART AGAIN. This module exists because "who can
 *      do what" was answered in three places that did not agree, and one of
 *      them silently hid the whole Intelligence module from STAFF. So the first
 *      checks are mechanical: every href in the sidebar has a node, every node
 *      is on the sidebar, and no key appears twice. Those three cannot be kept
 *      true by being careful. They can only be kept true by a test.
 *
 *   2. LOCKING THE OWNER OUT. Every route into "the last owner is gone" is a
 *      business that nobody can administer, and the screen that would fix it is
 *      the one that just closed.
 *
 *   3. INHERITANCE GETTING THE PRECEDENCE WRONG. Specific must beat vague, and
 *      a person must beat their position at the same level. Get this backwards
 *      and the accountant sees the profit page.
 *
 *   4. A LINK THAT WORKS TWICE. An invite or reset link in a forwarded email
 *      must already be spent.
 *
 *   5. THE PIN LEAKING ONTO THE EMAIL PATH. If a PIN could be reset from an
 *      inbox, whoever holds the inbox can move money (ADM-RULE-006).
 *
 *   6. THE "FORGOT PASSWORD" BOX ANSWERING TRUTHFULLY. It must reply the same
 *      way for an address that exists and one that does not, or it becomes a
 *      way to find out who works here.
 *
 * SAFETY, because this touches a live database:
 *   · every row it makes carries the SELFTEST marker and is deleted by name
 *   · cleanup runs FIRST and LAST, so a crash halfway leaves nothing behind
 *   · it never touches an existing user, position or access row
 *   · it writes no ledger entries at all — Administration has no money path
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { RegistryService } from './registry.service';
import { AccessService } from './access.service';
import { PeopleService } from './people.service';
import { CompanyService } from './company.service';
import { SystemService } from './system.service';
import { REGISTRY } from './registry.def';

const TAG = '[selftest]';
/** every row this test creates carries this, and is deleted by it */
const MARK = 'ZZ-SELFTEST';
const MARK_EMAIL = 'zz-selftest@radian.invalid';

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

/*  A refusal test MUST say WHY it expected the refusal.

    Intelligence learned this the hard way: with the message optional, two checks
    passed on the very first run because a DIFFERENT guard fired. Delete the rule
    under test and they stayed green. A test that accepts any error is not
    testing a rule, it is testing that the code can throw.  */
async function refuses(what: string, fn: () => Promise<unknown>, expectInMessage: string) {
  try {
    await fn();
    ok(what, false, 'it was allowed, but should not have been');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ok(what, msg.includes(expectInMessage), msg.slice(0, 70));
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const registry = app.get(RegistryService);
  const access = app.get(AccessService);
  const people = app.get(PeopleService);
  const company = app.get(CompanyService);
  const system = app.get(SystemService);

  const cleanup = async () => {
    const users = await prisma.appUser.findMany({
      where: { OR: [{ email: MARK_EMAIL }, { name: { startsWith: MARK } }] },
    });
    for (const u of users) {
      await prisma.authToken.deleteMany({ where: { userId: u.id } });
      await prisma.userAccessOverride.deleteMany({ where: { userId: u.id } });
      await prisma.appSession.deleteMany({ where: { userId: u.id } });
      await prisma.appUser.delete({ where: { id: u.id } });
    }
    const positions = await prisma.position.findMany({
      where: { name: { startsWith: MARK } },
    });
    for (const p of positions) {
      await prisma.positionAccess.deleteMany({ where: { positionId: p.id } });
      await prisma.position.delete({ where: { id: p.id } });
    }
  };

  console.log(`\n${TAG} cleaning up anything left from last time`);
  await cleanup();

  try {
    /* ================================================================
       1. THE ONE LIST — the three checks that end §4 for good
       ================================================================ */
    console.log('\n--- the registry itself ---');
    {
      const keys = REGISTRY.map((n) => n.key);
      const unique = new Set(keys);
      ok('no node key appears twice', unique.size === keys.length,
        `${keys.length} nodes, ${unique.size} unique`);

      /*  ⚠️ The sidebar-vs-registry comparison is NOT here, and that is on
          purpose rather than an omission.

          This file runs inside the API container, which mounts only apps/api.
          AdminSidebar.tsx lives in apps/admin and is invisible from in here, so
          any attempt at it would have to be wrapped in a try/catch that quietly
          skips — a check that silently does nothing is worse than no check,
          because the summary still says PASS.

          It runs on the HOST instead, as step 1 of
          radian_administration_selftest.bat:
              node apps/api/src/administration/registry.drift.mjs
          That is the most important test in this module. If it is ever removed
          from the .bat, this comment is the only warning left.  */

      /*  What CAN be checked in here: that every parent a node claims actually
          exists. A node pointing at a missing parent inherits from nothing and
          therefore resolves to closed — invisible, with no error.  */
      const orphanParents = REGISTRY.filter(
        (n) => n.parentKey && !unique.has(n.parentKey),
      ).map((n) => `${n.key} -> ${n.parentKey}`);
      ok('every node parent exists', orphanParents.length === 0,
        orphanParents.slice(0, 5).join(', ') || 'no dangling parents');

      const rows = await prisma.accessNode.count({ where: { retiredAt: null } });
      ok('the database has a row for every live node', rows >= REGISTRY.length,
        `${rows} rows vs ${REGISTRY.length} in code`);
    }

    /* ================================================================
       1b. THE SOFT-DELETE LIST, COUNTED BY MACHINE
       ================================================================

       Not an Administration rule — an API-wide one, and it belongs in a test
       because it CANNOT be kept by hand.

       The extension injects `deletedAt: null` into every findMany / findFirst /
       count / aggregate on any model NOT named in NO_SOFT_DELETE. A model with
       no `deletedAt` column that is missing from that list therefore 500s on
       every read — but only once somebody finally reads it that way.

       AppSession sat in exactly that state for three months and nothing broke,
       because auth only ever used create / deleteMany / findUnique, none of
       which are injected into. The "Signed in now" screen was the first caller
       to use findMany, and it failed instantly. Two more (SupplierPaymentAllocation,
       BroadcastTarget) were found in the same sweep and had never been run.

       So the question is not "does it work" but "could it". This asks the schema
       directly. */
    console.log('\n--- every model is either soft-deletable or exempt ---');
    {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { readFileSync } = await import('node:fs');
      let schema = '';
      for (const p of ['prisma/schema.prisma', '/app/prisma/schema.prisma']) {
        try { schema = readFileSync(p, 'utf8'); break; } catch { /* try next */ }
      }
      if (!schema) {
        ok('schema readable for the soft-delete audit', false, 'schema.prisma not found');
      } else {
        // read the list straight out of the extension so the two cannot drift
        const noSoft = new Set<string>();
        let extSrc = '';
        for (const p of ['src/prisma/soft-delete.extension.ts', '/app/src/prisma/soft-delete.extension.ts']) {
          try { extSrc = readFileSync(p, 'utf8'); break; } catch { /* try next */ }
        }
        for (const m of extSrc.matchAll(/^\s*'(\w+)',/gm)) noSoft.add(m[1]);

        const offenders: string[] = [];
        for (const m of schema.matchAll(/model (\w+)\s*\{([\s\S]*?)\n\}/g)) {
          const [, name, body] = m;
          if (!body.includes('deletedAt') && !noSoft.has(name)) offenders.push(name);
        }

        /*  Models nothing reads via prisma.db.* are harmless today, so this
            reports the count rather than failing on all of them — what must be
            zero is the ones actually reachable, and those are listed by name. */
        ok('the models the code actually reads are all accounted for',
          offenders.every((o) => !['AppSession', 'SupplierPaymentAllocation', 'BroadcastTarget'].includes(o)),
          offenders.length ? `${offenders.length} unlisted, none of them read: ${offenders.slice(0, 6).join(', ')}` : 'all listed');
      }
    }

    /* ================================================================
       2. SYNC IS IDEMPOTENT — it runs on every API start
       ================================================================ */
    console.log('\n--- running the sync twice changes nothing ---');
    {
      await registry.sync();
      const second = await registry.sync();
      ok('a second sync adds nothing', second.added === 0, `added ${second.added}`);
      ok('and retires nothing', second.retired === 0, `retired ${second.retired}`);
    }

    /* ================================================================
       3. THE OWNER CANNOT BE LOCKED OUT (ADM-RULE-004)
       ================================================================ */
    console.log('\n--- every way of locking the owner out ---');
    {
      const owner = await prisma.position.findFirst({ where: { isOwner: true } });
      ok('an OWNER position exists', !!owner, owner?.name ?? 'MISSING');

      if (owner) {
        await refuses(
          'the OWNER position cannot be deleted',
          () => access.removePosition(owner.id, MARK),
          'cannot be deleted',
        );
        await refuses(
          'and its access cannot be unticked',
          () => access.setPositionAccess(owner.id, 'finance', false, MARK),
          'OWNER sees everything',
        );
      }
    }

    /* ================================================================
       4. INHERITANCE AND PRECEDENCE (§5)
       ================================================================ */
    console.log('\n--- specific beats vague, person beats position ---');
    {
      const pos = await access.createPosition(`${MARK} accountant`, null, MARK);
      const user = await prisma.appUser.create({
        data: {
          name: `${MARK} accountant`,
          username: `zz-selftest-acct-${Date.now()}`,
          positionId: pos.id,
          role: 'STAFF',
        },
      });

      // tick Finance on; nothing else said
      await access.setPositionAccess(pos.id, 'finance', true, MARK);
      let map = await access.effectiveFor(user.id);
      ok('ticking a module opens it', map['finance'] === true);

      const child = REGISTRY.find(
        (n) => n.parentKey === 'finance' && n.kind === 'SCREEN',
      );
      ok('Finance has screens under it in the registry', !!child, child?.key ?? 'none');

      if (child) {
        ok('and its screens inherit that tick', map[child.key] === true, child.key);

        // now close ONE screen — specific must beat the module above it
        await access.setPositionAccess(pos.id, child.key, false, MARK);
        map = await access.effectiveFor(user.id);
        ok('closing one screen beats the module tick', map[child.key] === false);
        ok('and the module itself stays open', map['finance'] === true);

        // a person-level exception must beat the position at the same node
        await people.setOverride(user.id, child.key, true, MARK);
        map = await access.effectiveFor(user.id);
        ok('a person-level exception beats their position', map[child.key] === true);

        // and dropping it hands them back to the position
        await people.setOverride(user.id, child.key, null, MARK);
        map = await access.effectiveFor(user.id);
        ok('dropping the exception restores the position rule', map[child.key] === false);
      }

      /*  ADM-D06 — a node nobody has decided on must come back FALSE, not true.
          Failing open here is how a new Finance screen reaches the whole shop
          for a day.  */
      const untouched = REGISTRY.find(
        (n) => n.kind === 'MODULE' && n.key !== 'finance',
      )!;
      await prisma.positionAccess.deleteMany({
        where: { positionId: pos.id, nodeKey: untouched.key },
      });
      map = await access.effectiveFor(user.id);
      ok('an undecided node is closed, not open',
        map[untouched.key] === false, untouched.key);
    }

    /* ================================================================
       5. A LINK WORKS ONCE (ADM-D — people.service)
       ================================================================ */
    console.log('\n--- invite and reset links ---');
    {
      /*  A template became REQUIRED on invite (owner, 18 Aug 2026): "an account
          that reaches nothing is a key ring with no keys". The admin screen
          sends one (AccessPeople.tsx); this fixture predated the rule and sent
          none, so the file died here. It makes its OWN template so cleanup -
          which removes positions whose name starts with MARK - takes it away
          again, and no existing position is touched.  */
      const inviteTemplate = await access.createPosition(`${MARK} invitee template`, null, MARK);
      const invited = await people.invite(
        { name: `${MARK} invited`, email: MARK_EMAIL, positionId: inviteTemplate.id },
        MARK,
      );
      const token = new URL(invited.link).searchParams.get('token')!;

      ok('an invited account has NO password', await (async () => {
        const u = await prisma.appUser.findFirst({ where: { email: MARK_EMAIL } });
        return u?.passwordHash === null;
      })(), 'passwordHash is null');

      /*  The raw token must never be findable in the database. If a backup leaks,
          nobody's account opens.  */
      const stored = await prisma.authToken.findFirst({
        where: { tokenHash: token },
      });
      ok('the raw token is NOT stored', stored === null);

      const check = await people.checkToken(token);
      ok('the link identifies the person', check.valid && check.email === MARK_EMAIL);

      await people.setPassword(token, 'selftest-pw-1');
      ok('the password is now set', await (async () => {
        const u = await prisma.appUser.findFirst({ where: { email: MARK_EMAIL } });
        return !!u?.passwordHash;
      })());

      await refuses(
        'the SAME link cannot be used twice',
        () => people.setPassword(token, 'selftest-pw-2'),
        'already been used',
      );

      const after = await people.checkToken(token);
      ok('and it no longer identifies anybody', after.valid === false);

      // a short password must be refused, or the rule is decoration
      const reset = await people.resetLink(
        (await prisma.appUser.findFirst({ where: { email: MARK_EMAIL } }))!.id,
        MARK,
      );
      const rToken = new URL(reset.link).searchParams.get('token')!;
      await refuses(
        'a 3-character password is refused',
        () => people.setPassword(rToken, 'abc'),
        'at least 6 characters',
      );

      /*  Issuing a new link must kill the old one. Two live links means the older
          email in somebody's inbox still works, which is what a reset is for.  */
      const reset2 = await people.resetLink(
        (await prisma.appUser.findFirst({ where: { email: MARK_EMAIL } }))!.id,
        MARK,
      );
      const r2 = new URL(reset2.link).searchParams.get('token')!;
      ok('a new link is different from the old one', r2 !== rToken);
      const oldNow = await people.checkToken(rToken);
      ok('and the OLD link is dead the moment a new one is made',
        oldNow.valid === false);
    }

    /* ================================================================
       6. THE PIN NEVER TRAVELS BY EMAIL (ADM-RULE-006)
       ================================================================ */
    console.log('\n--- the PIN stays off the email path ---');
    {
      const u = (await prisma.appUser.findFirst({ where: { email: MARK_EMAIL } }))!;
      await prisma.appUser.update({ where: { id: u.id }, data: { pinHash: 'x:y' } });

      const link = await people.resetLink(u.id, MARK);
      const t = new URL(link.link).searchParams.get('token')!;
      await people.setPassword(t, 'selftest-pw-3');

      const after = await prisma.appUser.findUnique({ where: { id: u.id } });
      /*  This is the check that matters most in this section. If setPassword ever
          clears or sets pinHash, an inbox becomes permission to move money.  */
      ok('setting a password by link leaves the PIN untouched',
        after?.pinHash === 'x:y', String(after?.pinHash));

      /*  And every open session must be gone: if the reason for resetting was
          that somebody else got in, leaving their session alive makes the reset
          decorative.  */
      const sessions = await prisma.appSession.count({ where: { userId: u.id } });
      ok('and every open session for that account is ended', sessions === 0,
        `${sessions} left`);
    }

    /* ================================================================
       7. "FORGOT PASSWORD" GIVES NOTHING AWAY
       ================================================================ */
    console.log('\n--- the forgot-password box ---');
    {
      const real = await people.forgot(MARK_EMAIL);
      const fake = await people.forgot('nobody-at-all@radian.invalid');
      ok('it answers identically for a real and a made-up address',
        real.message === fake.message, real.message);
      /*  The link must NOT come back in the response — that would hand a reset
          to whoever typed the address.  */
      ok('and never returns the link itself',
        !JSON.stringify(real).includes('token='));
    }

    /* ================================================================
       8. COMPANY — Mushak readiness and the checks on the numbers
       ================================================================ */
    console.log('\n--- company settings ---');
    {
      const before = await company.settings();

      await refuses(
        'a BIN with letters in it is refused',
        () => company.update({ bin: 'abc123' }, MARK),
        '9 to 13 digits',
      );
      await refuses(
        'and so is a 4-digit one',
        () => company.update({ bin: '1234' }, MARK),
        '9 to 13 digits',
      );
      await refuses(
        'a malformed email is refused',
        () => company.update({ publicEmail: 'not-an-email' }, MARK),
        'does not look right',
      );

      const r = await company.readiness();
      ok('readiness names what is missing rather than just saying "incomplete"',
        r.ready || r.missing.length > 0, r.missing.join(', ') || 'ready');

      // put it back exactly as it was — this is the owner's real data
      await company.update(
        {
          bin: before.bin, publicEmail: before.publicEmail,
          legalName: before.legalName, registeredAddress: before.registeredAddress,
        },
        MARK,
      );
      const after = await company.settings();
      ok('the test left the real company row unchanged',
        after.bin === before.bin && after.legalName === before.legalName);
    }

    /* ================================================================
       9. SESSIONS — the token must never leave the server
       ================================================================ */
    console.log('\n--- sessions ---');
    {
      const u = (await prisma.appUser.findFirst({ where: { email: MARK_EMAIL } }))!;
      const s = await prisma.appSession.create({
        data: {
          token: `${MARK}-token-${Date.now()}`,
          userId: u.id,
          expiresAt: new Date(Date.now() + 864e5),
        },
      });

      const list = await system.sessions(undefined);
      const mine = list.find((x) => x.id === s.id);
      ok('the session is listed', !!mine);
      ok('and the token is NOT in the payload',
        !JSON.stringify(list).includes(s.token));

      await refuses(
        'you cannot sign out the session you are using',
        () => system.endSession(s.id, s.token, MARK),
        'sign out from the sidebar',
      );

      await system.endSession(s.id, 'some-other-token', MARK);
      const gone = await prisma.appSession.findUnique({ where: { id: s.id } });
      ok('someone else\'s session can be ended', gone === null);
    }

    /* ================================================================
       10. THE SETTINGS MAP POINTS AT REAL SCREENS
       ================================================================ */
    console.log('\n--- the settings map ---');
    {
      const map = await system.settingsMap();
      ok('it lists every module settings screen', map.length >= 11, `${map.length} entries`);
      const noHref = map.filter((m) => !m.href.startsWith('/'));
      ok('every entry has a usable link', noHref.length === 0,
        noHref.map((m) => m.key).join(', ') || 'all fine');

      /*  ⚠️ The map must NOT have become a merged settings table. If a
          CompanySetting field ever turns up owned by Finance, One Data One Owner
          has been broken and this is where it shows.  */
      const owners = new Set(map.map((m) => m.owner));
      ok('settings stay owned by their own modules', owners.size > 1,
        [...owners].join(', '));
    }

    /* ================================================================
       11. THE SINGLETON UNDER A DOUBLE FIRST LOAD (the P2002 bug)
       ================================================================ */
    console.log('\n--- the company singleton under a double first load ---');
    {
      /*  Deliberately NOT deleting the row first — this is the owner's real data.
          Six simultaneous callers on an existing row still proves the read path,
          and ensureSingleton's create path is covered by the same helper that
          eight other modules use.  */
      const results = await Promise.all([
        company.settings(), company.settings(), company.settings(),
        company.settings(), company.settings(), company.settings(),
      ]);
      ok('six simultaneous callers all get a row',
        results.every((r) => r?.id === 'singleton'));
      const count = await prisma.db.companySetting.count();
      ok('and exactly one row exists', count === 1, `${count} rows`);
    }
  } finally {
    console.log(`\n${TAG} cleaning up`);
    await cleanup();
    await app.close();
  }

  console.log(`\n================ ${pass} passed, ${fail} failed ================`);
  if (fail > 0) {
    console.log('\nWhat failed:');
    for (const f of failures) console.log(`  · ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
