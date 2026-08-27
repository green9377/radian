import { NestFactory } from '@nestjs/core';
import type { Request } from 'express';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
/*  One list of our own addresses, shared with the cache ping — see the note in
    that file for why it stopped being two.  */
import { corsOrigins } from './common/web-origins';

// BigInt (Customer.ltvPaisa) JSON-serialize safety net - without it the
// response throws. (Services map ltvPaisa to Number; this is the fallback.)
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

/*  WHICH SITES MAY CALL THIS API FROM A BROWSER.

    This used to be a bare `app.enableCors()` — meaning any website on earth
    could call our API through a visitor's browser. Harmless locally, not on
    the internet.

    The list comes from three places:
      • PUBLIC_WEB_URL   — the customer's shop (apps/web)
      • PUBLIC_ADMIN_URL — the admin panel (apps/admin)
      • CORS_ORIGINS     — anything extra, comma-separated
    Local dev's :3000 and :3001 are always open on top of those.

    ⚠️ If none of them is set in production the API still boots, but admin and
    web come back empty. So the list is printed at boot — after a deploy, check
    the "[CORS] allowed:" line in the log.  */

/*
  ═══════════════════════════════════════════════════════════════════════════
  ⚠️ THE PAYMENT GATEWAY'S OWN LANDING ROUTES ARE NOT SUBJECT TO THIS LIST.

  Found on 27 Aug 2026, walking the money circle on demo. The customer paid,
  the money was recorded correctly — and the screen said
  "Internal server error". A shopper reading that has been charged and told it
  failed, so they call, or they pay a second time.

  What happens: after payment SSLCommerz sends the customer's browser back to
  `success_url` as a FORM POST, and a cross-origin form POST carries
  `Origin: https://sandbox.sslcommerz.com`. That origin is not on our list, so
  the cors middleware threw, and the throw became a 500 before the handler ever
  ran.

  ⚠️ AND THE CHECK WAS NEVER PROTECTING ANYTHING HERE. CORS is a rule the
  BROWSER enforces on scripted requests; it does not stop a top-level
  navigation, which is exactly what this is. Rejecting it bought no safety and
  cost the customer their confirmation page.

  What actually protects these routes is in `shop/payment.ts`: nothing is
  marked paid from what the browser carries. We call SSLCommerz back with the
  `val_id`, over our own connection, and only their answer moves money. That is
  the fence, and it is untouched.

  Kept as narrow as it can be: this exemption is for `/shop/payment/` and
  nothing else. Every other route keeps the strict allowlist.
  ═══════════════════════════════════════════════════════════════════════════
*/
const GATEWAY_CALLBACK_PREFIX = '/shop/payment/';

async function bootstrap() {
  /*
    rawBody: WhatsApp signs the exact bytes it sent. Re-serialising the parsed
    JSON changes whitespace and key order, and the signature then never
    matches — which would leave the webhook open or permanently closed.
  */
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const allowed = corsOrigins();
  const isProd = process.env.NODE_ENV === 'production';

  /*  The (req, cb) form rather than a plain options object — it is the only
      one that can see the PATH, and the exemption above is decided by path.  */
  app.enableCors((req: Request, cb) => {
    const origin = req.headers.origin;
    const path = req.path ?? '';

    const ok = (allow: boolean) => cb(null, { origin: allow, credentials: true });

    // No Origin header means it is not a browser — server-to-server, curl, a
    // webhook (SSLCommerz's IPN arrives this way). CORS is not for them.
    if (!origin) return ok(true);

    // The gateway's landing routes — see the long note above.
    if (path.startsWith(GATEWAY_CALLBACK_PREFIX)) return ok(true);

    if (allowed.includes(origin.replace(/\/+$/, ''))) return ok(true);

    // In dev warn but keep working; in production actually refuse.
    if (!isProd) {
      console.warn(`[CORS] unknown origin allowed (dev only): ${origin}`);
      return ok(true);
    }
    console.warn(`[CORS] blocked: ${origin} (${path})`);
    return ok(false);
  });

  console.log(`[CORS] allowed: ${allowed.join(', ')}`);

  /*  A database constraint must never reach the screen as "Internal server
      error" — see prisma-exception.filter.ts (owner, 20 Aug).  */
  app.useGlobalFilters(new PrismaExceptionFilter());

  // ⚠️ Render/Railway inject PORT themselves - setting it by hand means they
  // cannot find the app ("Application failed to respond"). And without
  // '0.0.0.0' requests from outside the container are never heard.
  const port = process.env.PORT ?? 4000;
  await app.listen(port, '0.0.0.0');
  console.log(
    `[Radian API] listening on ${port} (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`,
  );
}
bootstrap();
