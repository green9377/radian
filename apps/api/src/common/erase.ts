import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * DEC-GBL-007 — deleting a MASTER really deletes it (owner, 22 Aug 2026).
 *
 * > *"What I delete gets deleted, if no information is attached to it. If you
 * >  think keeping it is right somewhere, fine — but then making it again must
 * >  work by itself, it must not block me."*
 *
 * ── The disease this cures ────────────────────────────────────────────────
 * Every master used to be soft-deleted: the row stayed with `deletedAt` set.
 * But `slug`, `email`, `code` and `name` are UNIQUE INDEXES, and an index does
 * not care that a row is dead. Meanwhile every list reads through
 * `prisma.db`, which hides dead rows. So the owner deleted a thing, saw it
 * disappear, typed the same name again — and was told it already exists,
 * pointing at something he could neither see nor reach. It bit categories
 * ("teddy"), staff accounts (the same email refused), and access templates,
 * and it was the same fault that stopped every sales return on 21 August.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 * A master with nothing pointing at it is ERASED — the row goes, and its own
 * owned children (a category's FAQ, a collection's membership rows) go with
 * it through the schema's cascades. Nothing is left to hold the name hostage.
 *
 * A master that IS still pointed at cannot be erased: the database refuses
 * (P2003 / P2014). Most callers catch that earlier with a friendlier message
 * of their own ("category has products — reassign them first"); this is the
 * backstop for the ones that do not, and it buries the row instead of
 * crashing, so nothing is lost.
 *
 * ⚠️ NOT for business documents. An order, purchase, sale, return, payment,
 * stock movement or payroll run is never really deleted (house rule 5) —
 * they keep `deletedAt` and their numbers, and their number generators
 * already step over a taken one.
 */
export async function eraseOrBury(
  erase: () => Promise<unknown>,
  bury: () => Promise<unknown>,
  /** what the owner is deleting, for the message when it cannot go */
  label: string,
): Promise<{ erased: boolean }> {
  try {
    await erase();
    return { erased: true };
  } catch (e) {
    if (!isStillReferenced(e)) throw e;
    await bury();
    return { erased: false };
  }
}

/**
 * Erase, or say plainly why not. Use where the caller would rather refuse
 * than leave a tombstone the owner cannot see.
 */
export async function eraseOrRefuse(
  erase: () => Promise<unknown>,
  label: string,
): Promise<void> {
  try {
    await erase();
  } catch (e) {
    if (!isStillReferenced(e)) throw e;
    throw new BadRequestException(
      `${label} is still being used somewhere, so it cannot be removed. Take it off whatever uses it first.`,
    );
  }
}

/** P2003 = foreign key still points here. P2014 = a required relation would break. */
export function isStillReferenced(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    (e.code === 'P2003' || e.code === 'P2014')
  );
}
