import { Prisma, PrismaClient } from '@prisma/client';

/**
 * DEC-GBL-007, second half — a BURIED row never blocks a new one.
 *
 * ── Why this is an extension and not another guard in another service ──────
 * The rule was written on 22 Aug 2026: delete a master and its name is free
 * again. It was then implemented by hand in categories, brands, tags and
 * collections — and the owner hit the very same wall an hour later on Variants
 * & options, because that service was not on my list:
 *
 *   > *"akoi vul barbar kn krso tmi."*
 *
 * He is right, and `soft-delete.extension.ts` already carries the same lesson
 * about its own hand-kept list: *"This list cannot be kept correct by hand — it
 * is a job for a machine."* Twenty-odd masters each need this, and any new one
 * would need it too. So it lives here, once, for every model there is.
 *
 * ── What it does ───────────────────────────────────────────────────────────
 * A unique index does not care that a row is soft-deleted, but every list
 * reads through `prisma.db`, which hides it. So the owner deletes a thing,
 * watches it vanish, types the same name again — and is refused over a row he
 * cannot see or reach.
 *
 * When a create fails on a unique constraint (P2002), this asks one question:
 * is the row holding that key already deleted?
 *
 *   · a LIVE row holds it   → nothing changes, the real error goes through
 *   · a BURIED row holds it → try to erase that row for good, then create again
 *   · buried but still referenced (the erase is refused by a foreign key)
 *                           → the original error goes through, untouched
 *
 * Erasing it is exactly DEC-GBL-007: the owner already deleted this thing, and
 * nothing points at it, so it goes. Business documents are safe by their own
 * nature — an order or a purchase always has lines pointing at it, so the
 * erase is refused and their existing number-retry logic runs as before.
 */
export const clearBuriedKeysExtension = (raw: PrismaClient) =>
  Prisma.defineExtension({
    name: 'clear-buried-keys',
    query: {
      $allModels: {
        async create({ model, args, query }) {
          try {
            return await query(args);
          } catch (e) {
            const columns = conflictColumns(e);
            if (!columns) throw e;

            const delegate = (raw as unknown as Record<string, ModelDelegate>)[
              model.charAt(0).toLowerCase() + model.slice(1)
            ];
            if (!delegate?.findFirst || !delegate.delete) throw e;

            const where = pickKey(args.data, columns);
            if (!where) throw e;

            const clash = await delegate
              .findFirst({ where, select: { id: true, deletedAt: true } })
              .catch(() => null);

            // Not found, no id to delete by, or ALIVE — the clash is genuine.
            if (!clash?.id || !clash.deletedAt) throw e;

            try {
              await delegate.delete({ where: { id: clash.id } });
            } catch {
              // something still points at the buried row: leave it, and let the
              // caller's own message stand
              throw e;
            }
            return query(args);
          }
        },
      },
    },
  });

type ModelDelegate = {
  findFirst?: (a: unknown) => Promise<{ id?: string; deletedAt?: Date | null } | null>;
  delete?: (a: unknown) => Promise<unknown>;
};

/** the column(s) a P2002 landed on, or null when this is not a unique clash */
function conflictColumns(e: unknown): string[] | null {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return null;
  const target = (e.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) return target.filter((t): t is string => typeof t === 'string');
  if (typeof target === 'string') return [target];
  return null;
}

/**
 * Build the `where` that finds the row already holding the key.
 *
 * Only plain scalars are used. A nested `connect`, an unset column or a
 * composite key we cannot read means we do not know what clashed — and then
 * doing nothing is the only safe answer.
 */
function pickKey(data: unknown, columns: string[]): Record<string, unknown> | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const where: Record<string, unknown> = {};
  for (const c of columns) {
    const v = row[c];
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return null;
    where[c] = v;
  }
  return Object.keys(where).length ? where : null;
}
