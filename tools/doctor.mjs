/*
  Radian Doctor — "সব ঠিক আছে কিনা" এক পর্দায়।

  কেন দরকার: repo-তে ১২৫টা `.bat`। কোনটা কখন চালাতে হয় মনে রাখা অসম্ভব,
  আর কিছু ভাঙলে প্রথম প্রশ্নটাই হয় "কোথায় ভাঙল"। এই ফাইল সেই প্রশ্নের
  উত্তর দেয় — কিছু ঠিক করে না, শুধু সৎভাবে দেখায়।

  ⚠️ ইচ্ছাকৃতভাবে read-only। Doctor কখনো নিজে সারাবে না। "দেখা" আর "বদলানো"
     এক ফাইলে মিশলে ভাঙা অবস্থাটা দেখার আগেই বদলে যায় — আর তখন কারণ
     খুঁজে পাওয়া যায় না।

  ⚠️ ছাপার সব লেখা ইংরেজিতে। cmd-র console বাংলা ফন্ট আঁকতে পারে না
     (বাংলা লিখলে পর্দায় "aªòaªç" আসে)। মন্তব্য বাংলায়, output নয়।

  চালানো:  RADIAN_DOCTOR.bat   (বা: node tools/doctor.mjs)
*/

import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── ছাপার সরঞ্জাম ───────────────────────────────────────────────────── */
const C = {
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yel: (s) => `\x1b[33m${s}\x1b[0m`,
  grn: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const findings = []; // { level, what, fix }

function ok(what, detail = '') {
  console.log(`  ${C.grn('[ OK ]')} ${what}${detail ? C.dim('  ' + detail) : ''}`);
}
function warn(what, fix) {
  console.log(`  ${C.yel('[WARN]')} ${what}`);
  if (fix) console.log(`         ${C.dim('-> ' + fix)}`);
  findings.push({ level: 'warn', what, fix });
}
function fail(what, fix) {
  console.log(`  ${C.red('[FAIL]')} ${what}`);
  if (fix) console.log(`         ${C.dim('-> ' + fix)}`);
  findings.push({ level: 'fail', what, fix });
}
function section(title) {
  console.log(`\n${C.b(title)}`);
}

/*  শেল কমান্ড — ব্যর্থ হলে throw নয়, null。 Doctor-এর নিজের ক্র্যাশ করা
    সবচেয়ে অকেজো ফলাফল。  */
function sh(cmd, timeout = 20000) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      windowsHide: true,
    });
  } catch {
    return null;
  }
}

/*  ৩ সেকেন্ডের বেশি অপেক্ষা করব না — service ঘুমিয়ে থাকলেও এটুকুতেই
    উত্তর আসে, আর না এলে "উত্তর দিচ্ছে না" বলাই সঠিক。  */
async function ping(url, ms = 3000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal });
    return { ok: true, status: r.status, body: await r.text().catch(() => '') };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(t);
  }
}

/* ══════════════════════════════════════════════════════════════════════ */

console.log(C.b('\n============================================'));
console.log(C.b('   RADIAN DOCTOR  -  project health check'));
console.log(C.b('============================================'));
console.log(C.dim(`   ${new Date().toLocaleString()}`));

/* ── 1. Docker ───────────────────────────────────────────────────────── */
section('1. Docker');
const dockerUp = sh('docker version --format "{{.Server.Version}}"', 15000);
if (!dockerUp) {
  fail('Docker engine is not running', 'Open Docker Desktop, wait for "Engine running", then run START_RADIAN.bat');
} else {
  ok('Docker engine running', `v${dockerUp.trim()}`);
}

/* ── 2. Containers ───────────────────────────────────────────────────── */
section('2. Containers');
if (!dockerUp) {
  console.log(C.dim('  (skipped - Docker is down)'));
} else {
  const ps = sh('docker compose ps', 25000) ?? '';
  for (const [name, label] of [
    ['radian_postgres', 'postgres (database)'],
    ['radian_api', 'api (:4000)'],
    ['radian_web', 'web (:3000)'],
  ]) {
    const line = ps.split('\n').find((l) => l.includes(name));
    if (!line) fail(`${label} - container not found`, 'START_RADIAN.bat');
    else if (/running|Up/i.test(line)) {
      const healthy = /healthy/i.test(line);
      ok(`${label}${healthy ? ' [healthy]' : ''}`);
    } else fail(`${label} - not running`, 'START_RADIAN.bat  (or: radian_api_logs.bat to see why)');
  }
  console.log(
    C.dim('  note: admin (:3001) runs on Windows, not in Docker - START_RADIAN.bat opens it'),
  );
}

/* ── 3. Services answering ───────────────────────────────────────────── */
section('3. Services answering');
const api = await ping('http://localhost:4000/health');
if (api.ok) {
  let up = '';
  try {
    up = ` uptime ${JSON.parse(api.body).uptimeSec}s`;
  } catch { /* /health বদলে গেলেও doctor যেন না মরে */ }
  ok('API  http://localhost:4000/health', up);
} else {
  fail(`API not answering on :4000 (${api.error})`, 'radian_api_logs.bat - the log says why');
}

const admin = await ping('http://localhost:3001');
if (admin.ok) ok('Admin  http://localhost:3001');
else warn(`Admin not answering on :3001 (${admin.error})`, 'START_RADIAN.bat opens it in its own window - keep that window open');

const web = await ping('http://localhost:3000');
if (web.ok) ok('Web  http://localhost:3000');
else warn(`Storefront not answering on :3000 (${web.error})`, 'docker compose up -d web');

/* ── 4. Database & migrations ────────────────────────────────────────── */
section('4. Database & migrations');
if (!dockerUp) {
  console.log(C.dim('  (skipped - Docker is down)'));
} else {
  const st = sh('docker compose exec -T api npx prisma migrate status', 40000);
  if (!st) {
    warn('Could not read migration status', 'Is the api container running? radian_api_logs.bat');
  } else if (/have not yet been applied|not yet been applied/i.test(st)) {
    const n = (st.match(/(\d+)\s+migrations? have not yet been applied/i) ?? [])[1] ?? '?';
    fail(`${n} migration(s) waiting to be applied`, 'radian_fix_generate.bat');
  } else if (/up to date/i.test(st)) {
    const found = (st.match(/(\d+)\s+migrations? found/i) ?? [])[1];
    ok('Database schema up to date', found ? `${found} migrations` : '');
  } else {
    warn('Migration status unclear - read it yourself', 'docker compose exec api npx prisma migrate status');
  }
}

/* ── 5. Prisma client on THIS PC ─────────────────────────────────────── */
/*  আজকের (৪ আগস্ট) আসল ভোগান্তি: radian_fix_generate.bat client বানায়
    কনটেইনারের ভেতরে, কিন্তু VS Code আর `npm run build` Windows-এরটা পড়ে。
    তাই আলাদা করে এই তুলনাটা。  */
section('5. Prisma client on this PC');
const schemaPath = join(ROOT, 'apps/api/prisma/schema.prisma');
const clientPath = join(ROOT, 'apps/api/node_modules/.prisma/client/index.d.ts');
if (!existsSync(clientPath)) {
  fail('Prisma client not generated on this PC', 'BUILD_CHECK.bat');
} else if (!existsSync(schemaPath)) {
  fail('schema.prisma not found - is this the right folder?');
} else {
  const cAge = statSync(clientPath).mtimeMs;
  const sAge = statSync(schemaPath).mtimeMs;
  if (cAge < sAge) {
    const hrs = ((sAge - cAge) / 3.6e6).toFixed(1);
    fail(
      `Client is OLDER than schema.prisma by ${hrs}h - build will fail with fake "property does not exist" errors`,
      'BUILD_CHECK.bat  (regenerates on Windows, not in the container)',
    );
  } else {
    ok('Client is newer than schema', new Date(cAge).toLocaleString());
  }
}

/* ── 6. Build output ─────────────────────────────────────────────────── */
section('6. Last build');
const distMain = join(ROOT, 'apps/api/dist/main.js');
if (!existsSync(distMain)) {
  warn('No dist/main.js - never built on this PC', 'BUILD_CHECK.bat  (needed before deploy, not for local dev)');
} else {
  const age = (Date.now() - statSync(distMain).mtimeMs) / 8.64e7;
  if (age > 3) warn(`Last build was ${age.toFixed(0)} days ago`, 'BUILD_CHECK.bat before you push');
  else ok('dist/main.js present', new Date(statSync(distMain).mtimeMs).toLocaleString());
}

/* ── 7. Environment files ────────────────────────────────────────────── */
/*  T2 — .env দুই জায়গায়: root (docker) + apps/api (Prisma CLI)。
    একটা বদলে অন্যটা ভুলে যাওয়া এই প্রকল্পের পুরনো ফাঁদ。  */
section('7. Environment files');
for (const [p, why] of [
  ['.env', 'root - used by docker compose'],
  ['apps/api/.env', 'used by the Prisma CLI'],
]) {
  if (existsSync(join(ROOT, p))) ok(p, why);
  else fail(`${p} missing`, `copy .env.example to ${p} and fill it in`);
}
console.log(C.dim('  reminder: change the database and you must edit BOTH files (T2)'));

/* ── 8. Git ──────────────────────────────────────────────────────────── */
section('8. Git (your backup)');
if (!existsSync(join(ROOT, '.git'))) {
  fail('Not a git repository - 3 months of work has no backup', 'see RADIAN_DEPLOY_STEPS.md step 1');
} else {
  const dirty = (sh('git status --porcelain') ?? '').trim();
  const nDirty = dirty ? dirty.split('\n').length : 0;
  if (nDirty === 0) ok('Working tree clean - everything committed');
  else warn(`${nDirty} file(s) changed but not committed`, 'git add . && git commit -m "..." && git push');

  /*  চুপচাপ leak ধরার জাল — .gitignore ঠিক থাকলে এটা কখনো ধরা পড়বে না,
      কিন্তু ভুল করে `git add -f .env` হলে এখানেই ধরা পড়বে。  */
  const tracked = sh('git ls-files') ?? '';
  const leaked = tracked
    .split('\n')
    .filter((f) => /(^|\/)\.env($|\.)/.test(f) && !f.endsWith('.example'));
  if (leaked.length) fail(`SECRET IN GIT: ${leaked.join(', ')}`, 'git rm --cached <file>, then rotate every key in it');
  else ok('No .env file tracked by git');

  const remote = (sh('git remote -v') ?? '').trim();
  if (!remote) {
    warn('No GitHub remote yet - the backup is only on this PC', 'RADIAN_DEPLOY_STEPS.md step 1');
  } else {
    ok('GitHub remote set', (remote.split('\n')[0] || '').replace(/\s+\(fetch\)$/, ''));
    const ahead = (sh('git log --oneline @{u}..HEAD') ?? '').trim();
    if (ahead) {
      const n = ahead.split('\n').length;
      warn(`${n} commit(s) not pushed to GitHub yet`, 'git push');
    } else if (sh('git rev-parse @{u}')) {
      ok('Everything pushed to GitHub');
    }
  }
}

/* ── সারাংশ ──────────────────────────────────────────────────────────── */
const fails = findings.filter((f) => f.level === 'fail');
const warns = findings.filter((f) => f.level === 'warn');

console.log(C.b('\n============================================'));
if (!findings.length) {
  console.log(C.grn('   ALL GOOD - nothing needs attention.'));
} else {
  console.log(`   ${fails.length} problem(s), ${warns.length} warning(s)`);
  if (fails.length) {
    console.log(C.red('\n   Fix these first:'));
    fails.forEach((f, i) => {
      console.log(`     ${i + 1}. ${f.what}`);
      if (f.fix) console.log(C.dim(`        -> ${f.fix}`));
    });
  }
  if (warns.length) {
    console.log(C.yel('\n   Then these:'));
    warns.forEach((f, i) => {
      console.log(`     ${i + 1}. ${f.what}`);
      if (f.fix) console.log(C.dim(`        -> ${f.fix}`));
    });
  }
  console.log(C.dim('\n   Stuck? Show this whole screen to Claude.'));
}
console.log(C.b('============================================\n'));
