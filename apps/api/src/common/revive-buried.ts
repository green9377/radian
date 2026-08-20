/**
 * A soft-deleted row still occupies its @unique name (owner, 20 Aug 2026: removed
 * "Pink" from Colours, added it again, got "Internal server error").
 *
 * Every master here deletes softly, so the dead row keeps the name reserved; the
 * duplicate check runs on the soft-delete-aware client and cannot see it, and the
 * create() that follows dies on the database constraint.
 *
 * Worse, the graveyard can hold SEVERAL rows for one name — "Pink" and "pink" were
 * both buried, so reviving one collided with the other and the error came back a
 * second time. So the rule is: revive the most recently buried row, and free the
 * name on the older ones by stamping them (they stay readable in history, and any
 * item still pointing at them keeps pointing at them).
 *
 * Always call with the BASE client (`this.prisma.x`), never `this.prisma.db.x` —
 * the extended client filters dead rows out and would find nothing.
 */
export interface BuriedRow {
  id: string;
  deletedAt: Date | null;
}

interface BuriedDelegate {
  findMany(args: {
    where: Record<string, unknown>;
    orderBy: { deletedAt: 'desc' };
    select: { id: true; deletedAt: true };
  }): Promise<BuriedRow[]>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
}

/** what an older duplicate is renamed to, so the live name is free again */
export function stampedName(name: string, row: BuriedRow): string {
  const day = row.deletedAt ? row.deletedAt.toISOString().slice(0, 10) : 'earlier';
  return `${name} (removed ${day} ${row.id.slice(-4)})`;
}

/**
 * The buried row to bring back, or null. Older duplicates of the same name are
 * stamped on the way out, so the caller's revive cannot collide with them.
 *
 * @param nameField which column carries the unique name ("label", "name", …)
 */
export async function claimBuried(
  delegate: BuriedDelegate,
  where: Record<string, unknown>,
  nameField: string,
  name: string,
): Promise<BuriedRow | null> {
  const buried = await delegate.findMany({
    where: { ...where, deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
    select: { id: true, deletedAt: true },
  });
  if (buried.length === 0) return null;

  const [keep, ...older] = buried;
  for (const row of older) {
    await delegate.update({
      where: { id: row.id },
      data: { [nameField]: stampedName(name, row) },
    });
  }
  return keep;
}
