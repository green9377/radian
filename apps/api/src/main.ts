import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

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
function corsOrigins(): string[] {
  const trim = (s: string) => s.trim().replace(/\/+$/, '');
  const fromEnv = [
    process.env.PUBLIC_WEB_URL,
    process.env.PUBLIC_ADMIN_URL,
    ...(process.env.CORS_ORIGINS ?? '').split(','),
  ]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map(trim);

  const localDev = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ];

  /*  ৪ আগস্ট, demo deploy-এর রাতে শেখা: Render dashboard-এ env var-এর ঘরে
      মান বসানো হয়েছে মনে হলেও save না-ও হতে পারে — form-টা মুখোশ-পরা
      (masked) value দেখায়, তাই ভুলটা চোখেও পড়ে না। PUBLIC_WEB_URL সেভাবে
      দু'বার হারিয়ে গ্রাহকের দোকান CORS-এ আটকে ফাঁকা হয়ে ছিল, অথচ API আর
      admin দুটোই সুস্থ দেখাচ্ছিল।

      Demo-র ঠিকানা দুটো স্থির ও প্রকাশ্য — এগুলো env-এর উপর নির্ভর না করে
      এখানে fallback হিসেবে থাকল। Real deploy-এর নিজের domain যথারীতি
      PUBLIC_WEB_URL/PUBLIC_ADMIN_URL env দিয়েই আসবে; এই তালিকা তখনও নিরীহ,
      কারণ demo সাইট দুটোও আমাদেরই।  */
  const demoFallback = [
    'https://radian-web-tan.vercel.app',
    'https://radian-admin.vercel.app',
  ];

  return Array.from(new Set([...fromEnv, ...localDev, ...demoFallback]));
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
