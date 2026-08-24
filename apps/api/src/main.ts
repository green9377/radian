import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
/*  One list of our own addresses, shared with the cache ping — see the note in
    that file for why it stopped being two.  */
import { corsOrigins } from './common/web-origins';

// BigInt (Customer.ltvPaisa) JSON-serialize safety net — নইলে response throw করে।
// (service response-এ ltvPaisa Number-এ map করা হয়; এটা fallback।)
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

/*  কোন কোন সাইট ব্রাউজার থেকে এই API ডাকতে পারবে।

    আগে এখানে খালি `app.enableCors()` ছিল — মানে পৃথিবীর যেকোনো ওয়েবসাইট
    ভিজিটরের ব্রাউজার দিয়ে আমাদের API-তে কল করতে পারত। লোকালে ওটা নিরীহ,
    ইন্টারনেটে নয়।

    এখন তালিকা তিন জায়গা থেকে আসে:
      • PUBLIC_WEB_URL   — গ্রাহকের দোকান (apps/web)
      • PUBLIC_ADMIN_URL — admin panel (apps/admin)
      • CORS_ORIGINS     — বাড়তি কিছু লাগলে, কমা দিয়ে আলাদা করা
    এর সাথে লোকাল dev-এর :3000 আর :3001 সবসময় খোলা।

    ⚠️ Production-এ এগুলোর একটাও সেট না থাকলে API চালু হবে কিন্তু admin/web
    ফাঁকা দেখাবে। তাই boot-এর সময় তালিকাটা log-এ ছাপা হয় — deploy-এর পরে
    log-এ "[CORS] allowed:" লাইনটা মিলিয়ে দেখুন।  */

async function bootstrap() {
  /*
    rawBody: WhatsApp signs the exact bytes it sent. Re-serialising the parsed
    JSON changes whitespace and key order, and the signature then never
    matches — which would leave the webhook open or permanently closed.
  */
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const allowed = corsOrigins();
  const isProd = process.env.NODE_ENV === 'production';

  app.enableCors({
    origin: (origin, cb) => {
      // Origin header নেই মানে ব্রাউজার নয় — server-to-server, curl, webhook
      // (SSLCommerz-এর IPN এভাবেই আসে)। CORS তাদের জন্য নয়, তাই পাস।
      if (!origin) return cb(null, true);
      if (allowed.includes(origin.replace(/\/+$/, ''))) return cb(null, true);

      // dev-এ শুধু সতর্ক করি, কাজ থামাই না। production-এ সত্যিই আটকাই।
      if (!isProd) {
        console.warn(`[CORS] unknown origin allowed (dev only): ${origin}`);
        return cb(null, true);
      }
      return cb(new Error(`[CORS] blocked: ${origin}`), false);
    },
    credentials: true,
  });

  console.log(`[CORS] allowed: ${allowed.join(', ')}`);

  /*  A database constraint must never reach the screen as "Internal server
      error" — see prisma-exception.filter.ts (owner, 20 Aug).  */
  app.useGlobalFilters(new PrismaExceptionFilter());

  // ⚠️ Render/Railway নিজেরাই PORT ঢুকিয়ে দেয় — হাতে PORT সেট করলে তারা app
  // খুঁজে পায় না ("Application failed to respond")। আর '0.0.0.0' না দিলে
  // container-এর বাইরে থেকে আসা request শোনা যায় না।
  const port = process.env.PORT ?? 4000;
  await app.listen(port, '0.0.0.0');
  console.log(
    `[Radian API] listening on ${port} (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`,
  );
}
bootstrap();
