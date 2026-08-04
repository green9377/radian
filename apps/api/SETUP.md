# Radian API — Prisma Setup (Step-by-step)

Stack (locked): **PostgreSQL + NestJS 11 + Prisma 6.x**।
এই phase = infrastructure only (datasource + generator + PrismaService)। কোনো model নেই — model আসবে locked module ধরে (Item → Product → Customer → Sales)।

## কী কী যোগ হলো (repo-তে ইতিমধ্যে করা)

- `package.json` — `@prisma/client` + `prisma` (6.19.3) + prisma scripts + `prisma.schema` path।
- `prisma/schema.prisma` — postgres datasource `env(DATABASE_URL)`, generator `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` (host + alpine container দুটোই)।
- `src/prisma/prisma.service.ts` — `PrismaService`, `db` = soft-delete extension প্রয়োগ করা client, connect/disconnect lifecycle।
- `src/prisma/soft-delete.extension.ts` — read-side `deletedAt: null` auto-filter।
- `src/prisma/prisma.module.ts` — `@Global()` module।
- `app.module.ts` — `PrismaModule` wired।
- `Dockerfile` — alpine-এ `openssl`, `prisma generate` build-এ।

## যা তোমাকে হোস্টে চালাতে হবে

> এগুলো sandbox-এ চালাইনি — কারণ (১) npm install Windows/alpine-specific Prisma binary নামায়, (২) migrate-এর জন্য চালু Postgres দরকার। হোস্টই সঠিক জায়গা।

### বিকল্প A — সব Docker-এ (সহজ, DATABASE_URL যেমন আছে থাকবে)

```bash
cd /d D:\radian
docker compose up -d postgres          # DB চালু
docker compose build api               # prisma generate সহ image
docker compose run --rm api npx prisma migrate dev --name init   # প্রথম migration
docker compose up -d api web           # সব চালু
```
`.env`-এর `DATABASE_URL=...@postgres:5432/...` container network-এ ঠিকঠাক কাজ করে।

### বিকল্প B — API হোস্টে (native dev, faster reload)

```bash
cd /d D:\radian
docker compose up -d postgres          # শুধু DB container-এ

cd /d D:\radian\apps\api
npm install                            # prisma + client নামাবে
```
হোস্ট থেকে `postgres` hostname resolve হয় না — তাই migrate-এর সময় **localhost** URL দাও:
```bash
# PowerShell
$env:DATABASE_URL="postgresql://radian_user:radian_pass@localhost:5432/radian_db"
npm run prisma:migrate -- --name init
npm run start:dev
```

## যাচাই

- `npm run build` (apps/api) — tsc clean হওয়া উচিত।
- `npx prisma studio` — DB খুলে দেখা।
- health: `GET http://localhost:4000/` (AppController)।

## Soft-delete extension (model phase — এখন enable নয়)

infra-stage-এ schema খালি (model নেই)। Prisma-র generated `$allModels` type খালি schema-য়
`never`-এ resolve করে, ফলে soft-delete extension type-check ভাঙে (TS2339/2349/2322)।
তাই প্রথম model (Item) যোগ হওয়ার পর নিচের extension ফিরিয়ে এনে PrismaService-এ wire করো
(`readonly db = new PrismaClient().$extends(softDeleteExtension)` প্যাটার্ন), আর read-side query
`this.prisma.db.*` দিয়ে চালাও:

```ts
// src/prisma/soft-delete.extension.ts  (model phase-এ ফেরত আনবে)
import { Prisma } from '@prisma/client';

export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',
  query: {
    $allModels: {
      async findFirst({ args, query })        { args.where = { deletedAt: null, ...((args.where ?? {}) as Record<string, unknown>) }; return query(args); },
      async findFirstOrThrow({ args, query })  { args.where = { deletedAt: null, ...((args.where ?? {}) as Record<string, unknown>) }; return query(args); },
      async findMany({ args, query })          { args.where = { deletedAt: null, ...((args.where ?? {}) as Record<string, unknown>) }; return query(args); },
      async count({ args, query })             { args.where = { deletedAt: null, ...((args.where ?? {}) as Record<string, unknown>) }; return query(args); },
      async aggregate({ args, query })         { args.where = { deletedAt: null, ...((args.where ?? {}) as Record<string, unknown>) }; return query(args); },
    },
  },
});
```
সীমা: `findUnique` filter হয় না — soft-delete-aware single lookup-এ `findFirst`। delete→update(deletedAt)
প্রতিটি owning-module service-এ audit event সহ।

## এরপর (model phase)

build_sequence অনুযায়ী প্রথম schema: **Item → Category → Unit → Brand → Product**।
প্রতি model-এ বাধ্যতামূলক: `id`, `createdAt`, `updatedAt`, `deletedAt DateTime?`।
প্রতিটা locked rule enforce করলে কোড কমেন্টে `DEC-XXX-NNN` cite।
