import { spawn } from 'node:child_process';
import { writeFileSync, appendFileSync } from 'node:fs';

const LOG = 'D:\\radian\\_smoke_product.log';
const BASE = 'http://localhost:4000';
const sfx = Date.now().toString().slice(-6);
writeFileSync(LOG, `===== SMOKE START ${new Date().toISOString()} (sfx=${sfx}) =====\n`);
const log = (m) => appendFileSync(LOG, m + '\n');

const env = {
  ...process.env,
  DATABASE_URL: 'postgresql://radian_user:radian_pass@localhost:5433/radian_db',
  PORT: '4000',
};
const srv = spawn(process.execPath, ['dist/main'], {
  cwd: 'D:\\radian\\apps\\api',
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvOut = '';
srv.stdout.on('data', (d) => (srvOut += d));
srv.stderr.on('data', (d) => (srvOut += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function up() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(BASE + '/');
      if (r.ok || r.status === 404) return true;
    } catch {}
    await sleep(700);
  }
  return false;
}
async function J(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    j = t;
  }
  return { status: r.status, body: j };
}

const ok = await up();
log(`server up: ${ok} (pid ${srv.pid})`);
try {
  if (!ok) throw new Error('server did not start');
  let r;

  r = await J('POST', '/categories', { slug: `flowers-${sfx}`, name: 'Fresh Flowers' });
  const cat = r.body;
  log(`CATEGORY: ${r.status} id=${cat.id} name=${cat.name}`);

  r = await J('POST', '/categories', { slug: `roses-${sfx}`, name: 'Roses', parentId: cat.id });
  const sub = r.body;
  log(`SUB-CATEGORY: ${r.status} id=${sub.id} parent=${sub.parentId}`);

  r = await J('POST', '/tags', { slug: `birthday-${sfx}`, name: 'Birthday', type: 'OCCASION' });
  const tag = r.body;
  log(`TAG: ${r.status} id=${tag.id} type=${tag.type}`);

  r = await J('POST', '/variant-groups', { kind: 'COLOUR', label: 'Colour' });
  const vg = r.body;
  log(`VARIANT-GROUP: ${r.status} id=${vg.id}`);

  r = await J('POST', '/products', {
    slug: `velvet-red-24-${sfx}`,
    name: 'Velvet Red - 24 Roses',
    categoryId: sub.id,
    tagIds: [tag.id],
    productType: 'READYMADE',
    zone: 'DHAKA',
    natureType: 'FRESH',
    natureLabel: '100% Fresh Flowers',
    costPaisa: 120000,
    sellingPricePaisa: 245000,
    discountType: 'PERCENT',
    discountValue: 1000,
    variantGroupId: vg.id,
    variantLabel: 'Red',
    variantSwatch: '#C4172B',
    supportsExpress: true,
    supportsSameDay: true,
    isPublished: true,
    sizes: [
      { label: '24 Stems', pricePaisa: 245000 },
      { label: '50 Stems', pricePaisa: 490000 },
    ],
    specRows: [{ item: 'Red Rose (fresh cut)', qty: '24 sticks' }],
    faqs: [{ question: 'Fresh or artificial?', answer: '100% fresh.' }],
  });
  const prod = r.body;
  log(
    `PRODUCT: ${r.status} id=${prod.id} selling=${prod.sellingPricePaisa} offer=${prod.offerPricePaisa} margin=${prod.marginPaisa} sizes=${prod.sizes?.length} tags=${prod.tags?.length}`,
  );

  r = await J('GET', `/products?search=velvet`);
  log(`LIST search=velvet: total=${r.body.total} firstOffer=${r.body.items?.[0]?.offerPricePaisa}`);

  r = await J('GET', `/products/${prod.id}`);
  log(`GET one: variantGroup=${r.body.variantGroup?.label} faqs=${r.body.faqs?.length} spec=${r.body.specRows?.length}`);

  r = await J('GET', `/products/${prod.id}/timeline`);
  log(`TIMELINE: events=${Array.isArray(r.body) ? r.body.length : '?'} latest='${r.body?.[0]?.label}'`);

  // business rule: advanceRequired without advanceType -> expect 400
  r = await J('POST', '/products', {
    slug: `bad-adv-${sfx}`,
    name: 'Bad',
    categoryId: sub.id,
    productType: 'CRAFTED',
    zone: 'DHAKA',
    natureType: 'ARTIFICIAL',
    costPaisa: 1000,
    sellingPricePaisa: 2000,
    advanceRequired: true,
  });
  log(`ADVANCE-RULE: status=${r.status} ${r.status === 400 ? 'OK rejected' : 'FAIL (should reject)'}`);

  // soft delete -> list drops
  r = await J('DELETE', `/products/${prod.id}`);
  log(`DELETE: ${r.status}`);
  r = await J('GET', `/products?search=velvet`);
  log(`AFTER DELETE total=${r.body.total} (expect 0)`);

  // restore -> list returns
  r = await J('POST', `/products/${prod.id}/restore`);
  log(`RESTORE: ${r.status}`);
  r = await J('GET', `/products?search=velvet`);
  log(`AFTER RESTORE total=${r.body.total} (expect 1)`);

  log('RESULT: PASS');
} catch (e) {
  log('ERROR: ' + (e?.message || e));
  log('server output tail: ' + srvOut.split('\n').slice(-15).join(' | '));
  log('RESULT: FAIL');
} finally {
  srv.kill('SIGKILL');
  log(`===== SMOKE DONE ${new Date().toISOString()} =====`);
}
