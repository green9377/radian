import { writeFileSync, appendFileSync } from 'node:fs';
const LOG = 'D:\\radian\\_verify.log';
const BASE = 'http://localhost:4000';
writeFileSync(LOG, `===== VERIFY ${new Date().toISOString()} =====\n`);
const log = (m) => appendFileSync(LOG, m + '\n');
async function J(p) { const r = await fetch(BASE + p); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j }; }
try {
  let r = await J('/');
  log(`API health /: ${r.status}`);
  r = await J('/products?pageSize=100');
  const items = r.body.items || [];
  log(`GET /products: status=${r.status} total=${r.body.total} returned=${items.length}`);
  const cats = {}; let oos = 0, nation = 0, crafted = 0, published = 0;
  for (const p of items) {
    const c = p.category?.name || '—'; cats[c] = (cats[c] || 0) + 1;
    if (p.stockQty <= 0) oos++;
    if (p.zone === 'NATIONWIDE') nation++;
    if (p.productType === 'CRAFTED') crafted++;
    if (p.isPublished) published++;
  }
  log(`  published=${published} outOfStock=${oos} nationwide=${nation} crafted=${crafted}`);
  log(`  sample: ${items.slice(0, 5).map((p) => `${p.name} [${p.category?.name}] ৳${(p.offerPricePaisa / 100)} stock=${p.stockQty} sold=${p.salesCount}`).join(' | ')}`);
  log(`  distinct categories on products: ${Object.keys(cats).length}`);
  r = await J('/categories');
  log(`GET /categories: status=${r.status} count=${Array.isArray(r.body) ? r.body.length : '?'}`);
  r = await J('/tags');
  log(`GET /tags: status=${r.status} count=${Array.isArray(r.body) ? r.body.length : '?'}`);
  r = await J('/channels');
  log(`GET /channels: status=${r.status} count=${Array.isArray(r.body) ? r.body.length : '?'}`);
  r = await J('/segments');
  log(`GET /segments: status=${r.status} count=${Array.isArray(r.body) ? r.body.length : '?'}`);
  log('RESULT: DONE');
} catch (e) {
  log('ERROR: ' + (e?.message || e) + ' — API (:4000) চলছে তো? radian_dev.bat-এর api window খোলা আছে?');
  log('RESULT: FAIL');
}
