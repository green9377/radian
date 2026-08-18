/* eslint-disable no-console */
/**
 * THE DRIFT CHECK — run on the HOST, not inside Docker.
 *
 * This is the single most important test in the Administration module, and it
 * cannot live in administration.selftest.ts: that runs inside the API container,
 * which mounts only apps/api. The sidebar lives in apps/admin and is invisible
 * from in there. So it runs here, with plain node, where both files exist.
 *
 * WHAT IT IS FOR
 *
 * The whole module exists because "who can do what" was answered in three
 * places that did not agree. On the day Intelligence was built, a roles: array
 * in AdminSidebar.tsx hid the entire module from STAFF while the decision had
 * been the opposite and the API was serving it happily. Nothing errored. Staff
 * simply never saw a screen written for them, for weeks.
 *
 * registry.def.ts is GENERATED from AdminSidebar.tsx. The moment somebody adds a
 * screen to the sidebar and forgets to regenerate, the two disagree again — and
 * the failure mode is silence, exactly as before. Nobody can hold that invariant
 * by being careful. Only this can.
 *
 * Run with:  node apps/api/src/administration/registry.drift.mjs
 * Exits 1 on any disagreement, so the .bat can stop.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..', '..', '..'); // -> D:\radian
const SIDEBAR = join(ROOT, 'apps', 'admin', 'app', '_components', 'AdminSidebar.tsx');
const DEF = join(ROOT, 'apps', 'api', 'src', 'administration', 'registry.def.ts');

let pass = 0;
let fail = 0;
const problems = [];

function ok(what, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${what}${detail ? `  (${detail})` : ''}`);
  } else {
    fail += 1;
    problems.push(what + (detail ? ` — ${detail}` : ''));
    console.log(`  FAIL  ${what}${detail ? `  (${detail})` : ''}`);
  }
}

/*  The sidebar's GROUPS array is evaluated, not regex-scraped. `match:` entries
    are real functions and one of them contains a multi-line array, which broke
    the first attempt at stripping them — so `exact` is simply defined and the
    functions are left alone.  */
function readSidebar() {
  const src = readFileSync(SIDEBAR, 'utf8');
  const start = src.indexOf('const GROUPS: Group[] = [');
  if (start < 0) throw new Error('GROUPS not found in AdminSidebar.tsx');
  const end = src.indexOf('\n];', start);
  const literal = src
    .slice(src.indexOf('[', start), end + 2)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const exact = (h) => (p) => p === h;
  // eslint-disable-next-line no-eval
  return eval(literal);
}

/*  These three MUST stay identical to registry.gen.mjs and to
    AdminSidebar.tsx's own copy. Three places, and that is one too many — but
    the alternative is a shared package for a two-app repo, and this test is
    what makes the duplication safe.

    The query string is stripped (17 Aug 2026): "/returns?channel=online" and
    "/returns" are the same screen, so they are the same key. See the long note
    in registry.gen.mjs.  */
const slugOf = (h) => h.split('?')[0].replace(/^\//, '').replace(/\//g, '.') || 'root';
const moduleKey = (it) =>
  it.href ? slugOf(it.href) : it.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const subKey = (sb, parentKey, parentHref) =>
  parentHref && sb.href.split('?')[0] === parentHref.split('?')[0]
    ? `${parentKey}.overview`
    : slugOf(sb.href);

/*  A row with a query string is a second DOOR onto a screen that already has a
    node (DEC-RTN-016) — never a screen of its own. Skipping them here is what
    keeps "no duplicate key" true when Returns appears in three groups.  */
const isAlias = (href) => !!href && href.includes('?');

function keysFromSidebar(GROUPS) {
  const moduleHrefs = new Set();
  for (const g of GROUPS)
    for (const it of g.items) if (it.href) moduleHrefs.add(it.href.split('?')[0]);

  const keys = [];
  const shortcuts = [];
  for (const g of GROUPS) {
    for (const it of g.items) {
      if (isAlias(it.href)) continue;
      const mk = moduleKey(it);
      keys.push(mk);
      const walk = (subs, parentKey, parentHref) => {
        for (const sb of subs ?? []) {
          // a sub pointing at ANOTHER module is a shortcut, not a screen of its own
          const base = sb.href.split('?')[0];
          if (base !== (parentHref ?? '').split('?')[0] && moduleHrefs.has(base) && base !== (it.href ?? '').split('?')[0]) {
            shortcuts.push(`${mk} -> ${sb.href}`);
            continue;
          }
          const sk = subKey(sb, parentKey, parentHref);
          keys.push(sk);
          if (sb.subs) walk(sb.subs, sk, sb.href);
        }
      };
      walk(it.subs, mk, it.href);
    }
  }
  return { keys, shortcuts };
}

console.log('\n=== registry drift check (sidebar vs registry.def.ts) ===\n');

const GROUPS = readSidebar();
const { keys: sidebarKeys, shortcuts } = keysFromSidebar(GROUPS);

const def = readFileSync(DEF, 'utf8');
const defKeys = [...def.matchAll(/"key":\s*"([^"]+)"/g)].map((m) => m[1]);
const defSet = new Set(defKeys);

ok('registry.def.ts has no duplicate key',
  defSet.size === defKeys.length, `${defKeys.length} nodes, ${defSet.size} unique`);

const missing = [...new Set(sidebarKeys)].filter((k) => !defSet.has(k));
ok('every sidebar entry has a node in the registry',
  missing.length === 0,
  missing.length ? missing.join(', ') : `${new Set(sidebarKeys).size} checked`);

const orphaned = defKeys.filter((k) => !sidebarKeys.includes(k));
ok('every registry node is still on the sidebar',
  orphaned.length === 0,
  orphaned.length ? orphaned.join(', ') : 'none orphaned');

/*  A shortcut resolves to another module's key, so it must ALSO exist — a
    dangling one is a menu row that can never be granted to anybody.  */
const badShortcuts = shortcuts.filter((s) => {
  const href = s.split(' -> ')[1];
  return !defSet.has(slugOf(href));
});
ok('every cross-module shortcut points at a real node',
  badShortcuts.length === 0,
  badShortcuts.join(', ') || shortcuts.join(', ') || 'none');

/*  The last hand-written roles: arrays. They are the transitional bridge that
    builds the three starting positions, so they must survive verbatim into the
    generated file — if a legacyRoles is dropped, a position quietly opens up.  */
const sidebarRoleLines = (readFileSync(SIDEBAR, 'utf8').match(/roles:\s*\[/g) ?? []).length;
const defRoleEntries = (def.match(/"legacyRoles":\s*\[/g) ?? []).length;
ok('every roles: array in the sidebar survived into the registry',
  defRoleEntries >= sidebarRoleLines - 1, // -1: the `type Role` line is not an entry
  `${sidebarRoleLines} in sidebar, ${defRoleEntries} in registry`);

/*  ---- GUARD COVERAGE — added 30 Jul 2026 after the review found the hole ----
 *
 *  The AccessGuard finds a node from the FIRST PATH SEGMENT. That works because
 *  the panel and the API mostly share names — but not always: the API serves
 *  /hr while the menu says /employees, and /offers and /seo live under Marketing
 *  in the menu. For those three the guard looked up a key that does not exist,
 *  found nothing, and WAVED EVERY REQUEST THROUGH.
 *
 *  The damage is not that they were open — the guard blocks nothing yet — it is
 *  that the silent stage would have reported a clean sheet for payroll,
 *  discounts and SEO while never having checked them once. An empty report read
 *  as proof is worse than no report.
 *
 *  So: every controller prefix must be a node, an alias, or explicitly exempt.
 *  A new module cannot be added without one of the three being true.
 */
import { readdirSync } from 'node:fs';

const guardSrc = readFileSync(
  join(ROOT, 'apps', 'api', 'src', 'administration', 'access.guard.ts'), 'utf8',
);
const never = new Set(
  [...(guardSrc.match(/NEVER = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '')
    .matchAll(/'([^']*)'/g)].map((m) => m[1]),
);
const aliases = new Set(
  [...(guardSrc.match(/PATH_TO_NODE[^=]*=\s*\{([\s\S]*?)\n  \};/)?.[1] ?? '')
    .matchAll(/^\s*'?([\w-]+)'?:/gm)].map((m) => m[1]),
);

/*  EVERY .ts file, recursively - not only *.controller.ts. Most controllers
    live in files like catalog/addons.ts, and the day this scan read only
    controller-named files it reported 22 prefixes while the live guard was
    warning about 25 more it had never heard of (19 Aug 2026).  */
const apiSrc = join(ROOT, 'apps', 'api', 'src');
const prefixes = new Set();
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { walk(join(dir, e.name)); continue; }
    if (!e.name.endsWith('.ts')) continue;
    const src = readFileSync(join(dir, e.name), 'utf8');
    for (const m of src.matchAll(/@Controller\((['"])([^'"]*)\1\)/g)) {
      prefixes.add(m[2].split('/')[0]);
    }
  }
};
walk(apiSrc);

const uncovered = [...prefixes].filter(
  (p) => !never.has(p) && !aliases.has(p) && !defSet.has(p),
);
ok('every API route group is judged, aliased, or explicitly exempt',
  uncovered.length === 0,
  uncovered.length
    ? `UNJUDGED: ${uncovered.map((p) => '/' + p).join(', ')}`
    : `${prefixes.size} prefixes: ${[...prefixes].filter((p) => defSet.has(p)).length} by node, ${[...prefixes].filter((p) => aliases.has(p)).length} aliased, ${[...prefixes].filter((p) => never.has(p)).length} exempt`);

console.log(`\n================ ${pass} passed, ${fail} failed ================`);
if (fail > 0) {
  console.log('\nWhat failed:');
  for (const p of problems) console.log(`  · ${p}`);
  console.log(
    '\nThe two lists have drifted apart. This is the bug the Administration\n' +
    'module was built to end, and it fails SILENTLY in the panel: a screen\n' +
    'simply stops appearing for somebody, with no error anywhere.\n\n' +
    'FIX: regenerate registry.def.ts from AdminSidebar.tsx, then run this again.\n',
  );
  process.exit(1);
}
console.log('The sidebar and the registry agree. There is only one list.\n');
