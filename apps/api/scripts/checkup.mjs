/*
  ═══════════════════════════════════════════════════════════════════════════
  RADIAN CHECKUP — যন্ত্র নিজেই নিজের দোষ খুঁজে বের করে

      RADIAN_CHECKUP.bat                      ← এক click (repo root-এ)
      node apps/api/scripts/checkup.mjs       ← হাতে
      API=https://... node ...  --screens     ← deployed + admin পর্দাও

  ── কেন আছে ────────────────────────────────────────────────────────────
  মালিক, ৯ আগস্ট ২০২৬: *"avabe jodi protta jinis manullay amr check kre kre
  thik kra lage koto year lagbe ami jani na"* — ঠিক কথা। এতদিন bug ধরার
  যন্ত্র ছিল একটাই: মালিকের চোখ। এই script সেই কাজটা নেয়।

  `regression-suite.js`-এর সাথে গুলিয়ে ফেলা যাবে না:
    · regression-suite = **নিয়ম** ঠিক আছে কি না (লেখে, order বসায়)
    · checkup          = **পর্দা ও দরজা** ঠিক আছে কি না (কিচ্ছু লেখে না)

  ── কী কী ধরে ──────────────────────────────────────────────────────────
   1. CRASH        — যেকোনো GET-এ 5xx (500 মানে কেউ কোথাও `!` মেরেছে)
   2. BROKEN IMAGE — record বলছে ছবি আছে, ঠিকানাটা আসলে খোলে না
   3. CSS LEAK     — imageUrl-এর ঘরে `url(...) center/cover` বসে আছে
                     (ঠিক এই ভুলেই admin-এ ছবির বদলে রঙিন বাক্স উঠেছিল)
   4. BANGLA       — API-র error message-এ বাংলা (মালিকের নির্দেশ, ৬ আগস্ট:
                     কোডের ভেতরে/পর্দায় কোথাও বাংলা নয়)
   5. INVENTED     — যে বানানো লেখাগুলো আমরা তুলে দিয়েছি, সেগুলো ফিরে এসেছে
                     কি না (trust line, "Before You Order" FAQ ইত্যাদি)
   6. [--screens]  — admin-এর প্রতিটা পাতা খুলে console error / সাদা পর্দা

  ── নিরাপত্তা ──────────────────────────────────────────────────────────
  ✅ কেবল GET। একটাও লেখে না। **production-এ চালানো নিরাপদ।**
     (regression-suite ঠিক উল্টো — সে লেখে, production-এ নয়।)

  ⚠️ CONSOLE OUTPUT IS ENGLISH ON PURPOSE — Windows-এর cmd বাংলা ভেঙে দেখায়।
  ═══════════════════════════════════════════════════════════════════════════
*/

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const ADMIN_APP = join(HERE, '..', '..', 'admin', 'app');

const API = (process.env.API || 'http://localhost:4000').replace(/\/$/, '');
const ADMIN = (process.env.ADMIN_URL || 'http://localhost:3001').replace(/\/$/, '');
const WANT_SCREENS = process.argv.includes('--screens');
const VERBOSE = process.argv.includes('--verbose');

let TOKEN = (process.env.RADIAN_TOKEN || '').trim();

/* ── report ─────────────────────────────────────────────────────────────
   একটা করে finding, কোথায় পাওয়া গেল সহ। শেষে ধরন অনুযায়ী গোছানো —
   ৪০টা আলাদা লাইনের চেয়ে "৪০টা ছবি ভাঙা, এই endpoint-গুলোয়" বেশি কাজের। */
const findings = [];
const add = (kind, where, detail) => findings.push({ kind, where, detail });

const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };
const say = (s = '') => console.log(s);

/* ── the API door ─────────────────────────────────────────────────────── */
async function get(path) {
  const headers = TOKEN ? { 'x-radian-token': TOKEN } : {};
  try {
    const res = await fetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(30_000) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json — fine */ }
    return { status: res.status, json, text };
  } catch (e) {
    return { status: 0, json: null, text: String(e?.message ?? e) };
  }
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const onData = () => process.stdout.write('\x1b[2K\r' + question + '*'.repeat(rl.line.length));
      process.stdin.on('data', onData);
      rl.question(question, (a) => { process.stdin.off('data', onData); process.stdout.write('\n'); rl.close(); resolve(a); });
    } else rl.question(question, (a) => { rl.close(); resolve(a); });
  });
}

async function ensureToken() {
  if (TOKEN) {
    const me = await get('/auth/me');
    if (me.status === 200) { say(`  signed in as ${me.json?.name ?? 'admin'} (via RADIAN_TOKEN)`); return true; }
    say('  RADIAN_TOKEN did not work — falling back to login');
    TOKEN = '';
  }
  say('\nAdmin login (stays on this machine, sent nowhere else):');
  const username = (await ask('  email / username: ')).trim();
  const password = await ask('  password: ', { hidden: true });
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: username, password }),
  });
  const j = await res.json().catch(() => null);
  if (res.ok && j?.token) { TOKEN = j.token; return true; }
  say(`  ${C.red}login failed (${res.status})${C.off}`);
  return false;
}

/* ── 1. route discovery ─────────────────────────────────────────────────
   হাতে লেখা তালিকা রাখলে সেটা পুরনো হবেই — নতুন endpoint যোগ হলে কেউ এই
   ফাইলটা মনে করে খুলবে না। তাই controller-গুলো পড়েই তালিকা বানাই: যত
   endpoint আছে, তত পরীক্ষা, চিরকাল।                                       */
function discoverRoutes() {
  const routes = [];
  for (const dir of readdirSync(SRC, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const folder = join(SRC, dir.name);
    for (const f of readdirSync(folder)) {
      if (!f.endsWith('.controller.ts')) continue;
      const code = readFileSync(join(folder, f), 'utf8');
      const prefix = code.match(/@Controller\(\s*['"`]([^'"`]*)['"`]/)?.[1] ?? '';
      for (const m of code.matchAll(/@Get\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g)) {
        const tail = m[1] ?? '';
        const path = '/' + [prefix, tail].filter(Boolean).join('/');
        routes.push({ path, group: prefix || dir.name, file: `${dir.name}/${f}` });
      }
    }
  }
  return routes;
}

/*  যেগুলো ছোঁব না: হয় বাইরের জগতে চলে যায়, নয় ইচ্ছাকৃতভাবে ভারী।  */
const SKIP = [
  /^\/auth\/logout/, /^\/media\//, /\/export$/, /\/download/, /\/backups?\/.+/,
  /^\/messaging\/webhook/, /^\/shop\/sitemap/, /\/print$/,
];

/* ── 2. what a healthy answer looks like ────────────────────────────────
   বাংলা অক্ষরের পাল্লা — কোডের ভেতরে/error-এ বাংলা মানে সেটা ভুল করে
   ছেড়ে দেওয়া হয়েছে (নিয়ম ৯)। পণ্যের নাম বাংলা হতেই পারে, তাই এটা কেবল
   error message-এর উপরে চালাই।                                            */
const BANGLA = /[ঀ-৿]/;

/*  যে বানানো লেখাগুলো তুলে দেওয়া হয়েছে (মালিক: "trust bad, faq … nijer moto
    kre auto kichu diye dey") — ফিরে এলে ধরা পড়বে।                          */
const INVENTED = [
  'Before You Order',
  '100% Fresh Flowers Guaranteed',
  'Free Message Card',
  'Handcrafted by our florists',
  'Can I change the delivery date',
];

const IMAGE_KEY = /(^|[a-z])(image|imageurl|photo|picture|icon|thumbnail|thumb|banner|logo|avatar)([A-Z]|url|$)/i;

/*  একই ছবি দশ জায়গায় থাকে — একবারই দেখি।  */
const imageSeen = new Map(); // url → ok | null (pending)

function walk(node, onValue, path = '', depth = 0) {
  if (depth > 8 || node == null) return;
  if (Array.isArray(node)) {
    // পুরো তালিকা ঘাঁটার দরকার নেই — প্রথম ২৫টা যথেষ্ট, নাহলে সময় খেয়ে ফেলে
    node.slice(0, 25).forEach((v, i) => walk(v, onValue, `${path}[${i}]`, depth + 1));
    return;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string') onValue(k, v, path ? `${path}.${k}` : k);
      else walk(v, onValue, path ? `${path}.${k}` : k, depth + 1);
    }
  }
}

async function imageReachable(url) {
  if (imageSeen.has(url)) return imageSeen.get(url);
  let ok = false;
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
    // কিছু CDN HEAD পছন্দ করে না — তখন এক byte চেয়ে দেখি
    ok = r.ok || (await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(15_000) })).ok;
  } catch { ok = false; }
  imageSeen.set(url, ok);
  return ok;
}

async function inspect(where, body) {
  const images = new Set();
  walk(body, (key, value, at) => {
    if (INVENTED.some((s) => value.includes(s))) add('INVENTED', where, `${at}: "${value.slice(0, 60)}"`);

    if (!IMAGE_KEY.test(key)) return;
    if (!value.trim()) return;
    if (/url\(|center\/cover|linear-gradient/i.test(value)) {
      add('CSS LEAK', where, `${at} holds CSS, not an address: "${value.slice(0, 60)}"`);
      return;
    }
    if (/^https?:\/\//i.test(value)) images.add(value);
  });

  for (const url of images) {
    if (!(await imageReachable(url))) add('BROKEN IMAGE', where, url.slice(0, 110));
  }
}

/* ── 3. the sweep ───────────────────────────────────────────────────────
   ধাপ ১: প্যারামিটার-হীন GET — এগুলো থেকেই আসল id কুড়াই।
   ধাপ ২: `:id`-ওয়ালা GET — কুড়ানো id বসিয়ে। id না পেলে SKIP, FAIL নয়:
          খালি ডেটাবেজ কোনো দোষ নয়।                                        */
function harvestIds(group, body) {
  const out = [];
  const rows = Array.isArray(body) ? body : (body?.items ?? body?.rows ?? body?.data ?? []);
  if (!Array.isArray(rows)) return out;
  for (const r of rows.slice(0, 3)) if (r && typeof r === 'object' && typeof r.id === 'string') out.push(r.id);
  return out;
}

async function sweepApi() {
  const routes = discoverRoutes().filter((r) => !SKIP.some((s) => s.test(r.path)));
  const plain = routes.filter((r) => !r.path.includes(':'));
  const withId = routes.filter((r) => r.path.includes(':'));

  say(`\n${C.bold}API — ${routes.length} GET endpoints found in ${new Set(routes.map((r) => r.file)).size} controllers${C.off}`);

  const ids = new Map(); // group → [id]
  let done = 0;
  const tick = (path, status) => {
    done++;
    if (VERBOSE) say(`  ${String(status).padStart(3)}  ${path}`);
    else if (done % 20 === 0) process.stdout.write(`\r  checked ${done}…    `);
  };

  for (const r of plain) {
    const res = await get(r.path);
    tick(r.path, res.status);
    if (res.status === 0) { add('UNREACHABLE', r.path, res.text); continue; }
    if (res.status >= 500) { add('CRASH', r.path, `${res.status} — ${String(res.json?.message ?? res.text).slice(0, 140)}`); continue; }
    if (res.status === 401) { add('LOCKED OUT', r.path, 'token rejected'); continue; }
    if (res.status >= 400) {
      const m = String(res.json?.message ?? '');
      if (BANGLA.test(m)) add('BANGLA', r.path, m.slice(0, 120));
      continue; // 400 on a query-less call is usually "give me a filter" — not a fault
    }
    if (BANGLA.test(String(res.json?.message ?? ''))) add('BANGLA', r.path, String(res.json.message).slice(0, 120));
    ids.set(r.group, [...(ids.get(r.group) ?? []), ...harvestIds(r.group, res.json)]);
    await inspect(r.path, res.json);
  }

  let skipped = 0;
  for (const r of withId) {
    const pool = ids.get(r.group) ?? [];
    if (!pool.length) { skipped++; continue; }
    const path = r.path.replace(/:[A-Za-z]+/g, pool[0]);
    const res = await get(path);
    tick(path, res.status);
    if (res.status === 0) { add('UNREACHABLE', path, res.text); continue; }
    if (res.status >= 500) { add('CRASH', path, `${res.status} — ${String(res.json?.message ?? res.text).slice(0, 140)}`); continue; }
    if (res.status >= 400) {
      const m = String(res.json?.message ?? '');
      if (BANGLA.test(m)) add('BANGLA', path, m.slice(0, 120));
      continue;
    }
    await inspect(path, res.json);
  }
  process.stdout.write('\r                          \r');
  say(`  ${done} endpoints answered · ${skipped} skipped (nothing in the table to open)`);
  say(`  ${imageSeen.size} distinct images checked`);
}

/* ── 4. admin screens (optional) ────────────────────────────────────────
   API সুস্থ থেকেও পর্দা সাদা হতে পারে — TDZ crash ঠিক তাই করেছিল
   ("Cannot access 'tz' before initialization", পুরো editor সাদা)। ওটা
   কেবল আসল browser-এ ধরা পড়ে।  playwright না থাকলে চুপচাপ বাদ যায়:
   অর্ধেক পরীক্ষা কোনো পরীক্ষা না থাকার চেয়ে ভালো।                          */
function discoverScreens(dir = ADMIN_APP, base = '') {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('_') || e.name === 'api' || e.name.startsWith('(')) continue;
    if (e.name.startsWith('[')) continue; // needs a real id — the API sweep covers those rows
    const here = `${base}/${e.name}`;
    if (existsSync(join(dir, e.name, 'page.tsx'))) out.push(here);
    out.push(...discoverScreens(join(dir, e.name), here));
  }
  return out;
}

async function sweepScreens() {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch {
    say(`\n${C.yellow}Screens skipped${C.off} — playwright is not installed.`);
    say(`  To switch this on once and for all:`);
    say(`    npm i -D playwright && npx playwright install chromium`);
    return;
  }

  const screens = ['/', ...discoverScreens()];
  say(`\n${C.bold}Screens — opening ${screens.length} admin pages${C.off}`);

  /*  playwright থাকা আর browser নামানো এক কথা নয় — package আছে অথচ
      chromium নেই, এই অবস্থায় প্রথম সংস্করণ পুরো checkup ফেলে দিয়েছিল
      (স্যান্ডবক্সে চালাতে গিয়ে ধরা পড়ল)। API-র ফলটা তাতে হারানো অন্যায়।  */
  let browser;
  try { browser = await chromium.launch(); }
  catch (e) {
    say(`  ${C.yellow}Could not start a browser${C.off} — ${String(e?.message ?? e).split('\n')[0].slice(0, 100)}`);
    say(`  Run once:  npx playwright install chromium`);
    return;
  }
  const ctx = await browser.newContext();
  if (TOKEN) {
    await ctx.addInitScript((t) => window.localStorage.setItem('radian.token', t), TOKEN);
  }
  const page = await ctx.newPage();

  for (const [i, route] of screens.entries()) {
    const errors = [];
    const onErr = (e) => errors.push(String(e?.message ?? e).split('\n')[0]);
    page.on('pageerror', onErr);
    page.on('console', (m) => { if (m.type() === 'error') onErr(m.text()); });
    try {
      const res = await page.goto(ADMIN + route, { waitUntil: 'networkidle', timeout: 45_000 });
      await page.waitForTimeout(400);
      const text = (await page.locator('body').innerText().catch(() => '')).trim();
      if (res && res.status() >= 500) add('SCREEN 5xx', route, `HTTP ${res.status()}`);
      else if (text.length < 40) add('BLANK SCREEN', route, `only ${text.length} characters rendered`);
      for (const e of errors.slice(0, 2)) {
        // নিজেদের নয় এমন গোলমাল (extension, favicon) বাদ
        if (/favicon|ERR_BLOCKED_BY_CLIENT|chrome-extension/i.test(e)) continue;
        add('SCREEN ERROR', route, e.slice(0, 140));
      }
    } catch (e) {
      add('SCREEN FAILED', route, String(e?.message ?? e).split('\n')[0].slice(0, 140));
    }
    page.removeAllListeners('pageerror');
    page.removeAllListeners('console');
    process.stdout.write(`\r  opened ${i + 1}/${screens.length}…    `);
  }
  process.stdout.write('\r                                \r');
  await browser.close();
  say(`  ${screens.length} pages opened`);
}

/* ── 5. the verdict ─────────────────────────────────────────────────── */
function report() {
  say(`\n${C.bold}${'─'.repeat(66)}${C.off}`);
  if (!findings.length) {
    say(`${C.green}${C.bold}  ALL CLEAR — nothing to fix.${C.off}`);
    say(`${C.bold}${'─'.repeat(66)}${C.off}\n`);
    return 0;
  }

  const byKind = new Map();
  for (const f of findings) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);

  /*  ক্রম = জরুরি আগে। CRASH-এর সাথে ভাঙা ছবির তুলনা হয় না।  */
  const ORDER = ['CRASH', 'UNREACHABLE', 'SCREEN FAILED', 'SCREEN 5xx', 'BLANK SCREEN',
    'SCREEN ERROR', 'LOCKED OUT', 'BANGLA', 'INVENTED', 'CSS LEAK', 'BROKEN IMAGE'];
  const kinds = [...byKind.keys()].sort((a, b) => (ORDER.indexOf(a) + 99) % 99 - (ORDER.indexOf(b) + 99) % 99);

  say(`${C.red}${C.bold}  ${findings.length} thing(s) to look at${C.off}\n`);
  for (const kind of kinds) {
    const list = byKind.get(kind);
    say(`  ${C.bold}${kind}${C.off} ${C.dim}(${list.length})${C.off}`);
    for (const f of list.slice(0, 12)) say(`    ${f.where}\n      ${C.dim}${f.detail}${C.off}`);
    if (list.length > 12) say(`    ${C.dim}…and ${list.length - 12} more${C.off}`);
    say('');
  }
  say(`${C.bold}${'─'.repeat(66)}${C.off}\n`);
  return kinds.some((k) => ['CRASH', 'UNREACHABLE', 'SCREEN FAILED', 'BLANK SCREEN'].includes(k)) ? 1 : 0;
}

/* ── run ─────────────────────────────────────────────────────────────── */
(async () => {
  say(`${C.bold}RADIAN CHECKUP${C.off}  ${C.dim}(read-only — writes nothing, safe on production)${C.off}`);
  say(`  API   ${API}`);
  if (WANT_SCREENS) say(`  Admin ${ADMIN}`);

  const health = await get('/health');
  if (health.status !== 200) {
    say(`\n${C.red}The API is not answering at ${API}${C.off}`);
    say(`  Start it first (START_RADIAN.bat), or point somewhere else:  set API=https://…`);
    process.exit(1);
  }

  if (!(await ensureToken())) process.exit(1);
  await sweepApi();
  if (WANT_SCREENS) await sweepScreens();
  process.exit(report());
})();
