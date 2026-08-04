import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

/*
  ═══════════════════════════════════════════════════════════════════════════
  Demo catalogue → database. 31 Jul 2026.

  WHY THIS EXISTS. The product page now reads the API instead of
  `_data/products.ts`, so the 71 bouquets that used to be hard-coded in the
  storefront are gone from it — correctly, because the shop never stocked them.
  The side effect is that every product link on the site 404s until there are
  real products in the database. The owner asked for demo items to work with
  while the real catalogue is entered (his decision, 31 Jul, recorded in the
  category page audit §9.3).

  ⚠️ THIS IS NOT `seed.mjs`, AND THE DIFFERENCE IS THE WHOLE POINT.

  `seed.mjs` opens with TRUNCATE on Product, Category, Tag, Customer, Order and
  nine other tables. That was right in July when the database was empty. Running
  it today would delete the categories the owner has been building the
  storefront on for two weeks — banners, sections, collections and the header
  menu all point at them.

  So this one only ADDS:
    - a category or tag that already exists is left exactly as it is
    - a product with the same slug is skipped, not overwritten
    - sizes / spec / FAQ / trust rows are written only when the product has
      none, so a product the owner has edited is never rewritten

  Run it twice and the second run changes nothing. That is deliberate — a seed
  that is unsafe to re-run is a seed nobody dares run.
  ═══════════════════════════════════════════════════════════════════════════
*/

const LOG = 'D:\\radian\\_seed_demo.log';
writeFileSync(LOG, `===== DEMO SEED START ${new Date().toISOString()} =====\n`);
const log = (m) => appendFileSync(LOG, m + '\n');

process.env.DATABASE_URL = 'postgresql://radian_user:radian_pass@localhost:5433/radian_db';
const prisma = new PrismaClient();
const data = JSON.parse(readFileSync('D:\\radian\\_seed_data.json', 'utf8'));

/** round to the nearest ৳50 — a size price of ৳1,937 reads as a mistake */
const r50 = (paisa) => Math.round(paisa / 5000) * 5000;

/*
  The copy the storefront has been drawing from `_data/productDetails.ts`.

  Seeded rather than left in the frontend for the same reason the banners were
  in their migration: the page looks the same the moment it starts reading the
  database, and the owner edits words that are already there instead of facing
  an empty screen he must fill before the site looks right again.

  One template per top-level category. Sub-categories inherit their parent's —
  a rose and a gerbera are sold the same way.
*/
const TEMPLATES = {
  flowers: {
    natureLabel: '100% Fresh Flowers',
    sizes: (p) => [
      ['Standard', 'as shown', p],
      ['Large', '+50% blooms', r50(p * 1.5)],
      ['Grand', 'double blooms', r50(p * 2)],
    ],
    spec: [
      ['Fresh cut flowers', 'As shown in photo'],
      ['Seasonal greens & filler', 'Included'],
      ['Signature matte wrap', '1 piece'],
      ['Satin ribbon', '1 piece'],
      ['Flower food sachet', '1 piece'],
      ['Handwritten greeting card', '1 piece'],
    ],
    faqs: [
      ['How long will the flowers stay fresh?', 'Five to eight days inside Dhaka with the flower food sachet and a daily water change. Keep them away from direct sun and fans.'],
      ['Will it look exactly like the photo?', 'The size, colour and flower type are the same. Individual stems vary — they are cut that morning, not manufactured.'],
    ],
  },
  cakes: {
    natureLabel: 'Freshly Baked',
    sizes: (p) => [
      ['1 lb', 'serves 6–8', p],
      ['1.5 lb', 'serves 10–12', r50(p * 1.4)],
      ['2 lb', 'serves 14–16', r50(p * 1.8)],
    ],
    spec: [
      ['Freshly baked cake', 'As per weight chosen'],
      ['Cake box & base board', '1 set'],
      ['Candles', '1 packet'],
      ['Plastic knife & plates', '1 set'],
      ['Greeting card', '1 piece'],
    ],
    faqs: [
      ['Is the cake eggless?', 'Tell us in the order note and we will bake an eggless version at no extra cost. Please order at least 6 hours ahead.'],
      ['Can you write a name on it?', 'Yes, up to 20 characters, free. Longer messages go on the card instead — they do not fit legibly on the cake.'],
    ],
  },
  balloons: {
    natureLabel: 'Helium Filled',
    sizes: (p) => [
      ['Standard set', 'as shown', p],
      ['Grand set', 'more balloons', r50(p * 1.6)],
    ],
    spec: [
      ['Foil & latex balloons', 'As shown in photo'],
      ['Helium fill', 'Included'],
      ['Weight / holder', '1 piece'],
      ['Ribbon', 'Included'],
    ],
    faqs: [
      ['How long do the balloons float?', 'Foil balloons hold for two to four days indoors. Latex holds for about a day — they are filled the same morning.'],
      ['Do you set them up at the venue?', 'Delivery is to the door. Arrangement at the venue is a separate service — ask us on WhatsApp.'],
    ],
  },
  chocolates: {
    natureLabel: 'Imported & Handmade',
    sizes: (p) => [
      ['Standard box', 'as shown', p],
      ['Large box', 'double pieces', r50(p * 1.8)],
    ],
    spec: [
      ['Chocolates', 'As shown in photo'],
      ['Gift box & liner', '1 set'],
      ['Ribbon', '1 piece'],
      ['Greeting card', '1 piece'],
    ],
    faqs: [
      ['Will the chocolate melt on the way?', 'Inside Dhaka we deliver in an insulated bag. For nationwide courier we send heat-tolerant varieties only.'],
      ['Can I see the expiry date?', 'Every box is checked before packing and carries at least three months of shelf life.'],
    ],
  },
  giftboxes: {
    natureLabel: 'Curated Gift Set',
    sizes: (p) => [
      ['Standard', 'as shown', p],
      ['Premium', 'more items', r50(p * 1.7)],
    ],
    spec: [
      ['Curated items', 'As listed in photo'],
      ['Gift box & filler', '1 set'],
      ['Ribbon & tag', '1 set'],
      ['Handwritten card', '1 piece'],
    ],
    faqs: [
      ['Can I swap an item in the box?', 'Yes, within the same price range. Message us on WhatsApp after ordering and we will confirm before packing.'],
      ['Is the price shown on anything inside?', 'No. Every price tag is removed before the box is closed.'],
    ],
  },
  combos: {
    natureLabel: 'Flowers & More, Together',
    sizes: (p) => [
      ['Standard combo', 'as shown', p],
      ['Grand combo', 'larger of each', r50(p * 1.5)],
    ],
    spec: [
      ['Flower arrangement', 'As shown in photo'],
      ['Paired gift item', 'As shown in photo'],
      ['Wrapping & ribbon', '1 set'],
      ['Greeting card', '1 piece'],
    ],
    faqs: [
      ['Does everything arrive together?', 'Yes, in one delivery. A combo is never split across two trips.'],
      ['Can I change the cake flavour in the combo?', 'Yes, tell us in the order note. Some flavours carry a small difference in price.'],
    ],
  },
  plants: {
    natureLabel: 'Live Indoor Plant',
    sizes: (p) => [
      ['Standard pot', 'as shown', p],
      ['Large pot', 'bigger plant', r50(p * 1.6)],
    ],
    spec: [
      ['Live plant', '1 piece'],
      ['Ceramic or fibre pot', '1 piece'],
      ['Potting mix', 'Included'],
      ['Care instruction card', '1 piece'],
    ],
    faqs: [
      ['How often should it be watered?', 'The care card that comes with it tells you for that plant. Most indoor plants want water twice a week, less in winter.'],
      ['Will it survive a courier trip?', 'Plants marked for nationwide delivery are packed braced and upright. The rest are Dhaka only, and the page says so.'],
    ],
  },
  personalised: {
    natureLabel: 'Made For One Person',
    sizes: (p) => [
      ['Standard', 'as shown', p],
      ['Large', 'bigger size', r50(p * 1.5)],
    ],
    spec: [
      ['Personalised item', '1 piece'],
      ['Your photo or text', 'Printed / engraved'],
      ['Gift box', '1 piece'],
      ['Greeting card', '1 piece'],
    ],
    faqs: [
      ['How long does it take?', 'One to three days, because it is made after you order. The page shows the date before you pay.'],
      ['Can I cancel after ordering?', 'Not once printing or engraving has started — your name is on it and it cannot be sold to anyone else. That is why these are prepaid.'],
    ],
  },
};

const TRUST = (zone) => [
  zone === 'DHAKA'
    ? ['bolt', '2-Hour Delivery', 'inside Dhaka']
    : ['truck', 'Nationwide Delivery', '64 districts'],
  ['shield', 'Freshness Guarantee', 'replace or refund'],
  ['store', 'Our Own Studio', 'Dhanmondi, Dhaka'],
];

try {
  const parentOf = {};
  for (const c of data.categories) parentOf[c.slug] = c.parentSlug || c.slug;

  let newCats = 0;
  const catId = {};
  for (const c of data.categories.filter((x) => !x.parentSlug)) {
    const found = await prisma.category.findUnique({ where: { slug: c.slug } });
    const row = found ?? (await prisma.category.create({ data: { slug: c.slug, name: c.name } }));
    if (!found) newCats++;
    catId[c.slug] = row.id;
  }
  for (const c of data.categories.filter((x) => x.parentSlug)) {
    const found = await prisma.category.findUnique({ where: { slug: c.slug } });
    const row =
      found ??
      (await prisma.category.create({
        data: { slug: c.slug, name: c.name, parentId: catId[c.parentSlug] },
      }));
    if (!found) newCats++;
    catId[c.slug] = row.id;
  }
  log(`categories: ${newCats} added, ${data.categories.length - newCats} already there`);

  /*  Tag is unique on (groupId, slug) and groupId is nullable, so `upsert`
      cannot address the row — two NULLs are never equal in Postgres. findFirst
      then create is the only correct read for this constraint.  */
  let newTags = 0;
  const tagId = {};
  for (const t of data.tags) {
    const found = await prisma.tag.findFirst({ where: { slug: t.slug } });
    const row = found ?? (await prisma.tag.create({ data: { slug: t.slug, name: t.name, type: t.type } }));
    if (!found) newTags++;
    tagId[t.slug] = row.id;
  }
  log(`tags: ${newTags} added, ${data.tags.length - newTags} already there`);

  let added = 0;
  let skipped = 0;
  let filled = 0;

  for (const p of data.products) {
    const root = parentOf[p.categorySlug];
    const t = TEMPLATES[root] ?? TEMPLATES.flowers;

    let product = await prisma.product.findUnique({ where: { slug: p.slug } });

    if (product) {
      skipped++;
    } else {
      product = await prisma.product.create({
        data: {
          slug: p.slug,
          name: p.name,
          category: { connect: { id: catId[p.categorySlug] } },
          tags: { connect: p.tagSlugs.map((s) => ({ id: tagId[s] })).filter((x) => x.id) },
          productType: p.productType,
          zone: p.zone,
          natureType: p.natureType,
          natureLabel: t.natureLabel,
          costPaisa: p.costPaisa,
          sellingPricePaisa: p.sellingPricePaisa,
          advanceRequired: p.advanceRequired,
          advanceType: p.advanceType,
          stockMode: p.stockMode,
          stockQty: p.stockQty,
          showStock: p.showStock,
          salesCount: p.salesCount,
          supportsExpress: p.supportsExpress,
          supportsSameDay: p.supportsSameDay,
          supportsMidnight: p.supportsMidnight,
          isBestSeller: p.isBestSeller,
          isNewArrival: p.isNewArrival,
          isPublished: p.isPublished,
        },
      });
      added++;
    }

    /*
      The four child tables, written only when the product has none of that
      kind. A product whose spec rows the owner has already corrected must not
      get the template's wording back on the next run — that is the failure
      mode that makes people stop running seeds.
    */
    const [nSize, nSpec, nFaq, nTrust] = await Promise.all([
      prisma.productSize.count({ where: { productId: product.id } }),
      prisma.productSpec.count({ where: { productId: product.id } }),
      prisma.productFaq.count({ where: { productId: product.id } }),
      prisma.productTrustBadge.count({ where: { productId: product.id } }),
    ]);

    let touched = false;

    if (nSize === 0) {
      await prisma.productSize.createMany({
        data: t.sizes(p.sellingPricePaisa).map(([label, sub, price], i) => ({
          productId: product.id,
          label,
          sub,
          pricePaisa: price,
          sortOrder: i,
        })),
      });
      touched = true;
    }

    if (nSpec === 0) {
      await prisma.productSpec.createMany({
        data: t.spec.map(([item, qty], i) => ({ productId: product.id, item, qty, sortOrder: i })),
      });
      touched = true;
    }

    if (nFaq === 0) {
      await prisma.productFaq.createMany({
        data: t.faqs.map(([question, answer], i) => ({
          productId: product.id,
          question,
          answer,
          sortOrder: i,
        })),
      });
      touched = true;
    }

    if (nTrust === 0) {
      await prisma.productTrustBadge.createMany({
        data: TRUST(p.zone).map(([icon, label, sub], i) => ({
          productId: product.id,
          icon,
          label,
          sub,
          sortOrder: i,
        })),
      });
      touched = true;
    }

    if (touched) filled++;
  }

  log(`products: ${added} added, ${skipped} already there`);
  log(`sizes / spec / FAQ / trust filled on ${filled} products`);

  /*  No ProductImage rows. There is no photography yet, and a row pointing at
      nothing renders a broken-image icon where the product should be. With no
      images the storefront draws its own tinted panel, which is what it has
      always done. Real photos stay a launch dependency.  */

  const pc = await prisma.product.count({ where: { deletedAt: null } });
  const cc = await prisma.category.count({ where: { deletedAt: null } });
  log(`VERIFY -> products=${pc} categories=${cc}`);
  log('RESULT: OK');
} catch (e) {
  log('ERROR: ' + (e?.stack || e));
  log('RESULT: FAIL');
} finally {
  await prisma.$disconnect();
  log(`===== DEMO SEED DONE ${new Date().toISOString()} =====`);
}
