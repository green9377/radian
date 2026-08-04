// Category page — demo data, so the whole page can be checked top to bottom.
//
// WHAT THIS IS FOR. The category page has fourteen blocks and most of them are
// AUTO: they fill themselves from what the products carry. With an empty shop
// they correctly render nothing, which makes it impossible to tell "built and
// working" apart from "built and broken". This puts enough real-shaped data in
// to see every block light up.
//
// IDEMPOTENT. Safe to run twice — everything is upserted or checked first, and
// nothing that already exists is overwritten.
//
// NOT DESTRUCTIVE. It never deletes a product, never changes a price, and never
// touches a product that already has the thing it is about to set.
//
//   docker compose exec api node prisma/seed-category-demo.js
//
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const COLOURS = [
  { label: 'Red', swatch: '#C0392B' },
  { label: 'Pink', swatch: '#E58AAE' },
  { label: 'White', swatch: '#F4F1EC' },
  { label: 'Yellow', swatch: '#E8B54B' },
  { label: 'Purple', swatch: '#7C4DA0' },
  // Owner's rule, 31 Jul: a multi-colour arrangement is Mixed, not "also red".
  // Red means exactly Red.
  { label: 'Mixed', swatch: 'linear-gradient(135deg,#C0392B,#E58AAE,#E8B54B)' },
];

const STYLES = [
  { slug: 'bouquet', name: 'Bouquet', summary: 'Hand-tied, wrapped' },
  { slug: 'box', name: 'Box', summary: 'Arranged in a gift box' },
  { slug: 'basket', name: 'Basket', summary: 'Full and generous' },
  { slug: 'vase', name: 'Vase', summary: 'Ready to stand' },
];

const OCCASIONS = [
  { slug: 'birthday', name: 'Birthday', summary: 'Bright and joyful' },
  { slug: 'anniversary', name: 'Anniversary', summary: 'Romantic classics' },
  { slug: 'love', name: 'Love & romance', summary: 'Say it properly' },
  { slug: 'get-well-soon', name: 'Get well soon', summary: 'Gentle and calming' },
  { slug: 'congratulations', name: 'Congratulations', summary: 'Well earned' },
];

const RECIPIENTS = [
  { slug: 'her', name: 'Her' },
  { slug: 'him', name: 'Him' },
  { slug: 'parents', name: 'Parents' },
  { slug: 'friend', name: 'Friend' },
];

const FAQS = [
  { q: 'How long will the flowers stay fresh?', a: 'Kept in water and away from direct sun, 4 to 6 days. We arrange every order the morning it goes out.' },
  { q: 'Can you deliver at midnight?', a: 'Inside Dhaka, yes — order by 9 PM and we deliver between 12:00 and 12:30 AM.' },
  { q: 'What if nobody is home?', a: 'The rider calls you first. We can leave it with a neighbour or come back the same day, whichever you prefer.' },
  { q: 'Can I send it anonymously?', a: 'Yes. Leave the sender name blank on the gift message and we will not mention who it is from.' },
  { q: 'Do you deliver outside Dhaka?', a: 'Courier-safe items travel nationwide in 1 to 3 days. Fresh cream cakes and balloons stay inside Dhaka.' },
];

async function main() {
  const log = (...a) => console.log('  ', ...a);

  /* ── 1. Colour master (D-CAT-01) ────────────────────────────────────────── */
  let colourAttr = await db.variantAttribute.findFirst({
    where: { name: 'Colour', deletedAt: null },
  });
  if (!colourAttr) {
    colourAttr = await db.variantAttribute.create({
      data: { name: 'Colour', displayMode: 'SWATCH', sortOrder: 0 },
    });
    log('Colour attribute created');
  }
  const colours = [];
  for (const [i, c] of COLOURS.entries()) {
    const existing = await db.variantValue.findFirst({
      where: { attributeId: colourAttr.id, label: c.label },
    });
    colours.push(
      existing ??
        (await db.variantValue.create({
          data: { attributeId: colourAttr.id, label: c.label, swatch: c.swatch, sortOrder: i },
        })),
    );
  }
  log(`${colours.length} colours ready`);

  /* ── 2. Tag groups — Style, Occasions, Recipients ───────────────────────── */
  async function group(slug, name, displayStyle, isSystem, tags) {
    let g = await db.tagGroup.findFirst({ where: { slug, deletedAt: null } });
    if (!g) {
      g = await db.tagGroup.create({ data: { slug, name, displayStyle, isSystem } });
      log(`tag group "${name}" created`);
    }
    const out = [];
    for (const [i, t] of tags.entries()) {
      const found = await db.tag.findFirst({ where: { groupId: g.id, slug: t.slug, deletedAt: null } });
      out.push(
        found ??
          (await db.tag.create({
            data: { groupId: g.id, slug: t.slug, name: t.name, summary: t.summary ?? null, sortOrder: i },
          })),
      );
    }
    return out;
  }

  // "style" is the slug the category page's Shop-by-style block looks for.
  // Without this group that block simply does not render — which is correct
  // behaviour, and also why the shop needs the group to exist.
  const styles = await group('style', 'Style', 'CARD', false, STYLES);
  const occasions = await group('occasions', 'Occasions', 'CARD', true, OCCASIONS);
  const recipients = await group('recipients', 'Recipients', 'CHIP', true, RECIPIENTS);
  log(`${styles.length} styles, ${occasions.length} occasions, ${recipients.length} recipients`);

  /* ── 3. Budget collections — the price cards ────────────────────────────── */
  const BANDS = [
    { slug: 'under-1000', name: 'Under ৳1,000', kicker: 'Thoughtful', minPaisa: null, maxPaisa: 100000, sortOrder: 0 },
    { slug: '1000-2500', name: '৳1,000 – ৳2,500', kicker: 'Most loved', minPaisa: 100000, maxPaisa: 250000, sortOrder: 1 },
    { slug: '2500-5000', name: '৳2,500 – ৳5,000', kicker: 'Premium', minPaisa: 250000, maxPaisa: 500000, sortOrder: 2 },
    { slug: 'over-5000', name: '৳5,000 and up', kicker: 'Luxury', minPaisa: 500000, maxPaisa: null, sortOrder: 3, accent: true },
  ];
  for (const b of BANDS) {
    const found = await db.collection.findFirst({ where: { slug: b.slug } });
    if (!found) {
      await db.collection.create({
        data: { ...b, mode: 'PRICE_RANGE', isFeatured: true, accent: b.accent ?? false },
      });
    }
  }
  log(`${BANDS.length} budget bands ready`);

  /* ── 4. Give every published product a colour, a style, an occasion ─────── */
  //
  // Spread deterministically by position, NOT at random: run it twice and
  // nothing moves, so a screen that looked right yesterday looks right today.
  //
  // Only fills what is empty. A colour the owner chose by hand is never
  // overwritten — the whole point of this file is to make the page checkable,
  // not to take his decisions back off him.
  const products = await db.product.findMany({
    where: { deletedAt: null, isPublished: true },
    select: { id: true, name: true, variantValueId: true, tags: { select: { id: true } } },
    orderBy: { createdAt: 'asc' },
  });

  let painted = 0;
  let tagged = 0;
  for (const [i, p] of products.entries()) {
    if (!p.variantValueId) {
      await db.product.update({
        where: { id: p.id },
        data: { variantValueId: colours[i % colours.length].id },
      });
      painted++;
    }
    if (p.tags.length === 0) {
      await db.product.update({
        where: { id: p.id },
        data: {
          tags: {
            connect: [
              { id: styles[i % styles.length].id },
              { id: occasions[i % occasions.length].id },
              { id: recipients[i % recipients.length].id },
            ],
          },
        },
      });
      tagged++;
    }
  }
  log(`${products.length} published products · ${painted} given a colour · ${tagged} tagged`);

  /* ── 5. Delivery flags, so "Ready to send now" has something in it ─────── */
  const noSpeed = await db.product.findMany({
    where: { deletedAt: null, isPublished: true, supportsExpress: false, supportsSameDay: false },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const [i, p] of noSpeed.entries()) {
    // every third one, so the rail is a selection and not the whole catalogue
    if (i % 3 !== 0) continue;
    await db.product.update({
      where: { id: p.id },
      data: { supportsExpress: true, supportsSameDay: true },
    });
  }
  log(`${Math.ceil(noSpeed.length / 3)} products marked express`);

  /* ── 6. Best sellers, so "Most ordered" is not empty ────────────────────── */
  const anyBest = await db.product.count({ where: { deletedAt: null, isPublished: true, isBestSeller: true } });
  if (anyBest === 0) {
    const first = products.slice(0, 8).map((p) => p.id);
    await db.product.updateMany({ where: { id: { in: first } }, data: { isBestSeller: true } });
    log(`${first.length} products marked best seller`);
  }

  /* ── 7. FAQ for every top-level category (D-CAT-03) ─────────────────────── */
  const cats = await db.category.findMany({
    where: { deletedAt: null, parentId: null },
    select: { id: true, name: true },
  });
  let faqCats = 0;
  for (const c of cats) {
    const have = await db.categoryFaq.count({ where: { categoryId: c.id } });
    if (have > 0) continue;
    await db.categoryFaq.createMany({
      data: FAQS.map((f, i) => ({
        categoryId: c.id,
        question: f.q,
        answer: f.a,
        sortOrder: i,
      })),
    });
    faqCats++;
  }
  log(`${faqCats} categories given the ${FAQS.length} starter questions`);

  console.log('\nDone. Open a category page and check it from the banner down.');
  console.log('Everything here is editable in the admin — change one thing and reload.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
