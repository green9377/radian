/*
  ═══════════════════════════════════════════════════════════════════════════
  "IS THIS THE PERSON WHOSE ORDER THIS IS?" — one answer, one place.

  Order tracking has asked this since DEC-SAL-016. The payment lookups now ask
  it too (S-03, 31 Aug 2026), and the moment two files answered the same
  security question there was a real risk of them drifting: one gets a fix, the
  other keeps the hole, and nobody notices because both still "work".

  ⚠️ THE TRAILING TEN DIGITS, NOT THE WHOLE STRING. A Bangladeshi number is
  written every way a person can think of - `+8801712345678`, `01712345678`,
  `0171-234 5678`. Comparing the raw text refuses the same customer for typing
  their own number the way they always do. Ten digits is the national number
  without the leading zero or the country code, so all three forms meet.

  ⚠️ THREE NUMBERS COUNT, NOT ONE. On a gift order - most of them - the buyer,
  the account and the recipient can be three different people, and each of them
  legitimately holds the order number. Refusing the recipient would mean the
  person the flowers were sent to cannot see when they arrive.
  ═══════════════════════════════════════════════════════════════════════════
*/

/** Last ten digits, punctuation and country code stripped. */
export function phoneTail(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '').slice(-10);
}

/**
 * Does `typed` match any of the order's numbers?
 *
 * A number shorter than ten digits never matches. Without that, `phoneTail('')`
 * is `''`, and `''` equals the tail of every order with a missing number -
 * which would turn "type nothing" into a master key.
 */
export function phoneMatchesOrder(
  typed: string,
  candidates: (string | null | undefined)[],
): boolean {
  const want = phoneTail(typed);
  if (want.length < 10) return false;
  return candidates.some((c) => phoneTail(c) === want);
}
