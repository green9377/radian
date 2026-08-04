# Classification — Data Requirements (unified schema pass)

_আপডেট: 19 July 2026। §9 safeguard — প্রতি page-এর field/action/relation চাহিদা।_

## Categories screen (`/categories` · CategoriesView.tsx) — built 19 Jul

Backend already satisfies everything below (Category model + `/categories` CRUD).
No schema change needed for Categories. Recorded for the unified pass only.

### Fields read
- `id, slug, name, parentId, sortOrder, isActive` — all present on Category.
- `_count.products` (direct products per category) — present via API include.

### Actions used (all existing endpoints)
- `GET /categories` (flat list, each row with `_count.products`) → tree built client-side.
- `POST /categories` `{slug,name,parentId?,sortOrder?,isActive?}` — create top-level / sub.
- `PATCH /categories/:id` — rename (`name` only; slug kept stable), reorder (`sortOrder`), visibility (`isActive`).
- `DELETE /categories/:id` — soft-delete; API already refuses if products/children exist (mirrored in UI as a disabled Delete).

### Relations
- Product → Category is `categoryId` FK (One Data One Owner). Category never stores product data.
- 2-level only (parent self-FK). UI enforces: sub-categories cannot themselves have children.

### Notes for schema pass
- Reorder currently swaps `sortOrder` of two siblings via 2× PATCH. Fine at small scale.
  If category count grows large, consider a single `PATCH /categories/reorder` taking an ordered id list.
- No product-reassignment UI here yet: a category with products can't be deleted. When Product
  bulk-edit lands, add "move products to another category" before allowing delete of a non-empty one.
- Slug is auto-generated from name on create and NOT changed on rename (keeps storefront URLs stable).
  If the owner ever needs to change a slug, that needs an explicit "advanced" field + redirect handling.

## Pending (later sub-modules)
- Occasions & Tags: `/tags` CRUD exists (DTO `{slug,name,type:OCCASION|RECIPIENT,sortOrder?,isActive?}`) — frontend only.
- Brands: model + `/brands` API MISSING — schema + migration required (copy Category pattern, no parent-child).
- Units: model + `/units` API MISSING — schema + migration required.
- Product FKs `brandId?`, `unitId?` to add once Brand/Unit lock.

---

## Owner decisions — 19 Jul 2026 (from reference-page review)

**DEC (provisional, to log in architecture project):**
1. **One primary category per product** (confirmed) — Product.categoryId stays single FK.
   Occasion / Offer / Featured / "Home" style groupings = Tags + Collections + Offers module,
   NOT extra categories. Do NOT copy the reference's multi-category (overlapping counts) model.
2. **Occasions stay Tags** (type=OCCASION), not categories — Gift Finder / occasion pages use tags.
3. **Category becomes a full CMS/SEO record** — schema to expand (below). Category-owned page meta.

### Category schema expansion (migration — bundle with Brand/Unit)
Add to `Category` model + `/categories` DTO/service:

| Column | Type | Notes |
|---|---|---|
| description | String? @db.Text | category landing content (rich text UI later) |
| summary | String? | short note |
| imageUrl | String? | needs Media library to persist real uploads |
| iconUrl | String? | nav/menu icon |
| bannerUrl | String? | category page hero |
| metaTitle | String? | SEO |
| metaDescription | String? | SEO |
| ogTitle | String? | social share |
| ogDescription | String? | social share |
| ogImageUrl | String? | social share (needs Media library) |
| showOnNavbar | Boolean @default(true) | separate from isActive |
| isFeatured | Boolean @default(false) | homepage featured |

**Dropped from reference:** `metaKeywords` (obsolete), `googleCategoryId` (defer to Ads/feed work).
**Editable slug** already in model; UI now surfaces it with preview URL + "changes public URL" warning.

### Editor UI status (built 19 Jul — CategoriesView + CategoryEditor)
- Two-pane: left tree (select/expand/reorder/toggle/preview) + right full editor.
- Persists TODAY: name, slug, parentId, sortOrder, isActive.
- Design-preview (session only, marked with an amber dot): description, summary, image/icon/banner,
  metaTitle, metaDescription, ogTitle, ogDescription, ogImage, showOnNavbar, isFeatured.
  → these start persisting after the migration above.

---

## Migration READY — run on host (19 Jul)

Code complete (schema + api categories.ts + admin api.ts + CategoryEditor persist).
Admin app typecheck clean. Persisted after migration: name, slug, parentId, sortOrder,
isActive, description, summary, metaTitle, metaDescription, ogTitle, ogDescription,
showOnNavbar, isFeatured. Images stay preview until Media library.

Run on Windows host:
```
cd /d D:\radian
docker compose up -d postgres api
docker compose run --rm api npx prisma migrate dev --name category_cms_fields
docker compose exec api npx prisma generate
docker compose restart api
```
