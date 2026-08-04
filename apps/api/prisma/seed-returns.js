/* eslint-disable */
/**
 * Demo Returns & Refunds — one per lifecycle stage, so every Returns screen can be
 * experienced without hand-creating each. Mirrors seed-orders.js style.
 *
 * Run (inside the container, where the DB and the Prisma client live):
 *   docker compose exec api node prisma/seed-returns.js
 *
 * Needs delivered orders to attach to — run prisma/seed-orders.js first if the
 * Returns list comes up empty (RAD-D007 / RAD-D008 are delivered).
 *
 * Safe to re-run: it removes its own rows first (returnNo starting "RTN-D") AND
 * reverses the demo money it posted (refund txns + store credit), so order
 * balances stay correct. Demo rows are written straight to the DB with
 * hand-written timeline events (not the real state machine).
 */
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const now = Date.now();
const at = (msAgo) => new Date(now - msAgo);
const HOUR = 3_600_000;
const DAY = 86_400_000;

const REASONS = [
  { code: 'RSN_DAMAGED_ON_ARRIVAL', label: 'Damaged on arrival', requiresApproval: true, defaultRefundMethod: 'ORIGINAL', sortOrder: 1 },
  { code: 'RSN_WRONG_ITEM_SENT', label: 'Wrong item sent', requiresApproval: false, defaultRefundMethod: 'ORIGINAL', sortOrder: 2 },
  { code: 'RSN_QUALITY_ISSUE', label: 'Quality issue', requiresApproval: true, defaultRefundMethod: 'BKASH', sortOrder: 3 },
  { code: 'RSN_CHANGED_MIND', label: 'Changed mind', requiresApproval: false, defaultRefundMethod: 'STORE_CREDIT', sortOrder: 4 },
  { code: 'RSN_LATE_DELIVERY', label: 'Late delivery', requiresApproval: false, defaultRefundMethod: 'ORIGINAL', sortOrder: 5 },
];

async function ev(returnId, kind, label, actorName, msAgo) {
  await db.activityEvent.create({
    data: { entityType: 'SalesReturn', entityId: returnId, kind, label, actorName, createdAt: at(msAgo) },
  });
}

async function cleanup() {
  const mine = await db.salesReturn.findMany({
    where: { returnNo: { startsWith: 'RTN-D' } },
    select: { id: true },
  });
  const ids = mine.map((r) => r.id);
  if (ids.length) {
    // reverse the demo cash refunds we posted onto orders
    const txns = await db.paymentTransaction.findMany({
      where: { note: { startsWith: 'Return RTN-D' } },
      select: { id: true, orderId: true, amountPaisa: true },
    });
    for (const t of txns) {
      const o = await db.order.findFirst({ where: { id: t.orderId }, select: { paidPaisa: true, refundPaisa: true, paymentMethod: true, totalPaisa: true } });
      if (o) {
        const newRefund = Math.max(0, o.refundPaisa - t.amountPaisa);
        await db.order.update({
          where: { id: t.orderId },
          data: {
            refundPaisa: newRefund,
            paymentStatus: newRefund <= 0 ? (o.paidPaisa >= o.totalPaisa && o.totalPaisa > 0 ? 'paid' : 'advance_paid') : 'partially_refunded',
          },
        });
      }
    }
    await db.paymentTransaction.deleteMany({ where: { note: { startsWith: 'Return RTN-D' } } });
    await db.customerCredit.deleteMany({ where: { refType: 'RETURN', note: { startsWith: 'Return RTN-D' } } });
    await db.activityEvent.deleteMany({ where: { entityType: 'SalesReturn', entityId: { in: ids } } });
    await db.auditLog.deleteMany({ where: { entityType: 'SalesReturn', entityId: { in: ids } } });
    await db.salesReturnLine.deleteMany({ where: { returnId: { in: ids } } });
    await db.salesReturn.deleteMany({ where: { id: { in: ids } } });
  }
}

async function main() {
  /* ---- reasons (idempotent by code) ---- */
  const reasonByCode = {};
  for (const r of REASONS) {
    let row = await db.returnReason.findFirst({ where: { code: r.code } });
    if (!row) row = await db.returnReason.create({ data: r });
    reasonByCode[r.code] = row;
  }

  /* ---- settings ---- */
  const existing = await db.returnSetting.findFirst({ where: { id: 'singleton' } });
  if (!existing) {
    await db.returnSetting.create({
      data: { id: 'singleton', returnWindowDays: 7, approvalThresholdPaisa: 300000, restockDefaultPerishable: true },
    });
  }

  /* ---- clean our own demo rows first ---- */
  await cleanup();

  /* ---- find delivered orders to attach to ---- */
  const delivered = await db.order.findMany({
    where: { deliveryStatus: 'delivered', deletedAt: null },
    include: { lines: { where: { deletedAt: null } }, customer: true },
    orderBy: { placedAt: 'desc' },
    take: 12,
  });
  const usable = delivered.filter((o) => o.lines.length > 0);
  if (usable.length === 0) {
    console.error('No delivered orders with lines found. Run prisma/seed-orders.js first (RAD-D007/D008 are delivered), then re-run this.');
    return;
  }
  const paidUsable = usable.filter((o) => o.paidPaisa > 0);

  const unitNet = (l) => (l.qty > 0 ? Math.round((l.linePaisa - l.discountPaisa) / l.qty) : l.unitPaisa);

  let seq = 0;
  const madeSummary = [];
  const nextNo = () => `RTN-D${String(++seq).padStart(3, '0')}`;

  // pick an order + its first line; qtyReturn defaults to 1
  const pick = (pool, i) => {
    const o = pool[i % pool.length];
    const line = o.lines[0];
    return { o, line, value: unitNet(line) };
  };

  /* ---------- 1) pending_approval — Damaged, crafted-style, REFUND (no money yet) ---------- */
  {
    const { o, line, value } = pick(usable, 0);
    const reason = reasonByCode.RSN_DAMAGED_ON_ARRIVAL;
    const no = nextNo();
    const ret = await db.salesReturn.create({
      data: {
        returnNo: no, orderId: o.id, customerId: o.customerId,
        reasonId: reason.id, reasonNote: 'Petals crushed on arrival',
        resolution: 'REFUND', status: 'pending_approval',
        returnValuePaisa: value, refundPaisa: 0, storeCreditPaisa: 0, compensationPaisa: 0,
        refundMethod: reason.defaultRefundMethod, actorName: 'CS · Rima', createdAt: at(2 * HOUR),
        note: 'Awaiting supervisor sign-off',
        lines: { create: [{ orderLineId: line.id, productId: line.productId, name: line.name, qty: 1, unitPaisa: value, valuePaisa: value, restockAction: 'WRITE_OFF' }] },
      },
    });
    await ev(ret.id, 'sales', `Return ${no} opened for ${o.orderNo} — REFUND (needs approval)`, 'CS · Rima', 2 * HOUR);
    madeSummary.push(`${no} · pending approval · ${o.orderNo}`);
  }

  /* ---------- 2) approved — Wrong item, REFUND, ready to complete ---------- */
  {
    const { o, line, value } = pick(usable, 1);
    const reason = reasonByCode.RSN_WRONG_ITEM_SENT;
    const no = nextNo();
    const ret = await db.salesReturn.create({
      data: {
        returnNo: no, orderId: o.id, customerId: o.customerId,
        reasonId: reason.id, reasonNote: 'Sent pink, ordered white',
        resolution: 'REFUND', status: 'approved', approvedBy: 'Manager · Sabbir', approvedAt: at(20 * HOUR),
        returnValuePaisa: value, refundPaisa: 0, storeCreditPaisa: 0, compensationPaisa: 0,
        refundMethod: reason.defaultRefundMethod, actorName: 'CS · Rima', createdAt: at(22 * HOUR),
        lines: { create: [{ orderLineId: line.id, productId: line.productId, name: line.name, qty: 1, unitPaisa: value, valuePaisa: value, restockAction: 'RESTOCK' }] },
      },
    });
    await ev(ret.id, 'sales', `Return ${no} opened for ${o.orderNo} — REFUND`, 'CS · Rima', 22 * HOUR);
    await ev(ret.id, 'sales', `Return approved`, 'Manager · Sabbir', 20 * HOUR);
    madeSummary.push(`${no} · approved (ready to complete) · ${o.orderNo}`);
  }

  /* ---------- 3) completed — cash refund posted onto the order ---------- */
  {
    const pool = paidUsable.length ? paidUsable : usable;
    const { o, line, value } = pick(pool, 0);
    const reason = reasonByCode.RSN_QUALITY_ISSUE;
    const no = nextNo();
    const cap = Math.max(0, o.paidPaisa - o.refundPaisa);
    const refund = Math.min(value, cap);
    const ret = await db.salesReturn.create({
      data: {
        returnNo: no, orderId: o.id, customerId: o.customerId,
        reasonId: reason.id, reasonNote: 'Flowers wilted next day',
        resolution: 'REFUND', status: 'completed', approvedBy: 'Manager · Sabbir', approvedAt: at(3 * DAY),
        returnValuePaisa: value, refundPaisa: refund, storeCreditPaisa: 0, compensationPaisa: 0,
        refundMethod: 'BKASH', refundReference: 'BKASH-DEMO-8842', actorName: 'CS · Nabil', createdAt: at(3 * DAY + HOUR),
        lines: { create: [{ orderLineId: line.id, productId: line.productId, name: line.name, qty: 1, unitPaisa: value, valuePaisa: value, restockAction: 'WRITE_OFF' }] },
      },
    });
    if (refund > 0) {
      await db.paymentTransaction.create({
        data: { orderId: o.id, kind: 'REFUND', method: 'bkash', amountPaisa: refund, note: `Return ${no}`, actorName: 'CS · Nabil', createdAt: at(3 * DAY) },
      });
      const newRefund = o.refundPaisa + refund;
      await db.order.update({
        where: { id: o.id },
        data: { refundPaisa: newRefund, paymentStatus: newRefund >= o.paidPaisa && o.paidPaisa > 0 ? 'refunded' : 'partially_refunded' },
      });
    }
    await ev(ret.id, 'sales', `Return ${no} opened for ${o.orderNo} — REFUND (needs approval)`, 'CS · Nabil', 3 * DAY + HOUR);
    await ev(ret.id, 'sales', `Return approved`, 'Manager · Sabbir', 3 * DAY);
    await ev(ret.id, 'payment', refund > 0 ? `Refunded ${refund} paisa via BKASH` : `No money in hand to refund`, 'CS · Nabil', 3 * DAY);
    await ev(ret.id, 'sales', `Return ${no} completed`, 'CS · Nabil', 3 * DAY);
    madeSummary.push(`${no} · completed · refunded ${(refund / 100).toFixed(0)}৳ · ${o.orderNo}`);
  }

  /* ---------- 4) completed — store credit issued ---------- */
  {
    const pool = paidUsable.length ? paidUsable : usable;
    const { o, line, value } = pick(pool, 1);
    const reason = reasonByCode.RSN_CHANGED_MIND;
    const no = nextNo();
    const cap = Math.max(0, o.paidPaisa - o.refundPaisa);
    const credit = Math.min(value, cap || value); // credit even if COD demo, so the wallet shows something
    const ret = await db.salesReturn.create({
      data: {
        returnNo: no, orderId: o.id, customerId: o.customerId,
        reasonId: reason.id, reasonNote: 'Customer changed mind, kept nothing',
        resolution: 'STORE_CREDIT', status: 'completed', approvedBy: null, approvedAt: null,
        returnValuePaisa: value, refundPaisa: 0, storeCreditPaisa: credit, compensationPaisa: 0,
        refundMethod: 'STORE_CREDIT', actorName: 'CS · Rima', createdAt: at(5 * DAY),
        lines: { create: [{ orderLineId: line.id, productId: line.productId, name: line.name, qty: 1, unitPaisa: value, valuePaisa: value, restockAction: 'RESTOCK' }] },
      },
    });
    await db.customerCredit.create({
      data: { customerId: o.customerId, kind: 'ISSUED', amountPaisa: credit, refType: 'RETURN', refId: ret.id, note: `Return ${no}`, actorName: 'CS · Rima', createdAt: at(5 * DAY) },
    });
    await ev(ret.id, 'sales', `Return ${no} opened for ${o.orderNo} — STORE_CREDIT`, 'CS · Rima', 5 * DAY);
    await ev(ret.id, 'payment', `Issued ${credit} paisa store credit`, 'CS · Rima', 5 * DAY);
    await ev(ret.id, 'sales', `Return ${no} completed`, 'CS · Rima', 5 * DAY);
    madeSummary.push(`${no} · completed · store credit ${(credit / 100).toFixed(0)}৳ · ${o.orderNo}`);
  }

  console.log(`\n✔ ${REASONS.length} reasons + ${madeSummary.length} demo returns ready:`);
  for (const s of madeSummary) console.log('   • ' + s);
  console.log('\nOpen /returns in the admin (:3001) to experience it.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
