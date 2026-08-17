/* eslint-disable no-console */
/**
 * THE GENERATOR — registry.def.ts is BUILT from AdminSidebar.tsx by this file.
 *
 * WHY THIS EXISTS (17 August 2026)
 *
 * registry.def.ts opens with a warning: "নতুন পর্দা যোগ করলে AdminSidebar.tsx-এ
 * যোগ করে এই ফাইলটা আবার তৈরি করতে হবে" — regenerate it. And registry.drift.mjs
 * exists to shout when the two disagree. But the tool that was supposed to do
 * the regenerating was never committed. So the instruction could not be
 * followed, and by today the registry was missing THIRTEEN screens: the whole
 * Storefront module, Inbox, Daily capacity, Settle a carrier, Recover lost
 * orders. Every one of them fell through to "visible to anybody", because an
 * unknown key defaults to open. The guard rail was there; the tool was not.
 *
 * A check nobody can act on is not a check. This is the missing half.
 *
 *   node apps/api/src/administration/registry.gen.mjs          — write the file
 *   node apps/api/src/administration/registry.gen.mjs --check  — print, write nothing
 *
 * Then always: node apps/api/src/administration/registry.drift.mjs
 *
 * ⚠️ slugOf / moduleKey / subKey below MUST stay character-identical to the
 *    copies in AdminSidebar.tsx and registry.drift.mjs (ADM-RULE-001). Three
 *    copies is one too many, but a shared package for a two-app repo costs
 *    more than the drift check costs to run.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..', '..', '..');
const SIDEBAR = join(ROOT, 'apps', 'admin', 'app', '_components', 'AdminSidebar.tsx');
const DEF = join(here, 'registry.def.ts');

/*  The GROUPS array is EVALUATED, not regex-scraped: `match:` entries are real
    functions and one of them contains a multi-line array that defeated the
    first attempt at stripping them. Comments go, `exact` is defined, the
    functions are left alone. Same approach as registry.drift.mjs.  */
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

const slugOf = (h) => h.split('?')[0].replace(/^\//, '').replace(/\//g, '.') || 'root';
const moduleKey = (it) =>
  it.href ? slugOf(it.href) : it.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const subKey = (sb, parentKey, parentHref) =>
  parentHref && sb.href.split('?')[0] === parentHref.split('?')[0]
    ? `${parentKey}.overview`
    : slugOf(sb.href);

/*  AN ALIAS IS NOT A SCREEN — DEC-RTN-016 (17 Aug 2026).
 *
 *  The panel is arranged by what a thing belongs to, so one screen can be
 *  reached from two places: Returns has a website door and a counter door,
 *  SEO has four tabs. Those rows carry a query string.
 *
 *  A query string does not make a different screen, so it must not make a
 *  different NODE. If it did, Access control would list "Returns" four times,
 *  and — worse — each invented key would be a key nobody ever ticked, which
 *  falls through to VISIBLE. Denying somebody the Returns module would leave
 *  every filtered view of it wide open.
 *
 *  So: a row whose href has a `?` inherits the node of its base href and
 *  produces nothing of its own.  */
const isAlias = (href) => !!href && href.includes('?');

function nodesFrom(GROUPS) {
  const moduleBaseHrefs = new Set();
  for (const g of GROUPS)
    for (const it of g.items) if (it.href) moduleBaseHrefs.add(it.href.split('?')[0]);

  const nodes = [];
  const seen = new Set();
  let sortOrder = 0;

  const push = (key, parentKey, kind, label, domain, href, legacyRoles) => {
    if (seen.has(key)) return; // an alias resolved onto an existing node
    seen.add(key);
    nodes.push({
      key,
      parentKey,
      kind,
      label,
      domain,
      href: href ? href.split('?')[0] : null,
      legacyRoles: legacyRoles ?? null,
      sortOrder: sortOrder++,
    });
  };

  for (const g of GROUPS) {
    for (const it of g.items) {
      if (isAlias(it.href)) continue; // a door onto a module listed elsewhere
      const mk = moduleKey(it);
      push(mk, null, 'MODULE', it.label, g.title, it.href ?? null, it.roles);

      const walk = (subs, parentKey, parentHref) => {
        for (const sb of subs ?? []) {
          /*  A sub pointing at ANOTHER module is a shortcut (Orders → Returns),
              not a screen of its own — it resolves to that module's node.  */
          const base = sb.href.split('?')[0];
          if (base !== (parentHref ?? '').split('?')[0] && moduleBaseHrefs.has(base) && base !== (it.href ?? '').split('?')[0])
            continue;
          const sk = subKey(sb, parentKey, parentHref);
          push(sk, parentKey, 'SCREEN', sb.label, g.title, sb.href, sb.roles);
          if (sb.subs) walk(sb.subs, sk, sb.href);
        }
      };
      walk(it.subs, mk, it.href);
    }
  }
  return nodes;
}

const HEADER = `/*  THE ONE LIST  —  ADM-D05 / ADM-RULE-001
 *
 *  ⚠️ এই ফাইলটা হাতে লেখা নয় — GENERATED。 হাতে সারি বসালে পরের বার
 *     regenerate-এ মুছে যাবে, আর ঠিক সেই drift ফিরে আসবে যেটা এই module
 *     বন্ধ করতে এসেছে。
 *
 *       node apps/api/src/administration/registry.gen.mjs      ← এটা বানায়
 *       node apps/api/src/administration/registry.drift.mjs    ← এটা মেলায়
 *
 *  কেন এটা API-তে, panel-এ নয়: আগে দুটো তালিকা ছিল — সাইডবারের roles: array
 *  আর controller-এর @Roles — আর কেউ মেলাত না। Intelligence বানানোর দিন সাইডবারে
 *  roles বসানোয় STAFF-এর কাছ থেকে পুরো module লুকিয়ে গিয়েছিল, অথচ সিদ্ধান্ত ছিল
 *  উল্টো আর API খোলাই ছিল। কোনো error হয়নি।
 *
 *  এখন তালিকা একটাই, আর সেটা এখানে। সাইডবার এটা পড়বে (GET /administration/menu),
 *  পাহারাও এটা পড়বে। মেলানোর কিছু থাকবে না, কারণ মেলানোর মতো দ্বিতীয় তালিকা নেই।
 *
 *  legacyRoles = সাইডবারে যা লেখা আছে। শুরুর তিনটে পদ এখান থেকেই বানানো হয়
 *  (ADM-D02), যাতে প্রথম দিন কারও কিছু না বদলায়। নতুন টিক Position টেবিলে যাবে।
 *
 *  query-string যুক্ত সারি (?channel= / ?tab=) এখানে নেই — ওগুলো এক পর্দার
 *  দ্বিতীয় দরজা, আলাদা পর্দা নয় (DEC-RTN-016)。 base href-এর node-ই ওদের node。
 */

export type RegistryNode = {
  key: string;
  parentKey: string | null;
  kind: "MODULE" | "SCREEN";
  label: string;
  domain: string;
  href: string | null;
  /** আজকের সাইডবারে লেখা নিয়ম — শুধু শুরুর পদ বানানোর জন্য */
  legacyRoles: ("OWNER" | "MANAGER" | "STAFF")[] | null;
  sortOrder: number;
};

export const REGISTRY: RegistryNode[] = `;

const nodes = nodesFrom(readSidebar());
const out = `${HEADER}${JSON.stringify(nodes, null, 2).replace(/\n/g, '\n')};\n`;

const check = process.argv.includes('--check');
console.log(`\n=== registry.gen — ${nodes.length} nodes from AdminSidebar.tsx ===\n`);
for (const g of [...new Set(nodes.map((n) => n.domain))])
  console.log(`  ${String(nodes.filter((n) => n.domain === g).length).padStart(4)}  ${g}`);
console.log(`\n  modules: ${nodes.filter((n) => n.kind === 'MODULE').length}`);
console.log(`  legacyRoles carried: ${nodes.filter((n) => n.legacyRoles).length}`);

if (check) {
  const same = readFileSync(DEF, 'utf8') === out;
  console.log(`\n  ${same ? 'IN SYNC — nothing to write' : 'OUT OF SYNC — run without --check'}\n`);
  process.exit(same ? 0 : 1);
}
writeFileSync(DEF, out, 'utf8');
console.log(`\n  written: ${DEF}\n`);
