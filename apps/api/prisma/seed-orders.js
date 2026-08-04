/* eslint-disable */
/**
 * Demo orders — one per lifecycle stage, so every Orders screen can be tested
 * without waiting for real traffic.
 *
 * Run (inside the container, where the DB and the Prisma client live):
 *   docker compose exec api node prisma/seed-orders.js
 *
 * Safe to re-run: it deletes its own rows first (orderNo starting "RAD-D").
 * Demo rows are written straight to the DB, so they carry hand-written
 * timeline events instead of ones produced by the real state machine.
 */
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const DAY = 86_400_000;
const HOUR = 3_600_000;
const now = Date.now();
const at = (ms) => new Date(now - ms);
const iso = (msAhead) => new Date(now + msAhead).toISOString().slice(0, 10);

const CHANNELS = [
  { slug: 'website', name: 'Website' },
  { slug: 'whatsapp', name: 'WhatsApp' },
  { slug: 'facebook', name: 'Facebook' },
  { slug: 'phone', name: 'Phone' },
  { slug: 'shop', name: 'Shop' },
];

async function main() {
  /* ---- masters ---- */
  const channels = {};
  for (const c of CHANNELS) {
    channels[c.slug] =
      (await db.channel.findFirst({ where: { slug: c.slug } })) ||
      (await db.channel.create({ data: { slug: c.slug, name: c.name } }));
  }

  let customers = await db.customer.findMany({ where: { deletedAt: null }, take: 5 });
  if (customers.length === 0) {
    customers = [
      await db.customer.create({ data: { name: 'Nusrat Jahan', phone: '+8801712345678', email: 'nusrat@example.com', country: 'Bangladesh', whatsappVerified: true } }),
      await db.customer.create({ data: { name: 'Farhana Rahman', phone: '+14155550142', email: 'farhana@example.com', country: 'United States', whatsappVerified: true } }),
    ];
  }
  const cust = (i) => customers[i % customers.length];

  let products = await db.product.findMany({ where: { deletedAt: null }, take: 8 });
  if (products.length === 0) {
    // DB has no master data (e.g. after a reset) — bootstrap a few demo products so the
    // order/return demo is self-contained. Category is required on Product; itemId is
    // optional (DEC-ITM-002) so these carry no Item — inventory restock simply skips
    // them, which the return flow handles fail-soft.
    let cat = await db.category.findFirst({ where: { deletedAt: null } });
    if (!cat) cat = await db.category.create({ data: { slug: 'demo-gifts', name: 'Demo Gifts' } });
    const demoProducts = [
      { slug: 'demo-red-roses', name: 'Red Roses Bouquet', productType: 'READYMADE', zone: 'DHAKA', natureType: 'FRESH', sellingPricePaisa: 180000, costPaisa: 90000 },
      { slug: 'demo-orchid-box', name: 'Orchid Gift Box', productType: 'READYMADE', zone: 'NATIONWIDE', natureType: 'FRESH', sellingPricePaisa: 250000, costPaisa: 140000 },
      { slug: 'demo-custom-cake', name: 'Custom Chocolate Cake', productType: 'CRAFTED', zone: 'DHAKA', natureType: 'ARTIFICIAL', sellingPricePaisa: 320000, costPaisa: 180000 },
      { slug: 'demo-mixed-basket', name: 'Mixed Flower Basket', productType: 'CRAFTED', zone: 'DHAKA', natureType: 'FRESH', sellingPricePaisa: 210000, costPaisa: 120000 },
    ];
    for (const p of demoProducts) {
      await db.product.create({ data: { ...p, categoryId: cat.id, isPublished: true } });
    }
    products = await db.product.findMany({ where: { deletedAt: null }, take: 8 });
    console.log(`bootstrapped ${products.length} demo products (DB was empty)`);
  }
  const prod = (i) => products[i % products.length];
  const price = (p) => p.offerPricePaisa ?? p.sellingPricePaisa ?? 100000;

  /* ---- clean previous demo rows ---- */
  const old = await db.order.findMany({ where: { orderNo: { startsWith: 'RAD-D' } }, select: { id: true } });
  const oldIds = old.map((o) => o.id);
  if (oldIds.length) {
    await db.paymentTransaction.deleteMany({ where: { orderId: { in: oldIds } } });
    await db.orderPhoto.deleteMany({ where: { orderId: { in: oldIds } } });
    await db.orderLine.deleteMany({ where: { orderId: { in: oldIds } } });
    await db.activityEvent.deleteMany({ where: { entityType: 'Order', entityId: { in: oldIds } } });
    await db.auditLog.deleteMany({ where: { entityType: 'Order', entityId: { in: oldIds } } });
    await db.order.deleteMany({ where: { id: { in: oldIds } } });
    console.log(`removed ${oldIds.length} old demo order(s)`);
  }

  /* ---- one demo order ---- */
  let seq = 0;
  async function makeOrder(spec) {
    seq += 1;
    const orderNo = `RAD-D${String(seq).padStart(3, '0')}`;
    const c = spec.customer;
    const lineSpecs = spec.lines.map(({ i, qty }) => {
      const p = prod(i);
      const unit = price(p);
      return { product: p, qty, unitPaisa: unit, linePaisa: unit * qty };
    });
    const subtotal = lineSpecs.reduce((s, l) => s + l.linePaisa, 0);
    const delivery = spec.deliveryPaisa ?? 8000;
    const total = subtotal - (spec.discountPaisa ?? 0) + delivery + (spec.adjustmentPaisa ?? 0);
    const paid = spec.paidPaisa ?? 0;
    const refund = spec.refundPaisa ?? 0;
    const due = Math.max(0, total - paid);

    const order = await db.order.create({
      data: {
        orderNo,
        placedAt: at(spec.agoMs ?? 2 * HOUR),
        channelId: channels[spec.channel].id,
        customerId: c.id,
        senderName: c.name,
        senderPhone: c.phone,
        senderEmail: c.email ?? null,
        isGift: !!spec.gift,
        recipientName: spec.gift ? spec.gift.name : null,
        recipientPhone: spec.gift ? spec.gift.phone : null,
        giftMessage: spec.gift ? spec.gift.message : null,
        salesStatus: spec.salesStatus,
        deliveryStatus: spec.deliveryStatus,
        zone: spec.zone ?? 'DHAKA',
        address: spec.address,
        deliveryNotes: spec.deliveryNotes ?? null,
        methodLabel: spec.methodLabel ?? 'Same Day',
        date: spec.date ?? null,
        slotLabel: spec.slotLabel ?? null,
        etaLabel: spec.etaLabel ?? null,
        courierName: spec.courier?.name ?? null,
        courierConsignment: spec.courier?.consignment ?? null,
        courierTrackingUrl: spec.courier?.url ?? null,
        courierAssignedAt: spec.courier ? at(spec.agoMs ?? HOUR) : null,
        paymentMethod: spec.paymentMethod,
        paymentStatus: spec.paymentStatus,
        paidPaisa: paid,
        duePaisa: due,
        refundPaisa: refund,
        subtotalPaisa: subtotal,
        discountPaisa: spec.discountPaisa ?? 0,
        deliveryPaisa: delivery,
        adjustmentPaisa: spec.adjustmentPaisa ?? 0,
        totalPaisa: total,
        internalNote: spec.internalNote ?? null,
        lines: {
          create: lineSpecs.map((l, idx) => ({
            productId: l.product.id,
            name: l.product.name,
            productType: l.product.productType,
            qty: l.qty,
            unitPaisa: l.unitPaisa,
            linePaisa: l.linePaisa,
            discountPaisa: 0,
            refundPaisa: spec.lineRefunds ? (spec.lineRefunds[idx] ?? null) : null,
            refundNote: spec.lineRefundNotes ? (spec.lineRefundNotes[idx] ?? null) : null,
            addonLabels: [],
          })),
        },
      },
    });

    for (const t of spec.txns ?? []) {
      await db.paymentTransaction.create({
        data: { orderId: order.id, kind: t.kind, method: spec.paymentMethod, amountPaisa: t.amount, note: t.note ?? null, actorName: t.by ?? 'Admin' },
      });
    }
    for (const ph of spec.photos ?? []) {
      await db.orderPhoto.create({
        data: { orderId: order.id, kind: ph.kind, bg: ph.bg, caption: ph.caption, capturedBy: ph.by, capturedAt: at(ph.agoMs ?? HOUR) },
      });
    }
    for (const e of spec.events ?? []) {
      await db.activityEvent.create({
        data: { entityType: 'Order', entityId: order.id, kind: e.kind, label: e.label, actorName: e.by ?? 'System', note: e.note ?? null, createdAt: at(e.agoMs ?? HOUR) },
      });
    }
    console.log(`  ${orderNo}  ${spec.salesStatus}/${spec.deliveryStatus}  ${spec.label}`);
    return order;
  }

  const G = { bgA: 'linear-gradient(160deg,#F1E6F8,#DFC8F0)', bgB: 'linear-gradient(160deg,#EFE7DE,#D9C7B4)' };
  console.log('creating demo orders…');

  /* 1 — needs action · online but never paid (also shows on Recovery) */
  await makeOrder({
    label: 'placed · online unpaid (recovery)', customer: cust(0), channel: 'website',
    salesStatus: 'placed', deliveryStatus: 'unassigned', paymentMethod: 'online', paymentStatus: 'unpaid',
    address: 'House 42, Road 11, Banani, Dhaka 1213', methodLabel: 'Same Day', slotLabel: '3 PM – 6 PM', etaLabel: 'Today, 3 PM – 6 PM',
    agoMs: 40 * 60_000, lines: [{ i: 0, qty: 1 }],
    events: [{ kind: 'sales', label: 'Order placed on website — payment not completed', agoMs: 40 * 60_000 }],
  });

  /* 2 — needs action · COD, call to confirm */
  await makeOrder({
    label: 'placed · COD (call first)', customer: cust(1), channel: 'phone',
    salesStatus: 'placed', deliveryStatus: 'unassigned', paymentMethod: 'cod', paymentStatus: 'unpaid',
    address: 'House 7, Road 5, Uttara Sector 4, Dhaka 1230', methodLabel: 'Schedule It', date: iso(DAY), slotLabel: '10 AM – 1 PM', etaLabel: 'Tomorrow, 10 AM – 1 PM',
    agoMs: 2 * HOUR, lines: [{ i: 1, qty: 1 }, { i: 2, qty: 1 }],
    events: [{ kind: 'sales', label: 'Order taken over the phone', by: 'Rima (CS)', agoMs: 2 * HOUR }],
  });

  /* 3 — needs action · paid, just verify */
  await makeOrder({
    label: 'placed · paid (verify)', customer: cust(2), channel: 'facebook',
    salesStatus: 'placed', deliveryStatus: 'unassigned', paymentMethod: 'online', paymentStatus: 'paid',
    address: 'Flat 5B, House 30, Dhanmondi 27, Dhaka 1209', methodLabel: '2-Hour Express', deliveryPaisa: 15000, etaLabel: 'Within 2 hours',
    agoMs: 90 * 60_000, lines: [{ i: 3, qty: 1 }],
    events: [
      { kind: 'sales', label: 'Order placed via Facebook', agoMs: 90 * 60_000 },
      { kind: 'payment', label: 'Online payment received', by: 'SSLCommerz', agoMs: 88 * 60_000 },
    ],
  });

  /* 4 — confirmed, waiting for the kitchen */
  await makeOrder({
    label: 'confirmed · ready to prepare', customer: cust(0), channel: 'website',
    salesStatus: 'confirmed', deliveryStatus: 'unassigned', paymentMethod: 'online', paymentStatus: 'paid',
    address: 'House 12, Road 8, Gulshan 1, Dhaka 1212', methodLabel: 'Same Day', slotLabel: '6 PM – 9 PM', etaLabel: 'Today, 6 PM – 9 PM',
    agoMs: 4 * HOUR, lines: [{ i: 4, qty: 2 }],
    events: [
      { kind: 'sales', label: 'Order placed on website', agoMs: 4 * HOUR },
      { kind: 'sales', label: 'Order confirmed', by: 'Rima (CS)', agoMs: 3.5 * HOUR },
    ],
  });

  /* 5 — preparing (stock committed) + prep photo */
  await makeOrder({
    label: 'preparing · stock committed', customer: cust(1), channel: 'whatsapp',
    salesStatus: 'confirmed', deliveryStatus: 'preparing', paymentMethod: 'online', paymentStatus: 'paid',
    address: 'Road 5, Mirpur DOHS, Dhaka 1216', methodLabel: 'Midnight Surprise', date: iso(0), slotLabel: '12:00 AM sharp', etaLabel: 'Tonight, 12:00 AM',
    deliveryPaisa: 26000, agoMs: 6 * HOUR,
    gift: { name: 'Tania Akter', phone: '+8801811223344', message: 'Happy Anniversary, my love.' },
    lines: [{ i: 5, qty: 1 }],
    photos: [{ kind: 'PREP', bg: G.bgA, caption: 'Bouquet ready before dispatch', by: 'Kitchen · Shila', agoMs: HOUR }],
    internalNote: 'Anniversary — handwritten card, no invoice inside.',
    events: [
      { kind: 'sales', label: 'Order placed via WhatsApp', agoMs: 6 * HOUR },
      { kind: 'sales', label: 'Order confirmed', by: 'Rima (CS)', agoMs: 5.5 * HOUR },
      { kind: 'delivery', label: 'Preparing — stock −1 (DEC-MOD-003)', by: 'Kitchen', agoMs: HOUR },
    ],
  });

  /* 6 — out for delivery + courier assigned (COD still to collect) */
  await makeOrder({
    label: 'out for delivery · courier + COD due', customer: cust(2), channel: 'website',
    salesStatus: 'confirmed', deliveryStatus: 'out_for_delivery', paymentMethod: 'cod', paymentStatus: 'unpaid',
    address: 'Ward 6, Zindabazar, Sylhet 3100', zone: 'BANGLADESH', methodLabel: 'Nationwide Courier', deliveryPaisa: 12000, etaLabel: 'In 1–3 days',
    agoMs: DAY, lines: [{ i: 6, qty: 1 }],
    courier: { name: 'Steadfast', consignment: 'SF-9384021', url: 'https://steadfast.com.bd/track/SF-9384021' },
    photos: [{ kind: 'PREP', bg: G.bgA, caption: 'Packed for courier', by: 'Warehouse · Jamal', agoMs: 20 * HOUR }],
    events: [
      { kind: 'sales', label: 'Order placed on website', agoMs: DAY },
      { kind: 'sales', label: 'Order confirmed', by: 'Rima (CS)', agoMs: 23 * HOUR },
      { kind: 'delivery', label: 'Preparing — stock −1 (DEC-MOD-003)', by: 'Warehouse', agoMs: 21 * HOUR },
      { kind: 'delivery', label: 'Courier assigned — Steadfast (SF-9384021)', by: 'Admin', agoMs: 20 * HOUR },
      { kind: 'delivery', label: 'Out for delivery', by: 'Courier', agoMs: 18 * HOUR },
    ],
  });

  /* 7 — completed · delivered · fully paid · both photos */
  await makeOrder({
    label: 'completed · delivered · paid', customer: cust(0), channel: 'website',
    salesStatus: 'completed', deliveryStatus: 'delivered', paymentMethod: 'online', paymentStatus: 'paid',
    address: 'House 19, Road 3, Mohammadpur, Dhaka 1207', methodLabel: '2-Hour Express', deliveryPaisa: 15000, etaLabel: 'Delivered in 2 hours',
    agoMs: 3 * DAY, lines: [{ i: 0, qty: 1 }, { i: 3, qty: 1 }],
    photos: [
      { kind: 'PREP', bg: G.bgA, caption: 'Arranged and checked', by: 'Kitchen · Rana', agoMs: 3 * DAY },
      { kind: 'DELIVERY', bg: G.bgB, caption: 'Handed over at the door', by: 'Rider · Sohel', agoMs: 3 * DAY - 2 * HOUR },
    ],
    events: [
      { kind: 'sales', label: 'Order placed on website', agoMs: 3 * DAY },
      { kind: 'payment', label: 'Online payment received', by: 'SSLCommerz', agoMs: 3 * DAY },
      { kind: 'sales', label: 'Order confirmed', by: 'Rima (CS)', agoMs: 3 * DAY },
      { kind: 'delivery', label: 'Preparing — stock −1', by: 'Kitchen', agoMs: 3 * DAY - HOUR },
      { kind: 'delivery', label: 'Delivered', by: 'Rider · Sohel', agoMs: 3 * DAY - 2 * HOUR },
      { kind: 'system', label: 'Sales completed — salesCount +1, Customer LTV updated', agoMs: 3 * DAY - 2 * HOUR },
    ],
  });

  /* 8 — completed · delivered · COD collected · courier */
  await makeOrder({
    label: 'completed · COD collected', customer: cust(1), channel: 'facebook',
    salesStatus: 'completed', deliveryStatus: 'delivered', paymentMethod: 'cod', paymentStatus: 'cod_collected',
    address: 'Nasirabad Housing Society, Chattogram 4000', zone: 'BANGLADESH', methodLabel: 'Nationwide Courier', deliveryPaisa: 12000, etaLabel: 'Delivered',
    agoMs: 8 * DAY, lines: [{ i: 2, qty: 2 }],
    gift: { name: 'Rafiul Islam', phone: '+8801933445566', message: 'Congratulations on the new home!' },
    courier: { name: 'SA Paribahan', consignment: 'SA-77120', url: 'https://saparibahan.com/track/SA-77120' },
    photos: [{ kind: 'DELIVERY', bg: G.bgB, caption: 'Delivered in Chattogram', by: 'Courier', agoMs: 7 * DAY }],
    events: [
      { kind: 'sales', label: 'Order placed via Facebook', agoMs: 8 * DAY },
      { kind: 'delivery', label: 'Courier assigned — SA Paribahan', by: 'Admin', agoMs: 7.5 * DAY },
      { kind: 'delivery', label: 'Delivered', by: 'Courier', agoMs: 7 * DAY },
      { kind: 'payment', label: 'COD collected', by: 'Courier', agoMs: 7 * DAY },
      { kind: 'system', label: 'Sales completed — Customer LTV updated', agoMs: 7 * DAY },
    ],
  });

  /* 9 — cancelled before preparing · full refund */
  await makeOrder({
    label: 'cancelled before prep · refunded', customer: cust(2), channel: 'website',
    salesStatus: 'cancelled', deliveryStatus: 'unassigned', paymentMethod: 'online', paymentStatus: 'refunded',
    address: 'House 8, Road 27, Dhanmondi, Dhaka 1209', methodLabel: 'Same Day', etaLabel: 'Cancelled',
    agoMs: 5 * DAY, lines: [{ i: 4, qty: 1 }],
    events: [
      { kind: 'sales', label: 'Order placed on website', agoMs: 5 * DAY },
      { kind: 'sales', label: 'Cancelled — customer changed their mind', by: 'Rima (CS)', agoMs: 5 * DAY - HOUR, note: 'Nothing was prepared, so stock was never committed.' },
      { kind: 'payment', label: 'Full refund issued', by: 'SSLCommerz', agoMs: 5 * DAY - HOUR },
    ],
  });

  /* 10 — cancelled after preparing · stock reverted · part refund (per-line) */
  await makeOrder({
    label: 'cancelled after prep · stock reverted · part refund', customer: cust(0), channel: 'whatsapp',
    salesStatus: 'cancelled', deliveryStatus: 'stock_reverted', paymentMethod: 'online', paymentStatus: 'partially_refunded',
    address: 'House 14, Sector 7, Uttara, Dhaka 1230', methodLabel: 'Same Day', etaLabel: 'Cancelled',
    agoMs: 6 * DAY, lines: [{ i: 1, qty: 1 }, { i: 5, qty: 1 }],
    lineRefunds: [null, 0],
    lineRefundNotes: [null, 'Crafted — advance forfeited, rest refunded'],
    events: [
      { kind: 'sales', label: 'Order placed via WhatsApp', agoMs: 6 * DAY },
      { kind: 'delivery', label: 'Preparing — stock −1', by: 'Kitchen', agoMs: 6 * DAY - HOUR },
      { kind: 'sales', label: 'Cancelled — customer request', by: 'Rima (CS)', agoMs: 6 * DAY - 2 * HOUR, note: 'Per-line refund: readymade in full, crafted keeps the advance.' },
      { kind: 'delivery', label: 'Stock reverted (readymade line only)', by: 'Kitchen', agoMs: 6 * DAY - 2 * HOUR },
      { kind: 'payment', label: 'Partial refund issued', by: 'SSLCommerz', agoMs: 6 * DAY - 2 * HOUR },
    ],
  });

  /* 11 — delivery failed (rider could not hand it over) */
  await makeOrder({
    label: 'delivery failed', customer: cust(1), channel: 'website',
    salesStatus: 'confirmed', deliveryStatus: 'failed', paymentMethod: 'cod', paymentStatus: 'unpaid',
    address: 'House 30, Road 4, Bashundhara R/A, Dhaka 1229', methodLabel: 'Same Day', slotLabel: '6 PM – 9 PM', etaLabel: 'Failed — retry',
    agoMs: 2 * DAY, lines: [{ i: 6, qty: 1 }],
    events: [
      { kind: 'sales', label: 'Order placed on website', agoMs: 2 * DAY },
      { kind: 'delivery', label: 'Out for delivery', by: 'Rider · Sohel', agoMs: 2 * DAY - 3 * HOUR },
      { kind: 'delivery', label: 'Delivery failed — nobody answered the phone', by: 'Rider · Sohel', agoMs: 2 * DAY - 2 * HOUR, note: 'Retry tomorrow or return to shop.' },
    ],
  });

  /* 12 — scheduled gift for a future date (Scheduled screen) */
  await makeOrder({
    label: 'confirmed · scheduled gift (future)', customer: cust(2), channel: 'shop',
    salesStatus: 'confirmed', deliveryStatus: 'unassigned', paymentMethod: 'online', paymentStatus: 'advance_paid',
    address: 'House 22, Road 12, Banani, Dhaka 1213', methodLabel: 'Schedule It', date: iso(2 * DAY), slotLabel: '10 AM – 1 PM', etaLabel: 'In 2 days, 10 AM – 1 PM',
    agoMs: 12 * HOUR, lines: [{ i: 7, qty: 1 }],
    gift: { name: 'Meem', phone: '+8801611000292', message: 'Happy Birthday! 🌸' },
    txns: [{ kind: 'ADVANCE', amount: 50000, note: 'Advance taken at the shop', by: 'Counter' }],
    internalNote: 'Ordered at the counter, delivered later — channel = Shop, not POS.',
    events: [
      { kind: 'sales', label: 'Order taken at the shop counter', by: 'Counter', agoMs: 12 * HOUR },
      { kind: 'payment', label: 'Advance received — cash', by: 'Counter', agoMs: 12 * HOUR },
      { kind: 'sales', label: 'Order confirmed', by: 'Rima (CS)', agoMs: 11 * HOUR },
    ],
  });

  /* money fix-up — paid/due recomputed from the real transactions */
  const demo = await db.order.findMany({ where: { orderNo: { startsWith: 'RAD-D' } }, include: { transactions: true } });
  for (const o of demo) {
    const paidFromTxn = o.transactions.filter((t) => t.kind !== 'REFUND').reduce((s, t) => s + t.amountPaisa, 0);
    let paid = paidFromTxn;
    let refund = o.refundPaisa;
    // statuses that mean the money is in
    if (o.paymentStatus === 'paid' || o.paymentStatus === 'cod_collected') paid = o.totalPaisa;
    if (o.paymentStatus === 'refunded') { paid = o.totalPaisa; refund = o.totalPaisa; }
    if (o.paymentStatus === 'partially_refunded') { paid = o.totalPaisa; refund = Math.round(o.totalPaisa * 0.7); }
    const due = Math.max(0, o.totalPaisa - paid);
    await db.order.update({ where: { id: o.id }, data: { paidPaisa: paid, duePaisa: due, refundPaisa: refund } });
  }

  console.log(`\n✔ ${demo.length} demo orders ready — open /orders in the admin.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
