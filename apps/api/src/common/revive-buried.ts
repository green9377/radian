/**
 * A soft-deleted row still occupies its @unique name (owner, 20 Aug 2026: removed
 * "Pink" from Colours, added it again, got a raw "Internal server error").
 *
 * Every master here deletes softly, so the dead row keeps the name reserved; the
 * duplicate check runs on the soft-delete-aware client and cannot see it, and the
 * create() that follows dies on the database constraint as a 500 nobody can act on.
 *
 * The fix is the same everywhere: before creating, look for the buried row with the
 * BASE client and bring it back. Same id, so old references and history stay intact.
 *
 * Usage (base client, not `prisma.db` — the extended one filters dead rows out):
 *   const buried = await findBuried(this.prisma.unit, { name: { equals: name, mode: 'insensitive' } });
 *   if (buried) return this.prisma.unit.update({ where: { id: buried.id }, data: { deletedAt: null, ... } });
 */
export interface BuriedRow {
  id: string;
}

interface FindFirstDelegate {
  findFirst(args: {
    where: Record<string, unknown>;
    select: { id: true };
  }): Promise<BuriedRow | null>;
}

/** the soft-deleted row holding this unique value, if there is one */
export function findBuried(
  delegate: FindFirstDelegate,
  where: Record<string, unknown>,
): Promise<BuriedRow | null> {
  return delegate.findFirst({
    where: { ...where, deletedAt: { not: null } },
    select: { id: true },
  });
}
