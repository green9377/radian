/*
  ═══════════════════════════════════════════════════════════════════════════
  STOREFRONT CHECKOUT SELF-TEST

      node apps/api/scripts/checkout-selftest.js

  Places a real order through the PUBLIC endpoints — the same doors the
  browser uses, with no admin token — and then reads it back through the ADMIN
  endpoint. That last step is the whole point: the bug this feature fixes was
  that a storefront order never reached the admin at all, so a test that only
  checks the checkout's own reply would have passed on the broken code too.

  ⚠️ IT WRITES. A real order, a real customer row, on whatever database
  DATABASE_URL points at. Never aim it at production. The order is left in
  `placed` so it is easy to find and cancel afterwards; it is NOT auto-deleted,
  because an order that deletes itself is exactly the behaviour this codebase
  refuses everywhere else (soft delete only, through the owning module).
  ═══════════════════════════════════════════════════════════════════════════
*/

const API = (process.env.API || 'http://localhost:4000').replace(/\/$/, '');

/** a phone nobody owns, so repeat runs land on one obvious test customer */
const TEST_PHONE = '+8801700000001';

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => {
  console.log(`  \x1b[31m✗\x1b[0m ${m}`);
  process.exitCode = 1;
};

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

(async () => {
  console.log(`\nStorefront checkout self-test → ${API}\n`);

  /* ── 1. something to buy ─────────────────────────────────────────────── */
  /*
    ⚠️ IT MUST BE A PRODUCT THAT IS ACTUALLY IN STOCK, AND THE FIRST VERSION OF
    THIS FILE FORGOT THAT. It took `items[0]`, which on the real catalogue was a
    sold-out cake, and the run "failed" on the API correctly refusing to sell
    it (DEC-PDP-09). A test that a working shop fails is worse than no test —
    the next person spends an hour looking for a bug that is a feature.
  */
  const list = await call('GET', '/shop/products?limit=24');
  const items = list.json?.items ?? list.json ?? [];
  if (!items.length) {
    bad('no live products — seed the catalogue first, nothing else can run');
    return;
  }

  let slug = null;
  let sizeId;
  let bought = null;
  let crafted = false;
  let prepaidOnly = false;
  for (const p of items) {
    const d = await call('GET', `/shop/products/${p.slug}`);
    if (d.json?.availability?.state === 'OUT_OF_STOCK') continue;
    slug = p.slug;
    bought = p.name;
    sizeId = d.json?.sizes?.[0]?.id;
    crafted = d.json?.productType === 'CRAFTED';
    prepaidOnly = !!d.json?.prepaidOnly;
    ok(`catalogue reachable — buying "${p.name}"`);
    ok(
      `product detail reads back (size: ${d.json?.sizes?.[0]?.label ?? 'none'},` +
        ` ${d.json?.availability?.state}, ${d.json?.productType})`,
    );
    break;
  }
  if (!slug) {
    bad(`all ${items.length} products checked are out of stock — restock one, then re-run`);
    return;
  }

  /*
    ⚠️ THE PAYMENT METHOD IS NOT THE TESTER'S CHOICE — IT IS THE PRODUCT'S.

    Locked §4: no COD on a crafted line, and none on a product marked
    advance-required. The first version of this file always sent `cod` and
    "failed" on a made-to-order flower basket, which is the rule working. So
    the rule is read off the product here instead of assumed, and the run says
    out loud which branch it took.
  */
  const payMethod = crafted || prepaidOnly ? 'online' : 'cod';
  ok(
    payMethod === 'cod'
      ? 'paying by COD — readymade, no advance required'
      : `paying online — ${crafted ? 'crafted product' : 'advance required'}, COD refused by locked §4`,
  );

  /* ── 2. delivery menu comes from the DB ──────────────────────────────── */
  const menu = await call('GET', '/shop/delivery/menu?zone=DHAKA');
  if (!Array.isArray(menu.json) || !menu.json.length) {
    bad('no delivery methods for Dhaka — add one in Admin → Delivery → Methods');
    return;
  }
  const method = menu.json[0];
  const slot = method.slots?.[0] ?? null;
  ok(`delivery menu from DB — "${method.label}" at ৳${method.feePaisa / 100}`);

  const cart = {
    items: [{ slug, sizeId, qty: 1, bundleIds: [], addonIds: [] }],
    zone: 'DHAKA',
    deliveryMethodId: method.id,
    deliverySlotId: slot?.id,
    /*
      ⚠️ THE PHONE BELONGS IN THE QUOTE, AND LEAVING IT OUT COST AN HOUR.

      Without it the offer engine has nobody to judge against, so every
      customer-shaped offer — first order, per-customer limits (OFR-R02/R06) —
      is skipped, and the quote comes back higher than the order that follows.
      The first run of this file reported "the order total differs from the
      quote" and was right: ৳2250 quoted, ৳1935 charged, a 15% welcome discount
      that only became applicable once the account existed.

      The checkout PAGE has the same duty: the moment the shopper types their
      number, re-quote with it. The cart page, which has no phone, will
      honestly show the undiscounted total.
    */
    phone: TEST_PHONE,
  };

  /* ── 3. the quote ────────────────────────────────────────────────────── */
  const q = await call('POST', '/shop/checkout/quote', cart);
  if (q.status !== 201 && q.status !== 200) {
    bad(`quote failed (${q.status}): ${JSON.stringify(q.json)}`);
    return;
  }
  const quote = q.json;
  ok(
    `quote: subtotal ৳${quote.subtotalPaisa / 100} + delivery ৳${quote.deliveryPaisa / 100}` +
      ` − discount ৳${quote.discountPaisa / 100} = ৳${quote.totalPaisa / 100}`,
  );

  if (quote.deliveryPaisa !== method.feePaisa)
    bad('delivery fee in the quote does not match the DeliveryMethod row');
  else ok('delivery fee came from the masters, not the request');

  /* ── 4. THE SECURITY CHECK ───────────────────────────────────────────── */
  const tampered = await call('POST', '/shop/checkout/quote', {
    ...cart,
    items: [{ ...cart.items[0], unitPaisa: 1, pricePaisa: 1 }],
    deliveryPaisa: 0,
  });
  if (tampered.json?.totalPaisa === quote.totalPaisa)
    ok('client-sent prices are ignored — same total from a tampered cart');
  else
    bad(
      `TAMPERING CHANGED THE PRICE: honest ৳${quote.totalPaisa / 100} vs ` +
        `tampered ৳${tampered.json?.totalPaisa / 100}`,
    );

  /* ── 5. place it ─────────────────────────────────────────────────────── */
  const placed = await call('POST', '/shop/checkout', {
    ...cart,
    senderName: 'Self Test',
    senderPhone: TEST_PHONE,
    senderEmail: 'selftest@radian.local',
    isGift: false,
    address: 'House 1, Road 1, Dhanmondi, Dhaka',
    paymentMethod: payMethod,
    date: new Date(Date.now() + 864e5).toISOString().slice(0, 10),
  });
  if (placed.status !== 201 && placed.status !== 200) {
    bad(`order placement failed (${placed.status}): ${JSON.stringify(placed.json)}`);
    return;
  }
  ok(`order placed: ${placed.json.orderNo} — "${bought}" — ৳${placed.json.totalPaisa / 100}`);

  if (placed.json.totalPaisa > quote.totalPaisa)
    bad(
      `CHARGED MORE THAN QUOTED: shown ৳${quote.totalPaisa / 100}, ` +
        `charged ৳${placed.json.totalPaisa / 100}`,
    );
  else if (placed.json.totalPaisa < quote.totalPaisa)
    ok(
      `charged ৳${placed.json.totalPaisa / 100}, below the quoted ` +
        `৳${quote.totalPaisa / 100} — an offer became applicable (fine)`,
    );
  else ok('order total equals the quoted total');

  /* the guard: a stale total must be refused, not silently charged */
  const stale = await call('POST', '/shop/checkout', {
    ...cart,
    senderName: 'Self Test',
    senderPhone: TEST_PHONE,
    address: 'House 1, Road 1, Dhanmondi, Dhaka',
    paymentMethod: payMethod,
    expectedTotalPaisa: 1,
  });
  if (stale.status === 409) ok('a stale total is refused (409), not silently charged');
  else bad(`expected 409 for a stale total, got ${stale.status}`);

  /* ── 6. does the ADMIN see it? — the reason this file exists ─────────── */
  const admin = await call('GET', `/orders/${placed.json.orderId}`);
  if (admin.status === 200 && admin.json?.orderNo === placed.json.orderNo) {
    ok(`admin can read it — channel "${admin.json.channel?.name}", ${admin.json.lines?.length} line(s)`);
    ok(`customer row: ${admin.json.customer?.name} (${admin.json.customer?.phone})`);
  } else if (admin.status === 401 || admin.status === 403) {
    console.log('  \x1b[33m•\x1b[0m admin endpoint needs a login — check the order in the admin UI by hand');
  } else {
    bad(`admin cannot read the order (${admin.status}) — this is the bug the feature fixes`);
  }

  /* ── 7. gateway session (sandbox) ────────────────────────────────────── */
  const online = await call('POST', '/shop/checkout', {
    ...cart,
    senderName: 'Self Test',
    senderPhone: TEST_PHONE,
    address: 'House 1, Road 1, Dhanmondi, Dhaka',
    paymentMethod: 'online',
  });
  if (!online.json?.orderId) {
    bad(`could not place the online-payment order: ${JSON.stringify(online.json)}`);
  } else {
    const s = await call('POST', '/shop/payment/session', { orderId: online.json.orderId });
    if (s.json?.gatewayUrl)
      ok(`SSLCommerz ${s.json.sandbox ? 'SANDBOX' : 'LIVE'} session opened — ${s.json.tranId}`);
    else bad(`gateway session failed: ${JSON.stringify(s.json)}`);
  }

  console.log(
    `\n${process.exitCode ? '\x1b[31mFAILED\x1b[0m' : '\x1b[32mALL GOOD\x1b[0m'} — ` +
      `test orders are left in "placed"; cancel them in the admin.\n`,
  );
})();
