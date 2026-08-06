# Radian — WhatsApp Business API সংযোগ (ধাপে ধাপে)

> ৬ আগস্ট ২০২৬। মালিকের সিদ্ধান্ত: **সরাসরি Meta Cloud API** (কোনো BSP নয়),
> **আগে Demo-তে**, তারপর Real।
>
> এই ফাইলটা মালিকের হাতের কাজের তালিকা — Meta-র পর্দায় যা যা করতে হবে।
> কোডের অংশ আলাদা করে চিহ্নিত ("আমার কাজ")।

---

## ০. আগে একটা ভুল ধরিয়ে দেই — নাহলে ৩ দিন নষ্ট হবে

| জিনিস | কী করে | Radian-এ চলবে? |
|---|---|---|
| WhatsApp **Messenger** (সাধারণ অ্যাপ) | ব্যক্তিগত | ❌ |
| WhatsApp **Business App** (সবুজ অ্যাপ, ফোনে) | হাতে টাইপ করে উত্তর | ❌ **API নেই** |
| WhatsApp **Business Platform / Cloud API** | সার্ভার নিজে বার্তা পাঠায় | ✅ **এটাই লাগবে** |

দোকানের লোকেরা প্রায়ই Business App নামিয়ে ভাবে API হয়ে গেছে। হয় না।
আমাদের লাগবে তৃতীয়টা — `developers.facebook.com` থেকে।

---

## ১. শুরুর আগে যা হাতে থাকতে হবে

| # | লাগবে | সতর্কতা |
|---|---|---|
| ১ | **Facebook Business account** (business.facebook.com) | Radian-এর Page-টা যে account-এ, সেটাই |
| ২ | **একটা আলাদা ফোন নম্বর** | ⚠️ **এই নম্বরে WhatsApp চলতে পারবে না।** আগে থেকে WhatsApp/Business App-এ থাকলে সেখান থেকে account **delete** করতে হবে (Settings → Account → Delete my account), তারপর ২৪-৪৮ ঘণ্টা অপেক্ষা। **দোকানের যে নম্বরে এখন গ্রাহক ফোন করে, সেটা দেবেন না** — নতুন একটা SIM নিন |
| ৩ | নম্বরটায় **SMS বা কল আসবে** | OTP আসবে |
| ৪ | **Trade licence + মালিকের NID** | Business verification-এ Meta চাইবে |
| ৫ | **কার্ড (USD চার্জ হবে)** | Meta ডলারে বিল করে। BD কার্ডে international transaction খোলা থাকতে হবে |
| ৬ | Radian-এর **ওয়েবসাইট live** | verification-এ ঠিকানা/ওয়েবসাইট মিলতে হয় |

**সময়:** চাবি পেতে ১–২ ঘণ্টা। Business verification ১–৫ কর্মদিবস।
Template approval সাধারণত কয়েক মিনিট–কয়েক ঘণ্টা।

---

## ২. Meta-র পর্দায় ধাপে ধাপে

### ধাপ ১ — App বানানো
১. `developers.facebook.com` → **My Apps** → **Create App**
২. Use case: **Other** → App type: **Business**
৩. নাম: `Radian` · Business portfolio: Radian-এরটা বেছে নিন
৪. App তৈরি হলে → **Add product** → **WhatsApp** → **Set up**

### ধাপ ২ — WABA (WhatsApp Business Account)
Setup-এ ঢুকলে Meta নিজেই একটা **WABA** আর একটা **test number** বানিয়ে দেবে।
এখানেই পাবেন:

- **Phone number ID** ← এটা লাগবে
- **WhatsApp Business Account ID**
- **Temporary access token** (২৪ ঘণ্টা — টেস্টের জন্য, স্থায়ীটা ধাপ ৪-এ)

> 💡 **Demo-র জন্য এই test number-ই যথেষ্ট।** ফ্রি, আর সঙ্গে সঙ্গে কাজ করে।
> সীমা: শুধু **৫টা নম্বরে** পাঠানো যায় (আগে থেকে যোগ করা লাগে) — মালিক,
> ম্যানেজার আর টেস্টারদের নম্বর দিয়ে দিন। আসল নম্বর Real-এর সময়।

### ধাপ ৩ — আসল নম্বর যোগ (এটা Real-এর জন্য, Demo-তে বাদ দিন)
API Setup → **Add phone number** →
Display name (`Radian`) · Category (`Shopping & retail`) · Time zone (Dhaka) →
নম্বর দিন → SMS/কল-এ OTP → **6-digit two-step PIN** বসান।

> ⚠️ **PIN-টা লিখে রাখুন।** ভুলে গেলে নম্বর অন্য কোথাও সরানো যায় না,
> আর Meta support থেকে ফেরত পেতে ভোগান্তি।

### ধাপ ৪ — স্থায়ী token (System user) — **সবচেয়ে গুরুত্বপূর্ণ ধাপ**
Temporary token ২৪ ঘণ্টায় মরে যায়। সকালে টেস্ট পাশ, রাতে সব বার্তা বন্ধ —
এই ফাঁদে বহু লোক পড়ে।

১. `business.facebook.com/latest/settings` → **System users** → **Add**
   নাম: `radian-api` · role: **Admin**
২. ওই user বেছে → **Assign assets** → **Apps** → Radian app → *Manage app* ✅
৩. আবার → **Assign assets** → **WhatsApp accounts** → Radian WABA → পুরো access ✅
৪. **Generate new token** → App: Radian → Expiration: **Never** →
   permission টিক দিন: `whatsapp_business_messaging` + `whatsapp_business_management`
৫. token-টা কপি করুন — **একবারই দেখাবে**

### ধাপ ৫ — Template approval
Meta-র নিয়ম: ব্যবসা আগ বাড়িয়ে বার্তা পাঠালে সেটা **অনুমোদিত template**
হতেই হয়। সাধারণ লেখা কেবল গ্রাহকের বার্তার ২৪ ঘণ্টার ভেতরে চলে।

**WhatsApp Manager → Message templates → Create template।**
ছয়টাই **§৩ক**-তে হুবহু লেখা আছে — নাম, category, body, button। কোডে ওই
নামগুলোই বসানো (`apps/api/src/common/whatsapp-cloud.ts`)।

> ⚠️ **Language অবশ্যই `English` — `English (US)` নয়।** কোড `en` পাঠায়;
> `en_US`-এ approve করালে Meta "template not found" দেবে, আর কারণটা
> খুঁজে বের করতে আধ দিন যাবে।
>
> ⚠️ **Category `Utility` রাখুন, `Marketing` নয়।** Utility অনেক সস্তা,
> আর order-এর খবর সত্যিই utility। Marketing দিলে বেশি টাকা কাটবে
> এবং opt-out নিয়মে আটকাতে পারে।
>
> 💡 এখনই approve করাতে দিন — চাবি বসানোর আগেই। অনুমোদনে সময় লাগে।

### ধাপ ৬ — Radian admin-এ চাবি বসানো ✅ *(এই পর্দা বানানো আছে)*
**Admin → Administration → Integrations → Messaging → WhatsApp Business API**

| ঘর | কী বসাবেন |
|---|---|
| Phone number ID | ধাপ ২/৩-এর Phone number ID |
| Permanent access token | ধাপ ৪-এর token |
| App secret | App → Settings → Basic → App secret *(webhook-এর জন্য, পরে)* |
| Webhook verify token | নিজের বানানো একটা গোপন শব্দ *(পরে)* |

**Enabled** টিক দিয়ে save → পাশের **Test** বোতাম চাপুন → নিজের নম্বর দিন।
ফোনে `hello_world` এলে সংযোগ ঠিক আছে।

> এই test Meta-র নিজের pre-approved template পাঠায়, তাই ধাপ ৫-এর
> approval না হলেও কাজ করে — অর্থাৎ **চাবি ঠিক কিনা এখনই জানা যায়**।

---

## ৩. Radian-এর দিকে কী আছে, কী নেই

| কাজ | অবস্থা | কী বাকি |
|---|---|---|
| Order confirm · out-for-delivery · delivered বার্তা | ✅ **কোড আছে** (`whatsapp-cloud.ts`) | শুধু ধাপ ১–৬ |
| Admin-এ চাবি বসানো + Test বোতাম | ✅ **আছে** | — |
| Marketing broadcast | ⚠️ এখন **click-to-chat** (একজন করে হাতে পাঠানো, খরচ শূন্য) | API broadcast করতে হলে নতুন কোড + Marketing module-এর opt-out নিয়মে বাঁধা |
| গ্রাহকের বার্তা → admin Inbox (webhook) | ❌ **কোড নেই** | Inbox Phase 3। webhook controller + AI উত্তর |
| WhatsApp OTP / login | ❌ কোড নেই | আলাদা `authentication` template |

**আমার প্রস্তাবিত ক্রম** (ঘরের নিয়ম — একবারে একটা):

1. **এখন:** ধাপ ১–৬ → order-এর বার্তা Demo-তে চালু, নিজের ফোনে যাচাই
2. **তারপর:** webhook — গ্রাহকের বার্তা Inbox-এ আসা *(আমার কাজ, আপনার অনুমোদনের পর)*
3. **তারপর:** OTP
4. **সবশেষে:** marketing broadcast — খরচ সবচেয়ে বেশি, তাই আগে বাকিগুলোতে
   বিল কেমন আসে দেখে নেওয়া ভালো

---

## ৪. খরচ (২০২৬)

- ১ জুলাই ২০২৫ থেকে Meta **প্রতি বার্তায়** টাকা নেয় (আগের ২৪-ঘণ্টা
  conversation হিসাব উঠে গেছে)।
- দাম নির্ভর করে **category**-তে: Marketing সবচেয়ে দামি;
  Utility আর Authentication অনেক সস্তা।
- ⚠️ **১ অক্টোবর ২০২৬ থেকে বাংলাদেশের আলাদা rate card** — utility ও
  authentication-এর দাম কমছে। কিন্তু একই দিনে **২৪-ঘণ্টার জানালার ভেতরের
  utility ও service বার্তাও টাকা কাটা শুরু হবে** (এতদিন ফ্রি ছিল)।
  Inbox/AI চালু করার আগে এটা হিসাবে ধরতে হবে।
- সরাসরি Meta-য় যাচ্ছি বলে কোনো BSP-র markup নেই।

আসল হার: [Meta pricing page](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)।

---

## ৫. ফাঁদ (আগেই বলে রাখি)

| ফাঁদ | ফল | করণীয় |
|---|---|---|
| দোকানের চালু নম্বর API-তে দেওয়া | ওই নম্বরের WhatsApp Business App বন্ধ হয়ে যাবে, পুরনো চ্যাট হারাবে | নতুন SIM |
| Temporary token বসিয়ে ফেলা | ২৪ ঘণ্টা পর সব বার্তা নীরবে বন্ধ | System user token, expiry **Never** |
| Template `English (US)`-এ approve | "template not found" | `English` (`en`) |
| Template category `Marketing` | বেশি বিল | `Utility` |
| Business verification না করা | দিনে সীমিত নম্বরে পাঠানো যাবে (250) | trade licence দিয়ে verification |
| চাবি `.env`-এ রাখা | deploy-এ বদলাতে ভুল হয় | **Admin → Integrations**-এ রাখুন (`.env` শুধু fallback) |
| ২-step PIN হারানো | নম্বর সরানো যায় না | লিখে রাখুন |

---

## ৩ক. Template — সবগুলো, হুবহু

> WhatsApp Manager → (WABA বাছুন) → Message templates → Create template।
> নাম **হুবহু** মিলতে হবে — কোডে এই নামগুলোই বসানো/বসবে।
> Language সবসময় **English** (`en`), **English (US) নয়**।

### ছয়টা template — হুবহু (মালিকের অনুমোদিত লেখা, ৬ আগস্ট)

⚠️ **প্রতিটায় `{{1}}` = গ্রাহকের নাম, `{{2}}` = order নম্বর** — এক ক্রম।
Meta-র নিয়মে লেখায় `{{1}}` অবশ্যই `{{2}}`-এর আগে আসতে হবে, আর template-ভেদে
ক্রম বদলালে একদিন কারও কাছে নামের জায়গায় order নম্বর চলে যেত।

⚠️ **"Radian" শব্দটা লেখায় নেই** — WhatsApp-এ বার্তার উপরে ব্যবসার নাম
এমনিতেই দেখায়। প্রতি লাইনে নাম বসানো বিজ্ঞাপনের মতো শোনায়, দোকানের মতো নয়
(মালিকের নির্দেশ)।

⚠️ **উষ্ণ, কিন্তু বেশি নয়।** খুব আবেগী লেখা Meta-কে Utility থেকে Marketing-এ
ফেলে দেয় — তখন দাম বাড়ে আর opt-out নিয়মে আটকায়।

| নাম | Category | Body | Button |
|---|---|---|---|
| `order_confirmation` | Utility | `Thank you, {{1}}. Your order {{2}} is confirmed and we are getting it ready. Total {{3}}. We will message you the moment it leaves our shop.` | — |
| `order_confirmation_cod` | Utility | `Thank you, {{1}}. We have received your order {{2}} — {{3}}, payable when it arrives. One of our team will call you shortly to confirm the details.` | — |
| `order_out_for_delivery` | Utility | `Good news, {{1}} — order {{2}} has just left our shop and is on its way.` | — |
| `order_delivered` | Utility | `{{1}}, your order {{2}} has been delivered. We hope it brought a smile. Thank you for trusting us with it.` | — |
| `payment_failed` | Utility | `{{1}}, we are holding your order {{2}} — the payment did not come through. {{3}} is still due. You can finish it below, or call {{4}} and we will take care of it for you.` | URL (dynamic): `https://radianbd.com/pay/{{1}}` |
| `checkout_abandoned` | **Marketing** ⚠️ | `{{1}}, what you chose is still waiting in your basket. Pick up where you left off below, or call {{2}} and we will help you finish it.` | URL (dynamic): `https://radianbd.com/cart/{{1}}` |

Language: **English** (`en`) — `English (US)` নয় (DEC-WA-006)।
Domain: **radianbd.com** (মালিক, ৬ আগস্ট — আগে ভুল করে `radian.com.bd` লেখা ছিল)।

**দুটো সতর্কতা:**

⚠️ `checkout_abandoned` **Marketing** category — Meta-র নিজের নিয়ম, ইচ্ছেমতো
Utility দেওয়া যায় না। মানে: দাম বেশি, আর **opt-out নিয়ম মানতে হবে**।
Marketing module-এর Outreach খাতা আর opt-out তালিকার ভেতর দিয়ে যেতে হবে
(MKT-D07/D18) — নাহলে একদিন opt-out করা গ্রাহকের কাছে promo চলে যাবে।

⚠️ `payment_failed` আর `order_confirmation_cod` **Utility** থাকতে পারে,
কারণ দুটোই গ্রাহকের নিজের শুরু করা একটা নির্দিষ্ট order নিয়ে কথা।

### ভাষা — এখনো সিদ্ধান্ত হয়নি

সবগুলো ইংরেজিতে লেখা, কারণ কোডে `en` বসানো। গ্রাহক বাংলাদেশের, তাই বাংলা
বার্তা বেশি কাজ করার কথা। বাংলা চাইলে `bn`-এ **আলাদা করে approve** করাতে
হবে আর কোডে ভাষা বদলাতে হবে — মালিকের সিদ্ধান্তের অপেক্ষায়।

---

## ৪ক. নম্বরের সিদ্ধান্ত — **DEC-WA-001** (৬ আগস্ট ২০২৬)

> **দোকানের নম্বর `+880 1519-779378` কখনো API-তে "সরানো" হবে না।
> Coexistence দিয়ে যুক্ত হবে।**

> 🛑 **লাল রেখা (মালিক, ৬ আগস্ট):** `+880 1519-779378` চালু ব্যবসা।
> ওই নম্বরের WhatsApp Business App বন্ধ হলে দোকান বন্ধ হওয়ার সমান।
>
> **যা কখনো করা যাবে না:**
> - ওই নম্বর কোনো WABA-তে `Add phone number` দিয়ে register করা
> - ফোনের অ্যাপ থেকে ওই account delete করা
> - Coexistence ছাড়া অন্য কোনো পথে ওই নম্বর Cloud API-তে নেওয়া
>
> কোনো ধাপে `1519-779378` লেখা পর্দায় এলে **থামতে হবে** এবং মালিককে
> জিজ্ঞেস করতে হবে। Coexistence-এও নম্বরটা অ্যাপে থেকে যায়, এবং
> মালিককে ফোনে নিজের হাতে **Connect** চাপতে হয় — সম্মতি ছাড়া ঘটে না।

### portfolio-তে যা আছে (যাচাই করা, ৬ আগস্ট)

| WABA | ID | নম্বর | কী |
|---|---|---|---|
| Test WhatsApp Business Account | `875194658945705` | `+1 555-653-1804` (Connected) | Meta-র ফ্রি test — **Demo** |
| Radian Flower and Gift shop | `369366439583226` | `+880 1519-779378` (Offline) | দোকানের চালু নম্বর, **WhatsApp Business App**-এ। মেনুতে Message templates নেই = API account নয় |
| Radian Flower & Gift Shop | `1368924051525531` | *ফাঁকা* | পুরোদস্তুর API WABA |

### কেন Coexistence

সাধারণ পথে নম্বর API-তে নিলে ওই নম্বরের Business App **স্থায়ীভাবে বন্ধ**
হয়, পুরনো চ্যাট যায়, আর Cloud API নম্বরের জন্য Meta কোনো inbox দেয় না —
অর্থাৎ **Radian Inbox তৈরি না হওয়া পর্যন্ত কেউ কোনো বার্তার উত্তর দিতে
পারত না।** ফুলের দোকানে এক দিনের নীরবতাও হারানো order।

Coexistence-এ (Meta, মে ২০২৫; doc updated ৪ ফেব্রু ২০২৬):
অ্যাপ ও Cloud API একই নম্বরে চলে · সাম্প্রতিক **১৮০ দিনের** চ্যাট আর
contact sync হয় · অ্যাপে পাঠানো বার্তা `smb_message_echoes` webhook-এ
আসে, দুদিক মিলে থাকে · অ্যাপ থেকে পাঠানো বার্তা **ফ্রি থাকে**, শুধু API
থেকে পাঠানোয় খরচ।

**যা হারাবে:** group chat sync হয় না · broadcast list read-only ·
disappearing message / view once / live location বন্ধ · throughput 20 mps-এ
বাঁধা (আমাদের জন্য যথেষ্ট)। catalog · away message · quick reply · কল —
অ্যাপে অক্ষত।

### শর্ত (এগুলোই কাজের ক্রম ঠিক করে দেয়)

1. Radian-কে **Tech Provider** হতে হবে (App Dashboard → Become a Tech Provider)
2. চাবি হাতে বসানো নয় — **Embedded Signup** flow কোডে লিখতে হবে
   (`featureType: whatsapp_business_app_onboarding`, `sessionInfoVersion: 3`)
3. webhook আগে তৈরি থাকতে হবে, এবং subscribe করতে হবে:
   `messages` + `history` + `smb_app_state_sync` + `smb_message_echoes`
4. onboard-এর পর **২৪ ঘণ্টার মধ্যে** sync শুরু করতে হবে
   (`POST /<PHONE_ID>/smb_app_data`, দুবার: `smb_app_state_sync` তারপর
   `history`) — নাহলে offboard করে আবার শুরু
5. প্রতিটা sync **একবারই** চলে — ভুল করলে গ্রাহককে offboard করে ফের flow

**তাই ক্রম:** Demo (test number) → webhook → Tech Provider → Embedded
Signup → দোকানের নম্বর Coexistence-এ যুক্ত।

---

## ৫ক. Tracking — মালিকের নির্দেশ (৬ আগস্ট ২০২৬)

> "সব setup এমনভাবে করবে যাতে pixel, GTM আর offline tracking — সব ধরনের
> tracking পরে কাজ করে।"

এটা পরে জোড়া লাগানোর জিনিস নয়, এখনকার সিদ্ধান্তেই ঠিক হয়ে যায়:

| # | নিয়ম | কেন |
|---|---|---|
| ১ | **WABA · Pixel/Dataset · Ad account · Page — সব এক portfolio-তে** (`Sobuj business`) | আলাদা হলে click-to-WhatsApp বিজ্ঞাপনের conversion Ads Manager-এ কখনো মিলবে না। পরে সরানো যায়, কিন্তু পুরনো data ফেরত আসে না |
| ২ | **একই system user (`radian-api`)-কে পরে Pixel/Dataset + Ad account asset দেওয়া** | তখন একটাই token দিয়ে Conversions API আর offline conversion পাঠানো যাবে। permission লাগবে: `ads_management`, `business_management` (WhatsApp-এর দুটোর সাথে) |
| ৩ | **`ctwa_clid` (click-to-WhatsApp click id) ধরে রাখা** | বিজ্ঞাপনে ক্লিক করে WhatsApp-এ আসা গ্রাহকের webhook payload-এ `referral` object আসে। না ধরলে "এই order কোন বিজ্ঞাপন থেকে" কোনোদিন বলা যাবে না |

**কোডের দায়:** webhook বানানোর সময় `Conversation`-এ `ctwaClid`,
`adReferralSourceId`, `adReferralHeadline` রাখতে হবে (schema বদল), আর
order তৈরি হলে সেটা Order-এ বয়ে নিতে হবে — নাহলে conversion আর order
জোড়া লাগবে না। বিদ্যমান `marketing/tracking.service.ts`-এর সাথে মিলিয়ে।

---

## ৬খ. তিনটে নতুন বার্তা — মালিকের সিদ্ধান্ত ৬ আগস্ট

> ⚠️ **template approve হওয়া মানেই বার্তা যাওয়া নয়।** নিচের তিনটে মুহূর্তে
> বার্তা পাঠানোর কোনো কোড আজ নেই — এগুলো নতুন feature, schema সহ।

### সিদ্ধান্ত (মালিক, চ্যাটে)

| id | নিয়ম |
|---|---|
| DEC-WA-002 | **Payment fail** হলে বার্তা যাবে — **সাথে সাথে একবার, ২৪ ঘণ্টা পর আরেকবার**। ইতিমধ্যে টাকা এসে গেলে দ্বিতীয়টা যাবে না। |
| DEC-WA-003 | বার্তায় **টাকা দেওয়ার লিংক আর ফোন নম্বর দুটোই** থাকবে — যিনি নিজে পারবেন তিনি লিংকে, যিনি পারবেন না তিনি ফোনে। |
| DEC-WA-004 | **Checkout পর্যন্ত এসে ছেড়ে গেলে**ও বার্তা যাবে (Marketing category, opt-out মেনে) — **নিষ্ক্রিয়তার ১৫ মিনিট পর**। এর মধ্যে order হয়ে গেলে যাবেই না। |
| DEC-WA-005 | **COD order**-এর নিশ্চিতকরণ বার্তা আলাদা — "আমাদের একজন প্রতিনিধি যোগাযোগ করে verify করবেন"। prepaid-এর বার্তা এখানে চলবে না। |
| DEC-WA-006 | সব বার্তা **ইংরেজিতে** (`en`)। বাংলা এখন নয়। |
| DEC-WA-007 | সময়মতো কাজ চালানোর যন্ত্র **API-র ভেতরেই** (`@nestjs/schedule`)। **Real-এ চালু, Demo-তে বন্ধ** — env দিয়ে। Demo-তে হাতে চালানোর বোতাম থাকবে। |
| DEC-WA-008 | checkout-এ গ্রাহক **যা-ই টাইপ করুন** তা ধরে রাখা হবে, submit না করলেও (`CheckoutLead.draft`)। **৯০ দিন** রাখা হবে, ওই সময়ে গ্রাহকে পরিণত করার চেষ্টা চলবে (বার্তা + admin তালিকা থেকে staff-এর ফোন), তারপর নিজে থেকে মুছবে। কার্ড/CVV/OTP কখনো নয় — ওগুলো আমাদের পাতাতেই আসে না। storefront-এর privacy policy-তে এই কথা লেখা থাকতে হবে। |

**কেন ৩০ সেকেন্ড নয় (মালিক প্রথমে তাই চেয়েছিলেন, আলোচনার পর ১৫ মিনিট):**
"ছেড়ে গেছে" আমরা জানি না, অনুমান করি। টাকা দিতে গেলে গ্রাহক প্রায় সবসময়ই
পাতা ছাড়েন — bKash অ্যাপে যান, কার্ডের OTP দেখেন। ৩০ সেকেন্ডে বার্তা গেলে
গ্রাহক PIN টাইপ করার সময় "আপনার cart রাখা আছে" পেতেন — দোকানটা গোলমেলে
মনে হতো, আর Marketing template বলে প্রতিবার টাকাও কাটত।

**কেন Demo-তে scheduler বন্ধ (DEC-WA-007):** ফ্রি Postgres-এ মাসিক
compute-hour সীমা। নিয়মিত জেগে ওঠা query কোটা কয়েক দিনে শেষ করে দেয় —
`/health` কেন DB ছোঁয় না, ঠিক সেই একই কারণ (CLAUDE.md §৫)।

### যা বানাতে হবে

| # | কাজ | কেন |
|---|---|---|
| ১ | **schema** — কোন order-এ কোন বার্তা কবে গেল | নাহলে একই লোকের কাছে বারবার যাবে, আর "গেল কি গেল না" কেউ বলতে পারবে না |
| ২ | payment fail hook (SSLCommerz-এর fail/cancel callback-এ) | এখন ওখানে কিছুই হয় না |
| ৩ | **scheduler** — `@nestjs/schedule`, Real-এ চালু · Demo-তে বন্ধ (DEC-WA-007) | cron ছাড়া "২৪ ঘণ্টা পর পাঠাও" বলে কিছু নেই |
| ৪ | `/pay/{orderNo}` — storefront-এ টাকা দেওয়া শেষ করার পাতা | লিংকটা কোথাও তো নামবে |
| ৫ | abandoned checkout ধরা — **নিষ্ক্রিয়তার ১৫ মিনিট** (DEC-WA-004) | order হয়ে গেলে বাতিল হতে হবে |
| ৬ | COD আর prepaid-এর confirmation আলাদা করা | এখন একটাই template সবার জন্য যায় |

---

## ৬. আমি যা করে দেব (আপনার অনুমোদনের পর)

1. **Graph API version — `v20.0` → `v23.0`।** কোডে এখন v20 বসানো;
   Meta প্রতিটা version ~২ বছর রাখে, v20 (মে ২০২৪) মেয়াদ শেষের কাছে।
   একদিন হঠাৎ বন্ধ হওয়ার চেয়ে এখন বদলানো ভালো। *ছোট কাজ।*
2. **Webhook controller** — `GET /webhooks/whatsapp` (verify) +
   `POST` (বার্তা গ্রহণ, App secret দিয়ে signature যাচাই) → Inbox
   Conversation/Message। *Inbox Phase 3।*
3. **Delivery status** — বার্তা পৌঁছাল/পড়া হলো কিনা order timeline-এ তোলা।
4. **Bangla template** — এখনকার তিনটে ইংরেজি। বাংলা চাইলে `bn`-এ
   আলাদা approve করাতে হবে, কোডে ভাষা বদলাবে।

**১ নম্বরটা এখনই করব কিনা বলুন** — বাকিগুলো আপনার Meta-র ধাপগুলো
শেষ হওয়ার পর, একটা একটা করে।

---

_সূত্র: Meta WhatsApp Cloud API — Get started · Pricing (২০২৬)।_
