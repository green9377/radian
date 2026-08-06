# Messenger ও Instagram DM — Radian Inbox

_৬ আগস্ট ২০২৬。 WhatsApp-এর সেটআপ আলাদা ফাইলে: `RADIAN_WHATSAPP_SETUP.md`。_

---

## ১. এক লাইনে

Facebook Page-এ আসা message আর Instagram-এর DM — দুটোই একই webhook দিয়ে
Radian-এর Inbox-এ আসে, আর staff বা AI-এর উত্তর একই পথে ফিরে যায়।
**Comment ধরা হয় না** (মালিকের সিদ্ধান্ত, ৬ আগস্ট): comment প্রকাশ্য,
DM নয় — দুটোর জবাব দেওয়ার ধরনও আলাদা। এক তালিকায় মেশালে একই কাজ মনে হবে。

---

## ২. কেন এক ChannelSender

আগে বাইরে পাঠানোর কোড ছিল **শুধু staff-এর reply পথে**。 ফলে AI যখন উত্তর
লিখত, সেটা database-এ জমা হতো কিন্তু গ্রাহকের কাছে পৌঁছাত না。 Web chat-এ
ধরা পড়ত না — কারণ সেখানে গ্রাহকের browser নিজেই বারবার এসে দেখে。 বাকি সব
চ্যানেলে বার্তা লেখা হতো, রাখা হতো, আর কখনো যেত না。

তাই `apps/api/src/messaging/channel-sender.service.ts` — **বাইরে যাওয়ার
একটাই দরজা**。 নতুন চ্যানেল যোগ করা মানে এখানে একটা `case` যোগ করা,
message লেখে এমন প্রতিটা জায়গা খুঁজে বেড়ানো নয়。

| চ্যানেল | কীভাবে যায় |
|---|---|
| `WEB_CHAT` | কিছু পাঠাতে হয় না — browser নিজে এসে নেয় |
| `WHATSAPP` | `WhatsAppCloudService.sendRaw()` |
| `MESSENGER` | `POST graph.facebook.com/v25.0/me/messages`, Page token |
| `INSTAGRAM` | `POST graph.instagram.com/v23.0/<ig-id>/messages`, **Instagram-এর নিজের token** |

---

## ৩. ফাইল কোথায়

| ফাইল | কাজ |
|---|---|
| `messaging/meta-webhook.ts` | `GET/POST /webhooks/meta` — দুই object একসাথে |
| `messaging/channel-sender.service.ts` | বাইরে পাঠানোর একমাত্র জায়গা |
| `inbox/inbox.ts` → `reply()` | staff-এর উত্তর |
| `inbox/ai-agent.ts` → `say()` | AI-এর উত্তর |

দুটো object, একটাই endpoint: Meta Messenger-এর জন্য `object: "page"` আর
Instagram-এর জন্য `object: "instagram"` পাঠায়, ভেতরের গঠন এক。

**Echo বাদ** — `message.is_echo` মানে আমাদের নিজের পাঠানো বার্তা ফেরত
আসছে。 রাখলে প্রতিটা reply দুবার দেখাত, আর AI নিজের সাথে কথা বলা শুরু করত。

**নাম** — Meta ফোন নম্বর দেয় না, দেয় page-scoped id (PSID)。 তাই Page
token দিয়ে আলাদা করে profile name আনা হয়। না এলে thread নামহীন থাকে —
বার্তা আটকে রাখার মতো জিনিস নয়。

---

## ৪. Meta-র দিকে যা করা হয়েছে

App: **Radian** (`1720041072657899`) · Page: **Radian Flower & Gift Shop**
(`341678165697164`)

1. Use cases → **Messenger** + **Instagram messaging** যোগ
2. Messenger → Configure webhooks
   - Callback URL `https://radian-api-qnt6.onrender.com/webhooks/meta`
   - Verify token — **WhatsApp-এরটাই**, কোড একটাই token পড়ে
3. Page যুক্ত → subscribe: `messages`, `messaging_postbacks` → **Generate** token
4. Instagram → **API setup with Instagram login** → **Add account** →
   Instagram-এ login করে অনুমতি দেওয়া → token তৈরি
5. ওই পাতাতেই Configure webhooks — একই URL ও verify token → `messages`
6. Radian Admin → Integrations → Social →
   **Facebook Page** (Page ID + Page token) এবং
   **Instagram Business** (account ID + Instagram token + Instagram app secret)
   — দুটোই **Switch on**

---

## ৫. ফাঁদ

| ফাঁদ | কী হয় | করণীয় |
|---|---|---|
| **Instagram login বনাম Facebook login** | দুটো আলাদা পরিবার, বদলাবদলি হয় না。 **প্রথমে Facebook login বেছেছিলাম** — সব ঠিকমতো বসানোর পরেও Meta একটাও webhook পাঠায়নি, কারণ ওই পথে কোনো Instagram account app-কে অনুমতিই দেয়নি; অনুমতি দিতে Login-for-Business flow বানাতে হতো | **Instagram login** — "Add account" এক ক্লিক。 শর্ত ছিল app published থাকা, আর Radian-এর app আগে থেকেই Live |
| **Instagram-এর signature আলাদা secret-এ** | Facebook app secret দিয়ে মেলে না, webhook চুপচাপ ফেরত যায় | `signatureOk()` দুটো secret-ই মিলিয়ে দেখে |
| **Page token দিয়ে Instagram-এ পাঠানো** | recipient id Instagram account-এর নিজস্ব, Page token সেখানে অচল | আলাদা `sendInstagram()` |
| **Callback URL বসানোর আগে subscribe** | "Webhook subscription failed" | আগে URL verify, তারপর field |
| **Verify token-এর ঘরে access token** | verify ফেল | দুটো আলাদা জিনিস: verify token আমরা বানাই, access token Meta দেয় |
| **Render ফ্রি server ঘুমায়** | প্রথম verify ফেল হতে পারে | সাথে সাথে আবার চাপো (~৫০ সেকেন্ডে জাগে) |
| **নিজের Page ছাড়া অন্য Page subscribe** | অন্যের Page-এর message আমাদের Inbox-এ | শুধু Radian-এর Page |
| **Instagram "Allow access to messages" বন্ধ** | Page-এ সব ঠিক, তবু DM আসে না | Instagram app-এর ভেতরের সুইচ |
| **App Live মানেই সবার সাথে চলবে নয়** | সীমাটা mode-এর নয়, permission-এর — `pages_messaging` standard access-এ থাকলে শুধু app-এ ভূমিকা আছে এমন লোকের সাথে চলে | সাধারণ গ্রাহকের জন্য **App Review** — cutover-এর কাজ |
| **২৪ ঘণ্টার জানালা** | গ্রাহকের শেষ বার্তার ২৪ ঘণ্টা পরে free text Meta ফিরিয়ে দেয় | ব্যর্থতা log-এ ওঠে, চুপ করে হারায় না |

---

## ৬. যা এখনো বাকি

- **App Review** — `pages_messaging`, `instagram_manage_messages`-এ advanced
  access。 এটা ছাড়া সাধারণ গ্রাহকের বার্তা আসবে না
- **`messaging_referral`** — Click-to-Messenger বিজ্ঞাপন থেকে আসা গ্রাহক চেনা
  (WhatsApp-এর `ctwa_clid`-এর সমতুল্য)。 বিজ্ঞাপন শুরু হলে দরকার হবে
- ছবি/স্টিকার এখন `[image]` হিসেবে জমা হয় — দেখানোর ব্যবস্থা পরে
