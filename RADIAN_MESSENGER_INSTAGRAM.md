# Messenger ও Instagram DM — Radian Inbox

_৭ আগস্ট ২০২৬。 WhatsApp-এর সেটআপ আলাদা ফাইলে: `RADIAN_WHATSAPP_SETUP.md`。_
_অবস্থা: **Messenger ও Instagram দুটোই দুই দিকে কাজ করছে** — পরীক্ষা হয়েছে ৭ আগস্ট。_

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

**নাম** — Meta ফোন নম্বর দেয় না, দেয় scoped id。 তাই আলাদা করে নাম আনা
হয় — Messenger-এ Page token দিয়ে `name`, Instagram-এ Instagram token দিয়ে
`name,username`。 না এলে thread নামহীন থাকে; নামের জন্য বার্তা আটকে রাখা হয় না。

---

## ৪. Meta-র দিকে যা করা হয়েছে

App: **Radian** (`1720041072657899`) · Page: **Radian Flower & Gift Shop**
(`341678165697164`)

1. Use cases → **Messenger** + **Instagram messaging** যোগ
2. Messenger → Configure webhooks
   - Callback URL `https://api.development.radianbd.com/webhooks/meta`

     > ⚠️ **CHANGED 30 Aug 2026 — change it in Meta as well.** This pointed at
     > `radian-api-qnt6.onrender.com`, dead since the VPS move. A webhook on a
     > dead host fails silently: Messenger and Instagram messages simply stop
     > arriving, with nothing in any log to say so.
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
| **App Live মানেই সবার সাথে চলবে নয়** | সীমাটা mode-এর নয়, permission-এর — standard access-এ থাকলে শুধু app-এ ভূমিকা আছে এমন লোকের সাথে চলে | সাধারণ গ্রাহকের জন্য **App Review** — cutover-এর কাজ |
| **app ID আর account ID গুলিয়ে ফেলা** | Instagram app ID (`1553139576608598`) আর account ID (`17841467082693222`) দুটো আলাদা; ভুলটা পাঠানোর সময় ধরা পড়ে | পাঠানোর জন্য **account ID** |
| **২৪ ঘণ্টার জানালা** | গ্রাহকের শেষ বার্তার ২৪ ঘণ্টা পরে free text Meta ফিরিয়ে দেয় | ব্যর্থতা log-এ ওঠে, চুপ করে হারায় না |

---

## ৫ক. "Guest" নাম ও duplicate thread — সমাধান (৭ আগস্ট সকাল)

সকালে মালিক দুটো সমস্যা দেখালেন: Messenger-এ নাম আসে না (Instagram-এ আসে),
আর Instagram-এর একজনের প্রতিটা বার্তায় নতুন thread。 তিনটে সংশোধন:

| সমস্যা | কারণ | সমাধান |
|---|---|---|
| **Messenger-এ "Guest"** | `name` field চাওয়া হতো; অনেক Page token শুধু `first_name`/`last_name` দেয় | এখন তিনটেই চাওয়া হয়, যেটা আসে সেটাই |
| **প্রতি বার্তায় নতুন thread** | find-then-create — Meta একসাথে কয়েকবার পাঠালে সবাই "নেই" দেখে বানিয়ে ফেলত | **ডেটাবেজে partial unique index** — এক (channel, identity)-তে একটাই জ্যান্ত thread সম্ভব。 race হারলে কোড বিজয়ীটা ব্যবহার করে |
| **ফাঁকা "—" thread** | thread বানানোর *পরে* duplicate বার্তা ধরা পড়ত — ফাঁকা thread পড়ে থাকত | duplicate check এখন thread lookup-এর *আগে* |

Migration `20260807090000_one_thread_per_identity` পুরনো duplicate গুলোও
জোড়া লাগায়: সব বার্তা সবচেয়ে পুরনো thread-এ, বাকিগুলো soft delete,
কোনো বার্তা হারায় না。 আর পুরনো "Guest" thread-এ পরের বার্তা এলে নাম
আবার চেষ্টা করা হয়。

### খোলা প্রশ্ন যেটা রয়ে গেল

Inbox-এ দুটো Messenger thread: একটায় নাম এসেছে (**Md Borhan Uddin** — app-এর
admin), আরেকটায় আসেনি (**Guest** — সাধারণ একজন)。 Instagram-এ username
এসেছে。

**সম্ভাব্য কারণ:** standard access-এ Meta বার্তা আটকায় না, কিন্তু সাধারণ
ব্যবহারকারীর **প্রোফাইল তথ্য** দেয় না。 তাহলে App Review পাশ হলে নামও
আসতে শুরু করবে。

**তবে এটা এখনো অনুমান।** কোড ব্যর্থতা চুপচাপ গিলে ফেলত, তাই Meta-র নিজের
কারণটা জানা যেত না。 **৭ আগস্ট রাতে log যোগ করা হয়েছে** — এখন ব্যর্থ হলে
Meta-র status code ও বার্তা log-এ উঠবে。

⚠️ পরের আসল Messenger বার্তার পরে Render-এর log-এ
`no profile for MESSENGER ... (403): ...` জাতীয় লাইন খুঁজতে হবে。 তখনই
সত্যিটা জানা যাবে。 (Meta-র "Send to server" test button দিয়ে হবে না —
ওটা আমাদের server-এ পৌঁছায়ই না, দুবার পরীক্ষা করে দেখা গেছে。)

---

## ৫খ. মোবাইল থেকে সরাসরি reply — সমাধান (৮ আগস্ট)

মালিক ধরলেন: ফোনের Messenger/Instagram app থেকে সরাসরি reply দিলে সেটা
Radian Admin-এ **আসত না**, থ্রেড উত্তরহীন দেখাত।

**কারণ:** Meta যা-ই পাঠাই — Radian দিয়ে বা ফোন থেকে সরাসরি — সবকিছুর একটা
**echo** ফেরত পাঠায় webhook-এ (`is_echo: true`)। আগের কোড সব echo-ই ফেলে
দিত, কারণ Radian দিয়ে পাঠানো reply তো নিজেই আগে থেকে save করা থাকে —
echo-টা রাখলে duplicate হতো। কিন্তু এতে ফোন থেকে সরাসরি পাঠানো reply-ও
হারিয়ে যেত — Radian সেটা কখনোই জানত না।

**সমাধান — echo-কে দুই ভাগে চেনা:**

1. Radian দিয়ে পাঠানো reply-র সাথে Meta-র নিজের message id সাথে সাথে
   জুড়ে দেওয়া হয় (`channel-sender.service.ts` এখন `message_id` ফেরত দেয়,
   `inbox.ts`/`ai-agent.ts` সেটা নিজের সেভ করা row-তে বসিয়ে দেয়)
2. Echo এলে সেই id দিয়ে খোঁজা হয় — পাওয়া গেলে (মানে Radian-ই পাঠিয়েছিল)
   কিছু করা হয় না, বাদ। **না পাওয়া গেলে** (মানে ফোন থেকে সরাসরি গেছে) —
   সেটা এখন **নতুন OUT message হিসেবে thread-এ বসে**, "Staff" নামে

⚠️ Echo-তে sender/recipient উল্টো — `sender` মানে আমাদের নিজের Page/IG
account, `recipient` মানে গ্রাহক। `onMessage()`-এর উল্টো, তাই আলাদা
`onEcho()` মেথড।

WhatsApp-এর জন্য এখনো এই সমস্যা প্রযোজ্য না — আসল নম্বর এখনো Coexistence-এ
যায়নি (§৬-এর বাকি কাজ)। যাওয়ার পরে একই প্রশ্ন উঠবে, তখন আবার দেখা লাগবে।

---

## ৬. যা এখনো বাকি

- **App Review** — `pages_messaging` ও `instagram_business_manage_messages`-এ
  advanced access。 এটা ছাড়া সাধারণ গ্রাহকের বার্তা আসবে না — এখন শুধু app-এ
  ভূমিকা আছে এমন account-এর সাথে চলে
- **`messaging_referral`** — Click-to-Messenger বিজ্ঞাপন থেকে আসা গ্রাহক চেনা
  (WhatsApp-এর `ctwa_clid`-এর সমতুল্য)。 বিজ্ঞাপন শুরু হলে দরকার হবে
- ছবি/স্টিকার এখন `[image]` হিসেবে জমা হয় — দেখানোর ব্যবস্থা পরে
