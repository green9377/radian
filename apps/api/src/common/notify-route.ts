/*
  WHICH DOOR A MESSAGE LEAVES BY — the owner's rule, 8 Sep 2026.

  WhatsApp was costing too much, so it is now the last resort, not the first:

      Bangladeshi number   → SMS
      foreign number       → email, when we have one
                           → otherwise WhatsApp

  One rule for every message the system sends a customer — order
  confirmation through delivery and the review request, and the login code.
  It lives here so that the order messages and the OTP cannot drift apart.

  A "Bangladeshi number" is one written with +880, 880, or as 01X (eleven
  digits). Everything else is foreign.
*/

export type NotifyRoute = 'SMS' | 'EMAIL' | 'WHATSAPP';

export function isBangladeshiPhone(raw: string | null | undefined): boolean {
  const d = (raw ?? '').trim().replace(/[\s\-()]/g, '');
  if (!d) return false;
  if (/^\+?8801\d{9}$/.test(d)) return true;
  return /^01\d{9}$/.test(d);
}

/** The primary channel, and the one to fall back to if it is not set up. */
export function routeFor(phone: string | null | undefined, email: string | null | undefined): NotifyRoute[] {
  if (isBangladeshiPhone(phone)) return ['SMS', 'WHATSAPP'];
  if (email?.trim() && email.includes('@')) return ['EMAIL', 'WHATSAPP'];
  return ['WHATSAPP'];
}
