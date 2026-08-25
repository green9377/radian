/*
  ═══════════════════════════════════════════════════════════════════════════
  RADIAN REGRESSION SUITE — "সব ঠিক আছে কি না" জানার যন্ত্র

      RUN_TESTS.bat                              ← এক click (repo root-এ)
      node apps/api/scripts/regression-suite.js  ← হাতে চালালে
      node apps/api/scripts/regression-suite.js --full   ← + delivered→Finance

  ── এটা কী ─────────────────────────────────────────────────────────────
  মালিকের locked business rule-গুলোর প্রতিটা, একটা করে পরীক্ষা। শেষ লাইনে
  হয় ALL GOOD, নয়তো ঠিক কোন নিয়মটা ভাঙল তার নাম। যেকোনো কোড-বদলের পরে
  এটা চালাও: ALL GOOD মানে পুরনো কিছু ভাঙেনি। মালিকের প্রশ্নের উত্তরে
  বানানো (৪ আগস্ট ২০২৬): "ami kivabe bujbo amr project asolei totally
  100% okey?" — উত্তর: কারো মুখের কথায় না, এই যন্ত্রের রায়ে।

  ⚠️ CONSOLE OUTPUT IS ENGLISH ON PURPOSE — Windows-এর cmd বাংলা অক্ষর
  ভেঙে দেখায় (মালিক নিজে ধরেছেন, ৪ আগস্ট: "bangla kn ase duru bangla
  jen na ase")। ভেতরের কথাবার্তা (এই comment-গুলো) বাংলাতেই থাক — এগুলো
  কখনো ছাপা হয় না।

  ── কোন নিয়মগুলো পরীক্ষা হয় ────────────────────────────────────────────
   1. দোকান খোলা — catalogue পড়া যায়, মাল আছে
   2. Delivery masters — fee/method/slot টেবিল থেকে আসে (DEC-DLV-002)
   3. Quote-এর টাকা = order-এর টাকা (server-only pricing)
   4. দাম বদলে গেলে চুপচাপ বেশি charge নয় — 409 (expectedTotalPaisa)
   5. COD নিয়ম, locked §4 — crafted-এ নয়, gift-এ কখনোই নয়
   6. ভরা slot-এ storefront order ঢোকে না; slot-load সঠিক গোনে (৪ আগস্ট)
   7. Add-on inventory — দরজায় ও process-এ gate, কাটা-ফেরা (৪ আগস্ট)
   8. Variant stock — কাটা পড়ে variant-এর ঘর থেকে (DEC-PRD-014/018)
   9. Coupon — ভুল code-এ verbatim error (OFR-R08); সত্যি code-এ ছাড়
  10. Track — orderNo+phone মিললেই কেবল; ভুল phone = নেই-এর মতোই
  11. Zone — Dhaka-only পণ্য nationwide ঠিকানায় held (DEC-DLV-009)
  12. Online payment → SSLCommerz session তৈরি হয় (sandbox)
  13. [--full] placed→…→delivered পুরো জীবন + Finance journal (DEC-FIN-024)

  ── নিরাপত্তা ───────────────────────────────────────────────────────────
  ⚠️ এটা লেখে — সত্যিকারের test order, DATABASE_URL যেখানে দেখায় সেখানে।
  Production-এ কখনো চালিয়ো না। প্রতিটা পরীক্ষা নিজের পেছনে ঘর গুছায় —
  ব্যতিক্রম শুধু --full-এর delivered order-টা (delivered ফেরানো যায় না,
  সে হিসাবের খাতায় উঠে গেছে); নম্বর ছাপা হয়, admin-এ চিনে নিও।

  ── fixture বাছাই, প্রথম রানের শিক্ষা ──────────────────────────────────
  প্রথম সংস্করণ "variant-হীন + stock > 2" পণ্য খুঁজত — আসল catalogue-এ
  অমন কিছু ছিলই না (প্রায় সবার variant আছে), তাই সব SKIP। এখন: variant
  থাকলে stock-থাকা variant-টাই line-এ যায়, আর stock > 0 হলেই চলে —
  কারণ suite-এর order-গুলো prepare-এ পৌঁছানোর আগেই cancel হয়ে যায়,
  stock প্রায় ছোঁয়াই হয় না।
  ═══════════════════════════════════════════════════════════════════════════
*/

const API = (process.env.API || 'http://localhost:4000').replace(/\/$/, '');
const FULL = process.argv.includes('--full');

/*  test order-গুলো এক চেনা ভুয়া গ্রাহকে জমা হয় — admin-এ খুঁজে পাওয়া সহজ  */
const PHONE = '+8801700000001';
const ADDRESS = 'House 1, Road 1, Dhanmondi, Dhaka (REGRESSION TEST)';

/*  ভরা-slot পরীক্ষার তারিখ অনেক দূরে — আজকের আসল booking-এর সাথে যেন না মেশে  */
const FAR_DATE = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);

/*  slot-পরীক্ষার নিজের তারিখ, FAR_DATE থেকেও আলাদা — প্রথম রানের শিক্ষা #২:
    আগের test-গুলোর (এখনো cancel-না-হওয়া) order একই তারিখে বসে ছিল, capacity
    ১ করতেই "প্রথম" order-ও ঠিকভাবেই refuse হলো, আর suite সেটাকে FAIL ভাবল।
    নিয়ম ঠিকই ছিল — পরীক্ষাটা নিজের পায়ে কুড়াল মেরেছিল।  */
const SLOT_DATE = new Date(Date.now() + 22 * 864e5).toISOString().slice(0, 10);

let TOKEN = (process.env.RADIAN_TOKEN || '').trim();
let tokenIsMine = false; // আমরা login করালে আমরাই logout করাব

const results = [];
const ok = (name, note = '') => { results.push({ name, ok: true, note }); console.log(`  \x1b[32mPASS\x1b[0m  ${name}${note ? ` — ${note}` : ''}`); };
const bad = (name, note = '') => { results.push({ name, ok: false, note }); console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${note ? ` — ${note}` : ''}`); };
const skip = (name, why) => { console.log(`  \x1b[33mSKIP\x1b[0m  ${name} — ${why}`); };
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

async function call(method, path, body, admin = false) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (admin) headers['x-radian-token'] = TOKEN;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}
const msgOf = (r) => (Array.isArray(r.json?.message) ? r.json.message.join(', ') : r.json?.message) || '';

/* ── terminal-এ password: টাইপ পর্দায় দেখা যায় না ─────────────────────── */
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const onData = (ch) => { if (String(ch) !== '\r' && String(ch) !== '\n') process.stdout.write('\x1b[2K\r' + question + '*'.repeat(rl.line.length)); };
      process.stdin.on('data', onData);
      rl.question(question, (a) => { process.stdin.off('data', onData); process.stdout.write('\n'); rl.close(); resolve(a); });
    } else rl.question(question, (a) => { rl.close(); resolve(a); });
  });
}

async function ensureToken() {
  if (TOKEN) {
    const me = await call('GET', '/auth/me', null, true);
    if (me.status === 200) { console.log(`  signed in as ${me.json?.name ?? 'admin'} (via RADIAN_TOKEN)`); return true; }
    console.log('  RADIAN_TOKEN did not work — falling back to login');
    TOKEN = '';
  }
  console.log('\nAdmin login (stays on this machine, sent nowhere else):');
  const username = (await ask('  email / username: ')).trim();
  const password = await ask('  password: ', { hidden: true });
  const r = await call('POST', '/auth/login', { username, email: username, password });
  if (r.status < 300 && r.json?.token) { TOKEN = r.json.token; tokenIsMine = true; return true; }
  console.log(`  \x1b[31mlogin failed (${r.status}): ${msgOf(r)}\x1b[0m`);
  return false;
}

/*  একটা সাধারণ order-body — প্রতিটা পরীক্ষা এটার উপর নিজের বদল বসায়।
    fix.line-এ variantId আগেই বসানো (variant-ওয়ালা পণ্য হলে)।  */
function orderBody(fix, extra = {}) {
  return {
    items: [{ ...fix.line }],
    zone: 'DHAKA',
    deliveryMethodId: fix.method.id,
    deliverySlotId: fix.slot?.id,
    date: FAR_DATE,
    /*  ⚠️ COD only when the fixture can take it. On a made-to-order product
        COD is refused (locked §4) — so on an all-crafted catalogue every one
        of these orders would come back 400 and each test would report the
        COD rule instead of the rule it was written for. The suite is not
        testing COD here; section 5 does that on purpose.  */
    paymentMethod: fix.isCrafted ? 'online' : 'cod',
    senderName: 'Regression Suite',
    senderPhone: PHONE,
    address: ADDRESS,
    ...extra,
  };
}

const placedForCleanup = [];
async function cleanup() {
  for (const o of placedForCleanup) {
    const r = await call('POST', `/orders/${o.orderId}/cancel`, { reason: 'regression suite cleanup' }, true);
    if (r.status >= 300 && r.status !== 400) console.log(`  \x1b[33mNOTE\x1b[0m  cleanup: cancel of ${o.orderNo} returned ${r.status}`);
  }
}

/*  পণ্যের "বিক্রি করা যাবে এমন হাল" — variant থাকলে variant-এর ঘরে,
    নাহলে product-এর ঘরে; TRACKED হলে Inventory-র হিসাব, এখানে ধরা হয় বিক্রিযোগ্য  */
function sellableLineOf(p) {
  if (p.stockMode === 'MANUAL' && p.variants?.length) {
    const v = p.variants.find((x) => (x.stockQty ?? 0) > 0);
    return v ? { slug: p.slug, qty: 1, variantId: v.id } : null;
  }
  if (p.stockMode === 'MANUAL' && (p.stockQty ?? 0) <= 0) return null;
  return { slug: p.slug, qty: 1 };
}

(async () => {
  console.log(`\n\x1b[1mRADIAN REGRESSION SUITE\x1b[0m -> ${API}${FULL ? '  (--full)' : ''}\n`);
  if (!(await ensureToken())) { process.exitCode = 1; return; }

  /* ═══ fixtures ═══ */
  section('0. Fixtures (picking test material from the live catalogue)');
  const shopList = await call('GET', '/shop/products?zone=DHAKA&limit=48');
  const shopItems = shopList.json?.items ?? shopList.json ?? [];
  const adminList = await call('GET', '/products?pageSize=100', null, true);
  const adminItems = adminList.json?.items ?? adminList.json ?? [];
  const bySlug = new Map(adminItems.map((p) => [p.slug, p]));

  /*  দোকানে দেখা যায় এমন admin-পণ্য, বিক্রিযোগ্য অবস্থায়।

      ⚠️ প্রথম রানের শিক্ষা #১: LIST endpoint variant-এর stockQty দেয় কিন্তু
      `id` দেয় না — তাই list-এর পণ্য বাছার পরে DETAIL (GET /products/:id)
      থেকে আসল variant id তুলে নিতে হয়। আগের সংস্করণ list-এর variant দিয়েই
      order দিত → variantId undefined → variant-হীন order → পরীক্ষা নিজেই
      অন্ধ।  */
  const candidates = shopItems.map((s) => bySlug.get(s.slug)).filter(Boolean);
  const detailOf = async (p) => {
    if (!p) return null;
    const r = await call('GET', `/products/${p.id}`, null, true);
    return r.status === 200 ? r.json : null;
  };
  /*  ⚠️ THE SUITE USED TO GIVE UP ON A SHOP LIKE THIS ONE — 25 Aug 2026.
      It demanded a READYMADE product for its main fixture and, finding none,
      printed "no sellable non-crafted product found" and stopped before a
      single business rule ran.

      Every one of the owner's thirteen products is CRAFTED, and that is not
      a data mistake — it is a florist. Almost everything is made to order.
      A suite that refuses to run because the shop sells what it sells is the
      broken half of that argument.

      So the main fixture now takes whatever is sellable, and only the checks
      that GENUINELY need a readymade line skip — with the reason printed.
      `mainIsCrafted` carries that fact to the two places it changes an
      expected answer, because COD is refused on a crafted line (locked §4)
      and a test that pays by COD on one would be testing the wrong rule.  */
  const readymade = await detailOf(candidates.find((p) => p.productType !== 'CRAFTED' && !p.advanceRequired && sellableLineOf(p)));
  const crafted = await detailOf(candidates.find((p) => p.productType === 'CRAFTED' && !p.advanceRequired && sellableLineOf(p)));
  const product = readymade ?? crafted;
  const mainIsCrafted = !readymade && Boolean(crafted);
  /*  Variant stock is about the shelf, not the product type — the old filter
      excluded CRAFTED here too and blinded the check for no reason.  */
  const variantProduct = await detailOf(candidates.find((p) => !p.advanceRequired &&
    p.stockMode === 'MANUAL' && p.variants?.length && p.variants.some((v) => (v.stockQty ?? 0) > 1)));

  const menu = await call('GET', '/shop/delivery/menu?zone=DHAKA');
  const methods = Array.isArray(menu.json) ? menu.json : [];
  const method = methods.find((m) => m.slots?.length) ?? methods[0];
  const slot = method?.slots?.[0];

  if (!product) {
    bad('fixtures', 'nothing in the catalogue can be sold right now — see the list below');
    console.log('    admin sees these products (first 8):');
    for (const p of adminItems.slice(0, 8))
      console.log(`      - ${p.slug}  type=${p.productType}  stockMode=${p.stockMode}  stockQty=${p.stockQty}  variants=${p.variants?.length ?? 0}  advance=${p.advanceRequired}`);
    console.log('    A product needs: published, in this zone, and stock above zero');
    console.log('    (on its variants when it has them).');
    await done(); return;
  }
  if (!method) { bad('fixtures', 'no delivery method for DHAKA'); await done(); return; }
  const fix = { product, line: sellableLineOf(product), method, slot, isCrafted: mainIsCrafted };
  ok('fixtures', `${product.name}${fix.line.variantId ? ' (variant)' : ''} | ${method.label}${slot ? ` | ${slot.label}` : ''}`);
  if (mainIsCrafted)
    console.log('    \x1b[33mNOTE\x1b[0m  every product here is made-to-order, so the tests pay online — COD is refused on a crafted line by design');

  /* ═══ 1 ═══ */
  section('1. Shop is open (catalogue readable)');
  if (shopItems.length > 0) ok(`shop catalogue readable (${shopItems.length} products)`);
  else bad('shop catalogue empty or unreadable');

  /* ═══ 2 ═══ */
  section('2. Delivery fee comes from the masters (DEC-DLV-002)');
  if (typeof method.feePaisa === 'number') ok(`method "${method.label}" fee ${method.feePaisa} paisa — from DeliveryMethod table`);
  else bad('delivery method has no feePaisa');

  /* ═══ 3 ═══ */
  section('3. Quoted money = charged money (server-only pricing)');
  const qBody = { items: [{ ...fix.line }], zone: 'DHAKA', deliveryMethodId: method.id, deliverySlotId: slot?.id, paymentMethod: fix.isCrafted ? 'online' : 'cod', phone: PHONE };
  const quote = await call('POST', '/shop/checkout/quote', qBody);
  if (quote.status !== 201 && quote.status !== 200) bad(`quote failed (${quote.status}): ${msgOf(quote)}`);
  else {
    ok(`quote: subtotal ${quote.json.subtotalPaisa}, delivery ${quote.json.deliveryPaisa}, total ${quote.json.totalPaisa}`);
    if (quote.json.deliveryPaisa === method.feePaisa || quote.json.deliveryWaivedPaisa > 0)
      ok('quoted delivery fee equals master fee (or waived by an offer)');
    else bad(`quoted delivery ${quote.json.deliveryPaisa} != master fee ${method.feePaisa}`);

    const placed = await call('POST', '/shop/checkout', orderBody(fix, { expectedTotalPaisa: quote.json.totalPaisa }));
    if (placed.status === 201 && placed.json?.orderId) {
      placedForCleanup.push(placed.json);
      if (placed.json.totalPaisa === quote.json.totalPaisa) ok(`order ${placed.json.orderNo}: totals match (${placed.json.totalPaisa})`);
      else bad(`quoted ${quote.json.totalPaisa} but charged ${placed.json.totalPaisa} — MONEY MISMATCH`);

      const adm = await call('GET', `/orders/${placed.json.orderId}`, null, true);
      if (adm.status === 200 && adm.json?.orderNo === placed.json.orderNo) ok('admin panel sees the order, lines included');
      else bad(`admin cannot read the order (${adm.status})`);

      /* ═══ 10 (এই order দিয়েই) ═══ */
      section('10. Track — orderNo + phone must BOTH match (locked)');
      const t1 = await call('GET', `/shop/track?orderNo=${placed.json.orderNo}&phone=${encodeURIComponent(PHONE)}`);
      if (t1.status === 200 && typeof t1.json?.stage === 'number') ok('correct phone -> tracking opens');
      else bad(`tracking failed even with the right phone (${t1.status})`);
      const t2 = await call('GET', `/shop/track?orderNo=${placed.json.orderNo}&phone=%2B8801999999999`);
      if (t2.status >= 400) ok('wrong phone -> behaves as if the order does not exist (no leak)');
      else bad('wrong phone still opened the tracking — DATA LEAK');
    } else bad(`could not place the order (${placed.status}): ${msgOf(placed)}`);
  }

  /* ═══ 4 ═══ */
  section('4. Price changed under the customer -> refuse, never overcharge (409)');
  const stale = await call('POST', '/shop/checkout', orderBody(fix, { expectedTotalPaisa: 1 }));
  if (stale.status === 409) ok('stale (lower) total refused with 409');
  else { bad(`stale total got ${stale.status}, expected 409`); if (stale.json?.orderId) placedForCleanup.push(stale.json); }

  /* ═══ 5 ═══ */
  section('5. COD rules (locked section 4)');
  /*  ⚠️ THESE TWO FORCE `cod` AND MUST KEEP DOING SO. `orderBody` now picks
      online when the fixture is made-to-order, which is right everywhere
      except here — this is the one section whose whole subject IS Cash on
      Delivery. Without the override both checks would place a happy online
      order and report "should be refused" about a rule they never exercised.  */
  if (crafted) {
    const r = await call('POST', '/shop/checkout', orderBody(fix, { items: [sellableLineOf(crafted)], paymentMethod: 'cod' }));
    if (r.status === 400 && /COD|Cash on Delivery/i.test(msgOf(r))) ok(`COD refused on crafted item: "${msgOf(r).slice(0, 60)}"`);
    else { bad(`crafted + COD got ${r.status} — should be refused`); if (r.json?.orderId) placedForCleanup.push(r.json); }
  } else skip('COD-on-crafted', 'no crafted product with stock in the catalogue');
  const gift = await call('POST', '/shop/checkout', orderBody(fix, { paymentMethod: 'cod', isGift: true, recipientName: 'Test Receiver', recipientPhone: '+8801811111111' }));
  if (gift.status === 400 && /COD|gift/i.test(msgOf(gift))) ok('COD refused on a gift — gifts must be paid first');
  else { bad(`gift + COD got ${gift.status} — should be refused`); if (gift.json?.orderId) placedForCleanup.push(gift.json); }

  /* ═══ 6 ═══ */
  section('6. A full slot takes NO storefront order (owner rule, 4 Aug)');
  if (!slot) skip('full-slot rule', 'no delivery method with slots');
  else {
    const menuFresh = await call('GET', `/shop/delivery/menu?zone=DHAKA`);
    const liveSlot = (Array.isArray(menuFresh.json) ? menuFresh.json : []).find((m) => m.id === method.id)?.slots?.find((s) => s.id === slot.id);
    const origCap = liveSlot?.capacityPerDay ?? null;
    await call('PATCH', `/delivery/slots/${slot.id}`, { capacityPerDay: 1 }, true);
    try {
      /*  SLOT_DATE — নিজের ফাঁকা তারিখ, আগের test-order-দের থেকে দূরে  */
      const o1 = await call('POST', '/shop/checkout', orderBody(fix, { date: SLOT_DATE }));
      if (o1.json?.orderId) placedForCleanup.push(o1.json);
      const load = await call('GET', `/shop/delivery/slot-load?date=${SLOT_DATE}`);
      const counted = load.json?.[slot.id] ?? 0;
      if (o1.status === 201 && counted >= 1) ok(`slot filled (order ${o1.json.orderNo}); slot-load counted ${counted}`);
      else bad(`first order / count went wrong (status ${o1.status}, count ${counted})`);
      const o2 = await call('POST', '/shop/checkout', orderBody(fix, { date: SLOT_DATE }));
      if (o2.status === 400 && /slot/i.test(msgOf(o2))) ok(`second order refused: "${msgOf(o2).slice(0, 55)}"`);
      else { bad(`order slipped into a FULL slot (${o2.status})!`); if (o2.json?.orderId) placedForCleanup.push(o2.json); }
    } finally {
      await call('PATCH', `/delivery/slots/${slot.id}`, { capacityPerDay: origCap }, true);
    }
  }

  /* ═══ 7 ═══ */
  section('7. Add-on inventory gates (owner rule, 4 Aug)');
  const addonsR = await call('GET', '/addons', null, true);
  const addonArr = Array.isArray(addonsR.json) ? addonsR.json
    : (addonsR.json?.addOns ?? addonsR.json?.addons ?? Object.values(addonsR.json ?? {}).find(Array.isArray) ?? []);
  const addon = addonArr.find((a) => a.isActive !== false && a.name);
  if (!addon) skip('add-on gates', 'no add-on master exists');
  else {
    const origStock = addon.stockQty ?? null;
    const readStock = async () => {
      const r = await call('GET', '/addons', null, true);
      const arr = Array.isArray(r.json) ? r.json : (r.json?.addOns ?? Object.values(r.json ?? {}).find(Array.isArray) ?? []);
      return arr.find((a) => a.id === addon.id)?.stockQty;
    };
    try {
      await call('PATCH', `/addons/${addon.id}`, { stockQty: 0 }, true);
      const r0 = await call('POST', '/shop/checkout', orderBody(fix, { items: [{ ...fix.line, addonIds: [addon.id] }] }));
      if (r0.status === 400 && /add-on/i.test(msgOf(r0))) ok(`zero-stock add-on refused at the door: "${msgOf(r0).slice(0, 55)}"`);
      else { bad(`add-on order accepted at stock 0 (${r0.status})`); if (r0.json?.orderId) placedForCleanup.push(r0.json); }

      await call('PATCH', `/addons/${addon.id}`, { stockQty: 5 }, true);
      const r1 = await call('POST', '/shop/checkout', orderBody(fix, { items: [{ ...fix.line, addonIds: [addon.id] }] }));
      if (r1.status !== 201) bad(`add-on order failed even at stock 5 (${r1.status}): ${msgOf(r1)}`);
      else {
        placedForCleanup.push(r1.json);
        await call('POST', `/orders/${r1.json.orderId}/confirm`, {}, true);
        await call('PATCH', `/addons/${addon.id}`, { stockQty: 0 }, true); // মাঝপথে ফুরাল
        const p0 = await call('POST', `/orders/${r1.json.orderId}/prepare`, {}, true);
        if (p0.status === 400 && /add-on/i.test(msgOf(p0))) ok('inventory checked again at processing — no stock, no prepare');
        else bad(`prepare went through with add-on stock 0 (${p0.status})`);
        await call('PATCH', `/addons/${addon.id}`, { stockQty: 5 }, true);
        const p1 = await call('POST', `/orders/${r1.json.orderId}/prepare`, {}, true);
        const nowStock = await readStock();
        if (p1.status < 300 && nowStock === 4) ok(`prepare deducted the add-on: 5 -> ${nowStock}`);
        else bad(`prepare/deduction went wrong (status ${p1.status}, stock ${nowStock})`);
        await call('POST', `/orders/${r1.json.orderId}/cancel`, { reason: 'regression' }, true);
        const backStock = await readStock();
        if (backStock === 5) ok(`cancel restored the add-on: 4 -> ${backStock}`);
        else bad(`after cancel add-on stock is ${backStock}, expected 5`);
      }
    } finally {
      await call('PATCH', `/addons/${addon.id}`, { stockQty: origStock }, true);
    }
  }

  /* ═══ 8 ═══ */
  section('8. Variant stock — deducted from the variant shelf (DEC-PRD-014)');
  if (!variantProduct) skip('variant stock', 'no product with variant stock > 1');
  else {
    const v = variantProduct.variants.find((x) => (x.stockQty ?? 0) > 1);
    /*  ⚠️ READ THE SHELF NOW, NOT AT FIXTURE TIME — 25 Aug 2026.
        This compared against the number captured before section 0 finished,
        and sections 3 to 7 place and PREPARE orders on the main fixture in
        between. The moment the main fixture and this one land on the same
        product — which they do on an all-crafted catalogue — section 7's
        deduction was blamed on section 8: "11 -> 9" for an order of one, and
        then the cancel check failed for the same reason.

        Neither was a stock bug. It was this test trusting a stale number.  */
    const readVariant = async () => {
      const fresh = await call('GET', `/products/${variantProduct.id}`, null, true);
      return fresh.json?.variants?.find((x) => x.id === v.id)?.stockQty;
    };
    const vBefore = await readVariant();
    const r = await call('POST', '/shop/checkout', orderBody(fix, { items: [{ slug: variantProduct.slug, qty: 1, variantId: v.id }] }));
    if (r.status !== 201) bad(`variant order failed (${r.status}): ${msgOf(r)}`);
    else {
      placedForCleanup.push(r.json);
      await call('POST', `/orders/${r.json.orderId}/confirm`, {}, true);
      const p = await call('POST', `/orders/${r.json.orderId}/prepare`, {}, true);
      const vNow = await readVariant();
      if (p.status < 300 && vNow === vBefore - 1) ok(`variant "${v.label ?? v.name ?? 'variant'}" deducted: ${vBefore} -> ${vNow}`);
      else bad(`variant deduction went wrong (prepare ${p.status}, stock ${vBefore} -> ${vNow})`);
      await call('POST', `/orders/${r.json.orderId}/cancel`, { reason: 'regression' }, true);
      const vBack = await readVariant();
      /*  DEC-SAL-012 — the owner ruled on 25 Aug 2026, so this is a hard
          assertion again, and it now asserts the RIGHT thing:

            readymade — picked off a shelf, untouched, so it goes back
            crafted   — the stems are cut, so the number stays down

          It used to demand a restore from both and called the crafted case a
          broken rule. It was the test that was wrong.  */
      const craftedLine = variantProduct.productType === 'CRAFTED';
      if (craftedLine) {
        if (vBack === vNow) ok(`made-to-order: cancel correctly did NOT return the stock (stays ${vBack}) — DEC-SAL-012`);
        else bad(`made-to-order line put stock back (${vNow} -> ${vBack}) — the flowers were already cut`);
      } else {
        if (vBack === vBefore) ok(`readymade: cancel restored the variant: ${vNow} -> ${vBack}`);
        else bad(`after cancel variant stock is ${vBack}, expected ${vBefore}`);
      }
    }
  }

  /* ═══ 9 ═══ */
  section('9. Coupons (OFR-R08 — a wrong code gets honest words)');
  const wrong = await call('POST', '/shop/checkout/quote', { ...qBody, couponCode: 'NO-SUCH-CODE-123' });
  if (wrong.json?.couponError) ok(`wrong code -> verbatim error: "${wrong.json.couponError.slice(0, 50)}"`);
  else bad('wrong coupon produced no couponError');
  const offersR = await call('GET', '/offers', null, true);
  const offersArr = Array.isArray(offersR.json) ? offersR.json : (offersR.json?.items ?? Object.values(offersR.json ?? {}).find(Array.isArray) ?? []);
  const liveCoupon = offersArr.find((o) => o.code && (o.isActive ?? o.active ?? o.status === 'ACTIVE'));
  if (!liveCoupon) skip('real coupon discount', 'no active coupon offer configured');
  else {
    const good = await call('POST', '/shop/checkout/quote', { ...qBody, couponCode: liveCoupon.code });
    if (!good.json?.couponError && (good.json?.discountPaisa > 0 || good.json?.deliveryWaivedPaisa > 0))
      ok(`"${liveCoupon.code}" applied — discount ${good.json.discountPaisa}, delivery waived ${good.json.deliveryWaivedPaisa}`);
    else if (good.json?.couponError) skip(`coupon "${liveCoupon.code}"`, `engine said: ${good.json.couponError.slice(0, 60)} (conditions unmet, not a broken rule)`);
    else bad(`"${liveCoupon.code}" gave neither a discount nor an explanation`);
  }

  /* ═══ 11 ═══ */
  section('11. Dhaka-only products do not ship nationwide (DEC-DLV-009)');
  const dhakaOnly = candidates.find((p) => p.dhakaOnly === true)
    ?? candidates.find((p) => p.deliveryZone === 'DHAKA' || p.zone === 'DHAKA');
  if (!dhakaOnly) skip('zone hold', 'could not identify a dhaka-only flag in the admin list');
  else {
    const zq = await call('POST', '/shop/checkout/quote', { items: [{ slug: dhakaOnly.slug, qty: 1 }], zone: 'BANGLADESH', phone: PHONE });
    const held = zq.json?.held?.length > 0;
    const inLines = zq.json?.lines?.some((l) => l.slug === dhakaOnly.slug && !l.held);
    if (held || !inLines) ok(`"${dhakaOnly.name}" is held/absent in a nationwide quote`);
    else bad(`dhaka-only "${dhakaOnly.name}" sells happily in a nationwide quote`);
  }

  /* ═══ 12 ═══ */
  section('12. Online payment -> SSLCommerz session (sandbox)');
  const onl = await call('POST', '/shop/checkout', orderBody(fix, { paymentMethod: 'online' }));
  if (onl.status !== 201) bad(`online order failed (${onl.status}): ${msgOf(onl)}`);
  else {
    placedForCleanup.push(onl.json);
    if (onl.json.needsPayment !== true) bad('online order did not come back with needsPayment=true');
    const sess = await call('POST', '/shop/payment/session', { orderId: onl.json.orderId });
    if (sess.status < 300 && sess.json?.gatewayUrl) ok(`gateway session created (${sess.json.sandbox ? 'sandbox' : 'LIVE'})`);
    else bad(`payment session failed (${sess.status}): ${msgOf(sess)}`);
  }

  /* ═══ 13 ═══ */
  if (FULL) {
    section('13. Full lifecycle -> Finance journal (DEC-FIN-024) [--full]');
    const lc = await call('POST', '/shop/checkout', orderBody(fix));
    if (lc.status !== 201) bad(`lifecycle order failed (${lc.status})`);
    else {
      const id = lc.json.orderId;
      let alive = true;
      for (const ep of ['confirm', 'prepare', 'out-for-delivery', 'delivered']) {
        const r = await call('POST', `/orders/${id}/${ep}`, {}, true);
        if (r.status >= 300) { bad(`${ep} failed (${r.status}): ${msgOf(r)}`); alive = false; break; }
      }
      if (alive) {
        ok(`${lc.json.orderNo}: placed -> confirmed -> preparing -> out -> delivered`);
        /*  ⚠️ Array.isArray আগে! `[].entries` একটা built-in method — আগের
            সংস্করণের `json?.entries ?? json` fallback আসল তালিকার বদলে সেই
            method-টা ধরে ফেলত, আর ভরা খাতাকেও "খালি" বলত (প্রথম --full
            রানে ধরা, ৪ আগস্ট: JV-000005/6 দিব্যি ছিল, suite চোখে দেখেনি)।
            সাথে ছোট retry — booking fail-soft হলে এক নিঃশ্বাস দেরি হতে পারে।  */
        let found = false;
        for (let tryNo = 0; tryNo < 3 && !found; tryNo++) {
          if (tryNo) await new Promise((r) => setTimeout(r, 1500));
          const led = await call('GET', '/finance/ledger?take=40', null, true);
          const entries = Array.isArray(led.json) ? led.json
            : (Array.isArray(led.json?.entries) ? led.json.entries
              : (Array.isArray(led.json?.rows) ? led.json.rows : []));
          found = entries.some((e) => JSON.stringify(e).includes(lc.json.orderNo));
        }
        if (found) ok(`Finance ledger holds a journal for ${lc.json.orderNo} — the money reached the books`);
        else bad(`no ledger entry found for ${lc.json.orderNo}`);
        console.log(`  \x1b[33mNOTE\x1b[0m  ${lc.json.orderNo} stays as a delivered TEST order — recognise it in the admin`);
      }
    }
  }

  await done();

  async function done() {
    section('Cleanup');
    await cleanup();
    console.log(`  cancelled ${placedForCleanup.length} test order(s)`);
    if (tokenIsMine) await call('POST', '/auth/logout', {}, true);

    const fails = results.filter((r) => !r.ok);
    console.log('\n' + '='.repeat(60));
    if (fails.length === 0) {
      console.log(`\x1b[1m\x1b[32m  ALL GOOD — every rule held (${results.length} checks)\x1b[0m`);
    } else {
      console.log(`\x1b[1m\x1b[31m  ${fails.length} RULE(S) BROKEN out of ${results.length} checks:\x1b[0m`);
      for (const f of fails) console.log(`    FAIL  ${f.name}${f.note ? ` — ${f.note}` : ''}`);
      process.exitCode = 1;
    }
    console.log('='.repeat(60) + '\n');
  }
})().catch((e) => { console.error('\nThe suite itself crashed:', e.message); process.exitCode = 1; });
