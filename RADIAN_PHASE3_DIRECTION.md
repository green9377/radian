# PHASE 3 DIRECTION — Purchase / Inventory testing (written 19 Aug 2026)

> ⚠️ **STALE ADDRESSES — read this first (30 Aug 2026).** Anything below that
> names `radian-admin.vercel.app`, `radian-web-tan.vercel.app` or
> `radian-api-qnt6.onrender.com` is HISTORY, not an instruction. Vercel, Render
> and Neon are all shut down; the whole system lives on the Hostinger VPS:
> web `development.radianbd.com` · admin `admin.development.radianbd.com` ·
> api `api.development.radianbd.com`. See CLAUDE.md §2. The reasoning in this
> file is still worth reading — only the addresses are wrong.

> Hand this to the new conversation as-is. It carries everything the last
> conversation learned, so nothing has to be rediscovered. Read CLAUDE.md and
> RADIAN_PENDING.md first — the rules there stand; this file only adds the
> phase-specific direction.

---

## 1. How we work (unchanged — the owner's standing orders)

- Module-by-module testing campaign. The owner tests hands-on; Claude does ALL
  the work and ships to demo. Nothing outside the current phase's pages gets
  touched unless the owner says so.
- Small steps: one page at a time. Give the owner a short checklist of what to
  press; he reports back numbered ("1 ok, 3 broken: did X, got Y").
- NEVER invent business rules. Unclear = ask. When a decision touches the
  schema or data ownership, ask with concrete options.
- Not one character of Bangla in any file — code, strings, comments, commit
  messages. Bangla lives only in the chat. Touch a file = translate its
  remaining Bangla comments in the same commit (`--update-baseline` after).
- No demo/sample-data loaders anywhere. No "add the usual X" buttons, no
  fake-data fallbacks when the API is down (offline = honest empty screen).
  State warnings never sit on pages — they go to the notification bell.
- Design doctrine the owner enforced all through Phase 2:
  - no prose on pages, no hints under fields; what a field needs to say goes
    in its placeholder
  - validation errors appear ON the field, inside the dialog — never in a
    page banner behind the overlay; duplicates are caught live while typing
  - masters follow the house table pattern (see Item categories / Channels /
    Supplier settings); dialogs use ItemUI's Modal
  - times are never typed — use the TimeSelect pill (hour · :minute · AM/PM)
    from DeliveryUI
  - text must read dark and clear (tokens in globals.css were darkened twice;
    if he says "mora mora" again, darken `--color-body-soft` another step)

## 2. Ship path (every single time)

```
code
→ npx tsc --noEmit         (in BOTH apps/admin and apps/api)
→ node apps/api/scripts/no-bangla.selftest.mjs      (+ --update-baseline if lines cleared)
→ sidebar changed? node apps/api/src/administration/registry.gen.mjs
                 + registry.drift.mjs  (must be 6/6)
→ git commit  — author green9377 <amiparboinshaallah@gmail.com>, NEVER
  override with -c user.email (Vercel silently BLOCKS unknown authors)
→ git push origin main
→ Vercel MCP list_deployments → state READY   (admin)
→ API touched? Render MCP list_deploys → status live
→ only THEN tell the owner "dekhun"
```

Owner looks at: admin https://radian-admin.vercel.app ·
web https://radian-web-tan.vercel.app · API https://radian-api-qnt6.onrender.com
(Render free tier sleeps — first request 30–50 s).

## 3. Tools and IDs

- Folder D:\radian (read-write). Git works from the sandbox; if a delete or
  git lock fails with "Operation not permitted", ask for delete permission
  (it worked once this way — .git/HEAD.lock had to be cleared).
- Vercel MCP: team team_EPU4ghb970mee2AFZepuRQbN, admin project
  prj_CcK6rESa82N65owjVxtVfQNkG2kc.
- Render MCP: workspace tea-d9ovn6j7uimc73aaggf0, API service
  srv-d9p03ijm8hqs73a1cbtg. Render's Docker build runs `prisma generate` and
  its CMD runs `prisma migrate deploy` — so schema changes ship as: edit
  schema.prisma + hand-written SQL in prisma/migrations/<stamp>_<name>/ +
  push. Verify the column landed via Neon MCP SELECT afterwards.
- Neon MCP: project little-paper-48389780, database neondb. SELECT freely;
  ask the owner before any write.
- NEVER run `npx prisma generate` in the sandbox (breaks the Windows client).
  Consequence: code touching NEW columns/tables needs narrow casts until the
  owner runs BUILD_CHECK.bat on the host. Existing casts to clean up after
  the next host regenerate: `dualRole` in suppliers.service.ts,
  `deliverySlotTemplate` + `templateId` casts in delivery.service.ts.
- NEVER run RUN_TESTS.bat full (leaves a test order).
- Public shop endpoints can be spot-checked live without auth, e.g.
  GET /shop/delivery-options?zone=dhaka — used to verify the delivery circle.

## 4. What Phase 2 closed with (so you don't redo or undo it)

All shipped, live on demo, owner-tested:
- Units, Item categories, Colours, Sizes: clean masters, inline dialog
  errors, all "Add the usual X" seed buttons deleted. Hidden units are
  excluded from Item/Purchase pickers (kept only where already assigned).
- Variants & options: row-based per-mode editor (Colour = picker + hex box,
  Photo = upload thumb, Text = name), house switch, capped name column. The
  API-down fake catalogue (SEED_ATTRIBUTES) is deleted.
- Suppliers: DEC-SUP-010 dualRole — one tick puts the same supplier in both
  the Suppliers and Vendors workspaces (column + migration live on demo).
  Type master redesigned (dialog, vendor flag editable on non-system rows).
  Order-notifications card is vendor-only. QuickSelect always shows its
  create door. "New supplier" left the sidebar (buttons on the pages are the
  door; hrefs unchanged).
- Sales channels: house-style master; the New-order form's channel dropdown
  now reads the master (was hardcoded); storefront books web orders under
  the `website` slug.
- Delivery DEC-DLV-018: masters made once, Setup only connects.
  /delivery/zones = three tabs (Methods = DeliveryType shape editor ·
  Time slots = DeliverySlotTemplate master · Zones = area tree).
  /delivery/setup = Zone setup (connect methods with price; attach slots
  with PER-ZONE capacity — capacity lives on the connection, not the
  master; master edits fan out to connected slots except capacity).
  Slot rows appear only for shapes that need slots. The reach
  (Dhaka/nationwide) is derived from the shape (LEAD_DAYS = nationwide).
  Couriers & riders tab removed from Setup (couriers live in
  Administration, riders in /delivery/riders).
  Verified live end-to-end: owner's methods appear in
  /shop/delivery-options with correct timing/window/slots; a from-confirm
  method past its window reports closedNow; slot capacity blocks the
  storefront at full (admin form stays warn-only, DLV-R05).

Deferred (do NOT do now):
- /hr/demo seed endpoints retire in the HR phase (admin UI already removed).
- DEMO_PRODUCTS / add-on demo fallbacks in ProductViews strip in the
  Product/catalogue phase (same treatment as variants got).
- Finance/Marketing/HR state banners move to the bell in their own phases.
- ADM-D10 second half; PIN test rides Phase 9 (Finance).

## 5. Phase 3 scope — Purchase / Inventory

Pages (sidebar: Internal → Purchases, Inventory, Items overlap):
- /purchases (overview) · /purchases/list · /purchases/new · /purchases/reports
- /inventory (stock board) · Inventory → Warehouses · transfers/movements
  screens as found in code (check app/inventory/* and app/purchases/* first —
  the code is the truth, docs may be stale)

What to verify per page (the campaign pattern):
1. Read the page + its service code first; map the circle before touching UI.
2. The buy circle: create purchase (items, units with factorSnapshot, costs)
   → receive → stock posts to the receiving warehouse (DEC-INV-016
   auto-warehouse if none) → per-item stock gaps surface as the
   `stock not posted` badge + repost-stock button (DEC-PUR-010, fail-soft
   but never invisible; double repost must refuse).
3. Money circle: purchase due → supplier ledger (payments oldest-first,
   credit parking, adjustment entries) — same rows the Suppliers pages show.
4. Warehouse rules (DEC-INV-017): cannot close a warehouse holding stock /
   the last open one / the one Settings points at; cannot delete one with
   history; short code immutable.
5. Sell-from-where (DEC-INV-018): default warehouse first, then largest
   stock, shortage goes red on default — sales never block. Cancel returns
   stock where it came from.
6. Cost-jump guard on purchase lines (isCostJumpRefusal in PurchaseNewView).
7. Expect the owner's Phase-2-style revisions: prose removal, field hints,
   dialog errors, ugly switches. Apply the design doctrine proactively —
   he has now asked for the same cleanup on six pages in a row.

Known loose ends to check early:
- PUR-000001 was repaired by hand earlier (repost). Demo DB was cleaned to
  config-only on 18 Aug; whatever purchases exist now are the owner's tests.
- Purchases screens may still carry blurbs/hints — sweep them in the first
  pass rather than waiting to be told.

## 6. Board

RADIAN_PENDING.md holds the campaign board — update it when the phase opens
(Phase 3 IN PROGRESS) and when it closes, same as Phases 0–2.
