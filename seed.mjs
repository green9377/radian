import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const LOG = 'D:\\radian\\_seed.log';
writeFileSync(LOG, `===== SEED START ${new Date().toISOString()} =====\n`);
const log = (m) => appendFileSync(LOG, m + '\n');

process.env.DATABASE_URL = 'postgresql://radian_user:radian_pass@localhost:5433/radian_db';
const prisma = new PrismaClient();
const data = JSON.parse(readFileSync('D:\\radian\\_seed_data.json', 'utf8'));

try {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Product","Category","Tag","VariantGroup","Customer","Recipient","RecipientOccasion","Segment","Order","OrderLine","PaymentTransaction","OrderPhoto","Channel","AuditLog","ActivityEvent" RESTART IDENTITY CASCADE;'
  );
  log('DB cleaned (truncate cascade)');

  const catId = {};
  for (const c of data.categories.filter((c) => !c.parentSlug)) {
    const r = await prisma.category.create({ data: { slug: c.slug, name: c.name } });
    catId[c.slug] = r.id;
  }
  for (const c of data.categories.filter((c) => c.parentSlug)) {
    const r = await prisma.category.create({ data: { slug: c.slug, name: c.name, parentId: catId[c.parentSlug] } });
    catId[c.slug] = r.id;
  }
  log('categories: ' + Object.keys(catId).length);

  const tagId = {};
  for (const t of data.tags) {
    const r = await prisma.tag.create({ data: { slug: t.slug, name: t.name, type: t.type } });
    tagId[t.slug] = r.id;
  }
  log('tags: ' + Object.keys(tagId).length);

  let n = 0;
  for (const p of data.products) {
    await prisma.product.create({
      data: {
        slug: p.slug,
        name: p.name,
        category: { connect: { id: catId[p.categorySlug] } },
        tags: { connect: p.tagSlugs.map((s) => ({ id: tagId[s] })).filter((x) => x.id) },
        productType: p.productType,
        zone: p.zone,
        natureType: p.natureType,
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
    n++;
  }
  log('products: ' + n);

  for (const c of [['website', 'Website'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['whatsapp', 'WhatsApp'], ['phone', 'Phone']])
    await prisma.channel.create({ data: { slug: c[0], name: c[1] } });
  for (const s of [['vip', 'VIP'], ['corporate', 'Corporate'], ['birthday', 'Birthday buyer'], ['anniversary', 'Anniversary buyer'], ['wholesale', 'Wholesale']])
    await prisma.segment.create({ data: { slug: s[0], name: s[1] } });
  log('channels: 5, segments: 5');

  const pc = await prisma.product.count();
  const cc = await prisma.category.count();
  log(`VERIFY counts -> products=${pc} categories=${cc}`);
  log('RESULT: OK');
} catch (e) {
  log('ERROR: ' + (e?.stack || e));
  log('RESULT: FAIL');
} finally {
  await prisma.$disconnect();
  log(`===== SEED DONE ${new Date().toISOString()} =====`);
}
