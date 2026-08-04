/*
  Radian — Pre-deploy check

  কী করে: ডেটাবেজে যা আছে তার মধ্যে **যেগুলো ইন্টারনেটে যাওয়া উচিত নয়**
  সেগুলো খুঁজে বের করে দেখায়। ইচ্ছে করলে নিরাপদ কয়েকটা নিজেই ঠিক করে।

  চালানো:
    node apps/api/scripts/pre-deploy-check.mjs          ← শুধু দেখাবে (নিরাপদ)
    node apps/api/scripts/pre-deploy-check.mjs --fix    ← নিরাপদগুলো ঠিক করবে

  ⚠️ ডিফল্ট সবসময় "শুধু দেখাও"। কোনো cleanup script-এর প্রথম কাজ মুছে ফেলা
     হওয়া উচিত নয় — আগে দেখা, তারপর সিদ্ধান্ত।

  ⚠️ --fix কখনো **হার্ড ডিলিট করে না**। Order/Product-এর `deletedAt` বসায়
     মাত্র, কারণ পুরো app ওটাই "মুছে গেছে" হিসেবে পড়ে, আর ভুল হলে একটা
     UPDATE-এ ফেরত আনা যায়। সত্যিকারের DELETE-এ order-এর lines, payment,
     return সব FK-এ আটকে যেত — এবং আটকে যাওয়াটাই সঠিক আচরণ。

  যা নিজে ঠিক করে না, শুধু জানায় (মানুষের সিদ্ধান্ত লাগে):
    • খারাপ category slug — নতুন নাম কী হবে সেটা ব্যবসার সিদ্ধান্ত
    • ডুপ্লিকেট occasion tag — কোনটা টিকবে, পণ্যগুলো কোথায় যাবে
    • ফাঁকা policy page — লেখাটা মালিককেই লিখতে হবে
*/

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const FIX = process.argv.includes('--fix');

let problems = 0;
let fixed = 0;

const B = (s) => `\x1b[1m${s}\x1b[0m`;
const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const YEL = (s) => `\x1b[33m${s}\x1b[0m`;
const GRN = (s) => `\x1b[32m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

function head(n, title) {
  console.log(`\n${B(`${n}. ${title}`)}`);
}

/*  Google-এ চলে গেলে বিব্রতকর — এগুলো ব্যক্তিগত/পরীক্ষামূলক নাম, দোকানের
    category নয়। তালিকাটা RADIAN_DEPLOY_GUIDE.md থেকে。  */
const BAD_CATEGORY_SLUGS = ['sobuj', 'radian', 'flower', 'demo-gifts', 'test', 'demo'];

/*  CMS-D02 — টাকা নেওয়ার আগে এই চারটে পাতা publish থাকতেই হবে。
    bKash/SSLCommerz merchant review-এ প্রথমেই এগুলো দেখে。  */
const REQUIRED_LEGAL = [
  'refund-policy',
  'privacy-policy',
  'terms-and-conditions',
  'shipping-policy',
];

async function main() {
  console.log(B('\n=== Radian - Pre-deploy check ==='));
  console.log(
    DIM(FIX ? 'mode: --fix  (safe fixes will be applied)' : 'mode: report only  (run with --fix to repair)'),
  );

  // ── ১. Regression-test order ────────────────────────────────────────────
  head(1, 'Regression-test orders');
  const testOrders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      OR: [
        { address: { contains: 'REGRESSION TEST', mode: 'insensitive' } },
        { senderName: { contains: 'REGRESSION TEST', mode: 'insensitive' } },
      ],
    },
    select: { id: true, orderNo: true, senderName: true, createdAt: true },
  });

  if (!testOrders.length) {
    console.log(GRN('   OK - none found'));
  } else {
    problems++;
    console.log(RED(`   FOUND ${testOrders.length}:`));
    for (const o of testOrders.slice(0, 10)) {
      console.log(`     ${o.orderNo} - ${o.senderName} (${o.createdAt.toISOString().slice(0, 10)})`);
    }
    if (testOrders.length > 10) console.log(DIM(`     ...and ${testOrders.length - 10} more`));

    if (FIX) {
      const r = await prisma.order.updateMany({
        where: { id: { in: testOrders.map((o) => o.id) } },
        data: { deletedAt: new Date() },
      });
      fixed += r.count;
      console.log(GRN(`   -> soft-deleted ${r.count}`));
    }
  }

  // ── ২. demo-* পণ্য ──────────────────────────────────────────────────────
  head(2, 'Demo products (slug starts with `demo-`)');
  const demoProducts = await prisma.product.findMany({
    where: { deletedAt: null, slug: { startsWith: 'demo-' } },
    select: { id: true, slug: true, name: true },
  });

  if (!demoProducts.length) {
    console.log(GRN('   OK - none found'));
  } else {
    problems++;
    console.log(RED(`   FOUND ${demoProducts.length}:`));
    for (const p of demoProducts.slice(0, 10)) console.log(`     ${p.slug} - ${p.name}`);
    if (demoProducts.length > 10) console.log(DIM(`     ...and ${demoProducts.length - 10} more`));

    if (FIX) {
      const r = await prisma.product.updateMany({
        where: { id: { in: demoProducts.map((p) => p.id) } },
        data: { deletedAt: new Date() },
      });
      fixed += r.count;
      console.log(GRN(`   -> soft-deleted ${r.count}`));
    }
  }

  // ── ৩. খারাপ category slug ──────────────────────────────────────────────
  head(3, 'Category slugs that must not reach Google');
  const badCats = await prisma.category.findMany({
    where: { deletedAt: null, slug: { in: BAD_CATEGORY_SLUGS } },
    select: { id: true, slug: true, name: true, isActive: true },
  });

  if (!badCats.length) {
    console.log(GRN('   OK - none found'));
  } else {
    problems++;
    console.log(RED(`   FOUND ${badCats.length}:`));
    for (const c of badCats) {
      console.log(`     /categories/${c.slug} - "${c.name}" ${c.isActive ? '(active)' : '(off)'}`);
    }
    /*  ইচ্ছে করে নিজে বদলাচ্ছি না。 নতুন slug কী হবে সেটা SEO ও ব্যবসার
        সিদ্ধান্ত, আর slug বদলালে পুরনো ঠিকানার জন্য SeoRedirect-এ একটা
        নিয়ম বসাতে হয় — নইলে যে লিংক কেউ শেয়ার করেছে সেটা মরে যায়。  */
    console.log(
      YEL('   -> Rename in Admin > Categories, then add a redirect in'),
    );
    console.log(YEL('      Admin > SEO (old -> new), or every shared link dies.'));
  }

  // ── ৪. ডুপ্লিকেট occasion tag ───────────────────────────────────────────
  head(4, 'Duplicate tags (same meaning, two names)');
  const tags = await prisma.tag.findMany({
    where: { deletedAt: null },
    select: { id: true, slug: true, name: true, _count: { select: { products: true } } },
    orderBy: { slug: 'asc' },
  });

  /*  "love" আর "love-romance" — এক জিনিস দুই নামে。 এভাবে খুঁজি: একটা slug
      অন্যটার শুরুর অংশ কিনা。 নিখুঁত নয়, ইঙ্গিত দেওয়ার জন্য যথেষ্ট。  */
  const dupes = [];
  for (const a of tags) {
    for (const b of tags) {
      if (a.id >= b.id) continue;
      if (b.slug.startsWith(a.slug + '-') || a.slug.startsWith(b.slug + '-')) dupes.push([a, b]);
    }
  }

  if (!dupes.length) {
    console.log(GRN('   OK - nothing suspicious'));
  } else {
    problems++;
    console.log(YEL(`   ${dupes.length} suspicious pair(s):`));
    for (const [a, b] of dupes) {
      console.log(
        `     "${a.slug}" (${a._count.products} products)  <->  "${b.slug}" (${b._count.products} products)`,
      );
    }
    console.log(YEL('   -> Pick the one that survives, move the products, switch the other off'));
  }

  // ── ৫. Policy page ──────────────────────────────────────────────────────
  head(5, 'Policy pages (required before taking money)');
  const pages = await prisma.contentPage.findMany({
    where: { deletedAt: null },
    select: { id: true, slug: true, title: true, isPublished: true, bodyHtml: true, kind: true },
  });
  const bySlug = new Map(pages.map((p) => [p.slug, p]));

  /*  গাইডে লেখা একমাত্র নিরাপদ সংশোধন: `/return-refund-policy` নামটা লম্বা ও
      অসঙ্গত, বাকি সব `-policy`-তে শেষ。 নতুন নামটা খালি থাকলে তবেই বদলাই。  */
  const old = bySlug.get('return-refund-policy');
  if (old && !bySlug.has('refund-policy')) {
    problems++;
    console.log(RED('   slug `return-refund-policy` should be `refund-policy`'));
    if (FIX) {
      await prisma.contentPage.update({
        where: { id: old.id },
        data: { slug: 'refund-policy' },
      });
      fixed++;
      bySlug.set('refund-policy', { ...old, slug: 'refund-policy' });
      console.log(GRN('   -> renamed'));
      console.log(YEL('      Now add a redirect in Admin > SEO: /return-refund-policy -> /refund-policy'));
    }
  }

  for (const slug of REQUIRED_LEGAL) {
    const p = bySlug.get(slug);
    if (!p) {
      problems++;
      console.log(RED(`   /${slug} - page does not exist`));
      continue;
    }
    const empty = !p.bodyHtml || p.bodyHtml.replace(/<[^>]*>/g, '').trim().length < 50;
    if (empty) {
      problems++;
      console.log(RED(`   /${slug} - "${p.title}" is empty or nearly empty`));
      console.log(DIM('       -> the owner must write the text; publishing an empty page is not enough'));
    } else if (!p.isPublished) {
      problems++;
      console.log(YEL(`   /${slug} - "${p.title}" is written but still a draft`));
      console.log(DIM('       -> publish it in Admin > Content'));
    } else {
      console.log(GRN(`   OK - /${slug} published`));
    }
  }

  // ── ৬. SSLCommerz live কিনা ─────────────────────────────────────────────
  head(6, 'Payment mode');
  const live = process.env.SSLCOMMERZ_IS_LIVE === 'true';
  if (live) {
    console.log(YEL('   SSLCOMMERZ_IS_LIVE=true - REAL money. Wrong for a demo database.'));
  } else {
    console.log(GRN('   OK - sandbox (play money), correct for a demo'));
  }

  // ── সারাংশ ──────────────────────────────────────────────────────────────
  console.log(B('\n=== Summary ==='));
  if (!problems) {
    console.log(GRN('All clear - safe to deploy.\n'));
  } else {
    console.log(`${problems} thing(s) need attention.`);
    if (FIX) console.log(GRN(`${fixed} fixed automatically.`));
    else console.log(DIM('To repair the safe ones, run again with --fix'));
    console.log('');
  }
}

main()
  .catch((e) => {
    console.error('\n\x1b[31mCould not run:\x1b[0m', e.message);
    console.error(
      '\x1b[2mIs DATABASE_URL set? Are you running from the apps/api folder?\x1b[0m',
    );
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
