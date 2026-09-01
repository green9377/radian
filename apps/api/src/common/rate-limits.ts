import type { RateLimitRule } from './rate-limit.guard';

/*
  ═══════════════════════════════════════════════════════════════════════════
  THE NUMBERS — S-02, 31 Aug 2026. One file, so nobody has to hunt.

  ⚠️ READ THIS BEFORE CHANGING ANY NUMBER.

  Mobile Bangladesh sits behind carrier NAT: on Grameenphone or Robi, thousands
  of real customers reach us from ONE address. A limit that looks generous for
  a person can therefore be strict for a network, and the failure is invisible
  from here - it looks like nothing, because the customer simply leaves.

  So the two sides are set from opposite directions:

    STOREFRONT (quote, track, uploads) - generous, because the cost of being
      wrong is a paying customer who cannot buy. These numbers exist to stop
      automated abuse at scale, not to police individual behaviour.

    ADMIN / ACCOUNT (login, forgot password) - strict, because the traffic is a
      handful of staff from a handful of places, and what is behind the door is
      the whole business.

  Not touched: the OTP path in `messaging/otp.service.ts` already has real
  limits of its own (5-minute expiry, one live code per phone, 5 wrong guesses,
  60-second resend cooldown, 5 codes per phone per hour). It is the one place
  that was already right, and it stays exactly as it is.
  ═══════════════════════════════════════════════════════════════════════════
*/

/**
 * The login box.
 *
 * 20 tries per 15 minutes from one address. The shop's staff share an office
 * connection and people do mistype, so it is not 5. It is still the difference
 * between a password falling in an afternoon and it never falling: 1,920
 * guesses a day against a scrypt hash is nothing.
 */
export const LOGIN_LIMIT: RateLimitRule = { limit: 20, windowSec: 15 * 60 };

/**
 * "I forgot my password".
 *
 * The box answers identically whether the address exists or not, so this is
 * not about enumeration - it is about not letting a stranger fill somebody's
 * inbox, and not minting reset tokens by the thousand.
 */
export const FORGOT_LIMIT: RateLimitRule = { limit: 5, windowSec: 60 * 60 };

/**
 * Track order.
 *
 * The one storefront route where guessing pays: order number plus phone. 30 a
 * minute is far more than a person refreshing a delivery page, and it takes
 * guessing the pair from "possible over a weekend" to "not worth starting".
 *
 * ⚠️ Shares a bucket with the payment-due route on purpose - see PAY_LOOKUP.
 */
export const TRACK_LIMIT: RateLimitRule = {
  limit: 30,
  windowSec: 60,
  bucket: 'order-lookup',
};

/**
 * The two order-number lookups on the payment side (S-03).
 *
 * ⚠️ THE SHARED BUCKET IS THE POINT, not an accident. Both routes and `track`
 * answer the same question - "is this order real, and what state is it in" -
 * so counting them separately would just mean three doors into one house and
 * three times the allowance. One name, one allowance.
 */
export const PAY_LOOKUP_LIMIT: RateLimitRule = {
  limit: 30,
  windowSec: 60,
  bucket: 'order-lookup',
};

/**
 * Re-pricing the cart.
 *
 * Called on every cart change, so this has to be roomy: a shopper adjusting
 * quantities fires several a second. 120 a minute stops a script hammering the
 * offer engine without any real cart ever noticing.
 */
export const QUOTE_LIMIT: RateLimitRule = { limit: 120, windowSec: 60 };

/**
 * Customer review photo - public, 3 MB a time, straight to the VPS disk.
 *
 * A person writing a review attaches one photo, maybe two after a failed try.
 * 10 an hour is generous for that and caps an anonymous stranger at 30 MB.
 */
export const REVIEW_PHOTO_LIMIT: RateLimitRule = {
  limit: 10,
  windowSec: 60 * 60,
};

/**
 * Photo for a personalised item - public, 10 MB a time, straight to the disk.
 *
 * Higher than the review cap because this one is part of BUYING: somebody
 * ordering three personalised gifts uploads three photos, and may well retry a
 * big one over a phone connection. Refusing that is refusing an order.
 */
export const PERSO_PHOTO_LIMIT: RateLimitRule = {
  limit: 20,
  windowSec: 60 * 60,
};
