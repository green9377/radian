import { spawn } from 'node:child_process';
import { writeFileSync, appendFileSync } from 'node:fs';

const LOG = 'D:\\radian\\_smoke_sales.log';
const BASE = 'http://localhost:4000';
const sfx = Date.now().toString().slice(-6);
writeFileSync(LOG, `===== SALES SMOKE ${new Date().toISOString()} (sfx=${sfx}) =====\n`);
const log = (m) => appendFileSync(LOG, m + '\n');

const env = { ...process.env, DATABASE_URL: 'postgresql://radian_user:radian_pass@localhost:5433/radian_db', PORT: '4000' };
const srv = spawn(process.execPath, ['dist/main'], { cwd: 'D:\\radian\\apps\\api', env, stdio: ['ignore', 'pipe', 'pipe'] });
let srvOut = '';
srv.stdout.on('data', (d) => (srvOut += d));
srv.stderr.on('data', (d) => (srvOut += d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function up() { for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE + '/'); if (r.ok || r.status === 404) return true; } catch {} await sleep(700); } return false; }
async function J(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
const stockOf = async (id) => (await J('GET', `/products/${id}`)).body.stockQty;

const ok = await up();
log(`server up: ${ok} (pid ${srv.pid})`);
try {
  if (!ok) throw new Error('server did not start');
  let r;

  // setup: channel, customer, category, ready product (MANUAL stock 10), crafted product
  const ch = (await J('POST', '/channels', { slug: `web-${sfx}`, name: 'Website' })).body;
  log(`CHANNEL: id=${ch.id}`);
  const cus = (await J('POST', '/customers', { name: 'Nusrat', phone: `+8801712${sfx}`, country: 'Bangladesh' })).body;
  log(`CUSTOMER: id=${cus.id} ltv0=${cus.ltvPaisa} orders0=${cus.ordersCount}`);
  const cat = (await J('POST', '/categories', { slug: `flowers-${sfx}`, name: 'Flowers' })).body;
  const ready = (await J('POST', '/products', { slug: `roses-${sfx}`, name: 'Red Roses', categoryId: cat.id, productType: 'READYMADE', zone: 'DHAKA', natureType: 'FRESH', costPaisa: 100000, sellingPricePaisa: 200000, stockMode: 'MANUAL', stockQty: 10, isPublished: true })).body;
  log(`READY PRODUCT: id=${ready.id} stock=${ready.stockQty} salesCount0=${ready.salesCount}`);
  const crafted = (await J('POST', '/products', { slug: `mug-${sfx}`, name: 'Photo Mug', categoryId: cat.id, productType: 'CRAFTED', zone: 'DHAKA', natureType: 'ARTIFICIAL', costPaisa: 30000, sellingPricePaisa: 76000, advanceRequired: true, advanceType: 'PARTIAL', advancePercent: 30 })).body;
  log(`CRAFTED PRODUCT: id=${crafted.id}`);

  // ---- happy path order ----
  r = await J('POST', '/orders', { customerId: cus.id, channelId: ch.id, zone: 'DHAKA', address: 'Banani', paymentMethod: 'online', deliveryPaisa: 8000, lines: [{ productId: ready.id, qty: 2 }] });
  const o = r.body;
  log(`ORDER: ${r.status} no=${o.orderNo} total=${o.totalPaisa} sub=${o.subtotalPaisa} sales=${o.salesStatus} deliv=${o.deliveryStatus} editableItems=${o.editable?.items}`);

  r = await J('POST', `/orders/${o.id}/confirm`);
  log(`CONFIRM: ${r.status} sales=${r.body.salesStatus} stockAfterConfirm=${await stockOf(ready.id)} (expect 10 — no deduct at confirm)`);

  r = await J('POST', `/orders/${o.id}/prepare`);
  log(`PREPARE: ${r.status} deliv=${r.body.deliveryStatus} stockAfterPrepare=${await stockOf(ready.id)} (expect 8 — DEC-MOD-003 -2)`);

  r = await J('POST', `/orders/${o.id}/out-for-delivery`);
  log(`OUT: ${r.status} deliv=${r.body.deliveryStatus} editableRecipient=${r.body.editable?.recipient} (expect false)`);

  r = await J('POST', `/orders/${o.id}/delivered`);
  log(`DELIVERED: ${r.status} sales=${r.body.salesStatus} deliv=${r.body.deliveryStatus}`);
  const rp = (await J('GET', `/products/${ready.id}`)).body;
  const rc = (await J('GET', `/customers/${cus.id}`)).body;
  log(`AFTER DELIVERED: product.salesCount=${rp.salesCount} (expect 1) | customer.ordersCount=${rc.ordersCount} (expect 1) ltvPaisa=${rc.ltvPaisa} (expect ${o.totalPaisa})`);

  // ---- COD rules ----
  r = await J('POST', '/orders', { customerId: cus.id, channelId: ch.id, zone: 'DHAKA', address: 'x', paymentMethod: 'cod', lines: [{ productId: crafted.id, qty: 1 }] });
  log(`COD+CRAFTED: status=${r.status} ${r.status === 400 ? 'OK rejected' : 'FAIL'}`);
  r = await J('POST', '/orders', { customerId: cus.id, channelId: ch.id, isGift: true, recipientName: 'X', recipientPhone: '+880', zone: 'DHAKA', address: 'x', paymentMethod: 'cod', lines: [{ productId: ready.id, qty: 1 }] });
  log(`COD+GIFT: status=${r.status} ${r.status === 400 ? 'OK rejected' : 'FAIL'}`);

  // ---- cancel-after-prepare: per-line refund + stock revert ----
  const o2 = (await J('POST', '/orders', { customerId: cus.id, channelId: ch.id, zone: 'DHAKA', address: 'y', lines: [{ productId: ready.id, qty: 3 }] })).body;
  await J('POST', `/orders/${o2.id}/confirm`);
  await J('POST', `/orders/${o2.id}/prepare`);
  const stockBeforeCancel = await stockOf(ready.id);
  r = await J('POST', `/orders/${o2.id}/cancel`, { reason: 'customer request' });
  const stockAfterCancel = await stockOf(ready.id);
  log(`CANCEL: ${r.status} sales=${r.body.salesStatus} deliv=${r.body.deliveryStatus} (expect stock_reverted) refund=${r.body.refundPaisa}`);
  log(`STOCK REVERT: before=${stockBeforeCancel} after=${stockAfterCancel} (expect +3)`);
  const o2full = (await J('GET', `/orders/${o2.id}`)).body;
  log(`CANCELLED LINE refund=${o2full.lines?.[0]?.refundPaisa} note='${o2full.lines?.[0]?.refundNote}'`);

  // cancelled order NOT counted (salesCount still 1, not 2)
  const rp2 = (await J('GET', `/products/${ready.id}`)).body;
  log(`salesCount after cancel=${rp2.salesCount} (expect still 1 — cancel not counted)`);

  // timeline + list
  r = await J('GET', `/orders/${o.id}/timeline`);
  log(`TIMELINE order1 events=${Array.isArray(r.body) ? r.body.length : '?'}`);
  r = await J('GET', `/orders?needsAction=true`);
  log(`LIST needsAction total=${r.body.total}`);

  log('RESULT: PASS');
} catch (e) {
  log('ERROR: ' + (e?.message || e));
  log('server tail: ' + srvOut.split('\n').slice(-15).join(' | '));
  log('RESULT: FAIL');
} finally {
  srv.kill('SIGKILL');
  log(`===== SALES SMOKE DONE ${new Date().toISOString()} =====`);
}
