/*  ONE settings row, fetched safely when two requests arrive together.

    THE BUG THIS EXISTS TO KILL — found 29 Jul 2026, the hard way. The
    Intelligence dashboard returned 500 on its very first load:

        P2002: Unique constraint failed on the fields: (`id`)

    Two requests hit `settings()` at the same moment. Both looked, both saw no
    row, both inserted, and the second one died. In dev this is not rare or
    unlucky — a React effect fires the same fetch twice on mount, so it is the
    NORMAL case, every single page load.

    WHY `upsert` ALONE DOES NOT FIX IT. Kickoff §8 says "singleton
    findUnique → create is wrong, use upsert", and three modules were changed to
    upsert on that advice, with comments saying the gap was now closed. It is
    not. Prisma only compiles an upsert down to a single atomic
    `INSERT … ON CONFLICT DO UPDATE` under some conditions; otherwise it still
    emits SELECT-then-INSERT and the gap is exactly where it was. The advice was
    right about the disease and wrong about the cure.

    THE ACTUAL FIX is to stop trying to win the race and simply survive losing
    it: if the insert fails because somebody else already inserted, read THEIR
    row. Creating a default settings row is not something worth failing over.

    WHY THIS IS A SHARED HELPER AND NOT EIGHT COPIES. There were eight singleton
    accessors across seven modules, in three slightly different shapes, and the
    §8 lesson had reached only three of them. Eight hand-written try/catch blocks
    would drift again the moment a ninth singleton is added. One function cannot.

    USAGE — the caller keeps its own model reference, so nothing is untyped:

        return ensureSingleton(
          () => this.prisma.db.posSetting.findFirst(),
          () => this.prisma.db.posSetting.create({ data: {} }),
        );
*/

/** Prisma's "unique constraint failed" — somebody else got there first. */
const UNIQUE_VIOLATION = 'P2002';

export async function ensureSingleton<T>(
  read: () => Promise<T | null>,
  create: () => Promise<T>,
): Promise<T> {
  const found = await read();
  if (found) return found;

  try {
    return await create();
  } catch (e) {
    // anything other than a duplicate is a real problem — let it through
    if ((e as { code?: string })?.code !== UNIQUE_VIOLATION) throw e;

    // we lost the race, which is fine. Read the row the winner just wrote.
    const again = await read();
    if (again) return again;

    // P2002 with still no row means the clash was on some OTHER unique field,
    // not the singleton id — that is a genuine bug and must not be swallowed.
    throw e;
  }
}
