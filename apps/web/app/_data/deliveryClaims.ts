import { getDeliveryModes, zoneCode, type DeliveryMode } from "./shop";
import type { Zone } from "../_store/useZoneStore";

/*
  ═══════════════════════════════════════════════════════════════════════════
  WHAT THE SHOP PROMISES ABOUT SPEED — one place, read from the masters.

  Owner, 3 Aug 2026:
  > *"2 hours ভাবছিলাম but পরে reality দেখলাম যে 3 hours-এর নিচে possible না,
  >  তাই admin-এ 3 hours দিসি — আর তুমি মনে রাখবে আমরা এখন যা দেই এগুলা সব
  >  test purpose, আমি real কাজের time-এ সব customizable করতাসি যাতে change
  >  করা যায়।"*

  ⚠️ WHY THIS FILE EXISTS AT ALL.

  "2-Hour Delivery" was typed into about twenty files — the announcement bar,
  the hero, the trust strip, four category components, the product page, the
  FAQ, and the `<meta description>` of five routes that Google reads. The shop
  had already decided three hours was the truth and put that in the admin. The
  website went on promising two, everywhere, and no amount of admin editing
  could correct a single one of those sentences.

  The obvious fix — find and replace "2-Hour" with "3-Hour" — is the wrong one.
  It is the same bug with a different number, waiting for the next time the
  owner changes his mind. So nothing here spells a duration. Every sentence is
  built from `DeliveryType.name` and `promiseMinutes`, which is where the
  decision actually lives.

  ⚠️ AND IT FALLS BACK TO SILENCE, NOT TO A NUMBER. If the masters cannot be
  read, these return null and the caller shows nothing. A speed claim is a
  promise; an unverifiable promise printed anyway is exactly what this file was
  written to end.
  ═══════════════════════════════════════════════════════════════════════════
*/

export interface SpeedClaims {
  /** every featured delivery for this zone, fastest first */
  modes: DeliveryMode[];
  /** the fastest one — "3-Hour Express". Null when the shop advertises none. */
  fastest: DeliveryMode | null;
  /** "3-Hour Express" — the headline claim. Null = say nothing. */
  fastestLabel: string | null;
  /** "within 3 hours" — for a sentence. Null when it has no clock promise. */
  fastestPhrase: string | null;
  /** is there a same-day mode at all */
  hasSameDay: boolean;
  /** is there a midnight mode at all */
  hasMidnight: boolean;
  /** "3-Hour Express, Same Day and Midnight Surprise" — for prose and meta */
  listSentence: string;
}

export const EMPTY_CLAIMS: SpeedClaims = {
  modes: [],
  fastest: null,
  fastestLabel: null,
  fastestPhrase: null,
  hasSameDay: false,
  hasMidnight: false,
  listSentence: "",
};

/**
 * "within 3 hours" · "within 90 minutes".
 *
 * ⚠️ Minutes below an hour, hours above it, and never "1.5 hours" — a promise
 * with a decimal point in it reads like a guess. Half-hours round UP, because
 * the only safe direction to be wrong about a delivery time is later.
 */
export function promisePhrase(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `within ${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return `within ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/** "A, B and C" — an Oxford-comma-free list, the way a shop would say it */
function joinNatural(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function claimsFrom(modes: DeliveryMode[] | null): SpeedClaims {
  if (!modes || modes.length === 0) return EMPTY_CLAIMS;

  /*
    "Fastest" = the shortest clock promise, and only a FROM_CONFIRM mode has
    one. A Same Day slot is not faster than a 3-hour express just because it
    happens today, and a scheduled delivery is not slow — it is whenever the
    customer asked for. Sorting all of them by some invented speed score would
    put "Schedule It" at the top on a shop that has no express service.
  */
  const timed = modes
    .filter((m) => m.timing === "FROM_CONFIRM" && (m.promiseMinutes ?? 0) > 0)
    .sort((a, b) => (a.promiseMinutes ?? 0) - (b.promiseMinutes ?? 0));

  const fastest = timed[0] ?? null;

  return {
    modes,
    fastest,
    fastestLabel: fastest?.typeName ?? null,
    fastestPhrase: promisePhrase(fastest?.promiseMinutes ?? null),
    hasSameDay: modes.some((m) => m.timing === "TODAY_SLOT"),
    hasMidnight: modes.some((m) => m.timing === "PICK_DATE_FIXED"),
    listSentence: joinNatural(modes.map((m) => m.typeName)),
  };
}

/** null on failure — the caller must then say nothing, never a number */
export async function fetchSpeedClaims(zone: Zone | null): Promise<SpeedClaims> {
  return claimsFrom(await getDeliveryModes(zoneCode(zone)));
}
