# Meta App Review — জমা দেওয়ার প্যাকেট

_৭ আগস্ট ২০২৬。 App: **Radian** (`1720041072657899`)_

---

## ০. কেন লাগছে

Meta-র নিয়ম: **app-এ ভূমিকা নেই এমন কেউ ব্যবহার করলে App Review লাগে।**
আসল গ্রাহক মানেই তাই — তাই এটা করতেই হবে。

⚠️ **একটা ভুল সংশোধন (৭ আগস্ট)।** প্রথমে লিখেছিলাম standard access-এ শুধু
app-role-এর লোকের বার্তা আসে。 **তা নয়** — Inbox খুলে দেখা গেছে সাধারণ
লোকের বার্তাও আসছে, উত্তরও যাচ্ছে。 ওই সীমাটা Facebook Login দিয়ে
ব্যবহারকারীর কাছে permission চাওয়ার ক্ষেত্রে, নিজের Page-এর কথোপকথনে নয়。

তাই আজই কাজ চলছে; App Review লাগে **নিয়ম মানার জন্য** — অনুমোদন ছাড়া
চালালে পরে access কেড়ে নেওয়া হতে পারে。

---

## ১. আগে যা থাকতে হবে (checklist)

**৭ আগস্ট রাতে সব করা হয়ে গেছে।** নিজে খুলে দেখে, বসিয়ে, সেভ করে যাচাই করা:

| | অবস্থা |
|---|---|
| Privacy Policy — messaging ও AI-উত্তরের কথা | ✅ live |
| Privacy Policy URL · Terms of Service URL | ✅ |
| App icon · Category (Shopping) | ✅ |
| **Data deletion instructions URL** | ✅ ঠিক করা — **আগে `https://www.facebook.com/` বসানো ছিল**, অর্থাৎ reviewer ডেটা মোছার নিয়ম দেখতে গিয়ে Facebook-এর হোমপেজে পৌঁছাত。 প্রায় নিশ্চিত reject ছিল |
| Contact email | ✅ `radianbd360@gmail.com` |
| App domains | ✅ `radianbd.com` |
| **Website platform** | ✅ যোগ করা (Site URL `https://radianbd.com/`) — **এটা না থাকলে reviewer instructions-এর ঘরগুলোই খোলে না**, তাই submit করাই যেত না |
| **Business Verification** | ✅ **আগে থেকেই ছিল** — ১৭ অক্টোবর ২০২৫ |
| Submission form (৫ অংশ) | ✅ পাঁচটাই পূরণ |
| Screencast | ⬜ **ঐচ্ছিক, কিন্তু দেওয়া উচিত** — §৩ |

### লাইসেন্সের ঠিকানা বনাম দোকানের ঠিকানা

Meta-য় **বনানী** (লাইসেন্স অনুযায়ী), ওয়েবসাইটে **গুলশান** (আসল দোকান)。
দুটোই থাক — Meta-রটা কাগজের সাথে মেলে, ওয়েবসাইটেরটা গ্রাহকের জন্য সত্যি。
App Review এই দুটো মেলায় না。 **লাইসেন্স নবায়নের দিন দুটোই একসাথে বদলাবে।**

### ❌ Data deletion — কী বসাবে

Meta দুটোর একটা চায়: **URL** (একটা পাতা যেখানে লেখা আছে কীভাবে ডেটা মোছাতে
হয়) অথবা **callback**。 URL সহজ, আর আমাদের privacy policy-তে ইতিমধ্যেই
কথাটা লেখা আছে。

বসাও:

```
https://radianbd.com/page/privacy-policy
```

⚠️ তবে ওই পাতায় deletion-এর কথা section 7-এ, নিচের দিকে。 reviewer যেন
খুঁজতে না হয়, তাই ভালো হয় একটা আলাদা ছোট পাতা —
`radianbd.com/page/data-deletion` — যেখানে শুধু তিন লাইন:

> **How to delete your data**
>
> Write to radianbd360@gmail.com from the email or phone number you used, or
> message us on WhatsApp at 01519779378, and ask us to delete your data. We
> will delete your orders, addresses and conversations within 7 days and
> confirm once it is done, keeping only what Bangladeshi law requires us to
> keep for accounting.

দুটোর যেকোনো একটা চলবে; আলাদা পাতাটা review পাশ করার সম্ভাবনা বাড়ায়。

⚠️ **Business Verification আগে** — এটা ছাড়া বেশিরভাগ advanced access দেয়ই না。
এতেই সবচেয়ে বেশি সময় যায় (কয়েক দিন থেকে সপ্তাহ)。

---

## ২. প্রতিটা permission-এর জন্য যা লিখতে হবে

Meta প্রতিটার সাথে জিজ্ঞেস করে "how will you use this"。 নিচের লেখাগুলো
হুবহু কপি করা যাবে。

### `pages_messaging`

> Radian is a flower and gift shop in Bangladesh. Customers message our
> Facebook Page to ask about products, delivery times and the status of an
> order they have placed.
>
> We use this permission to receive those messages in our own support inbox and
> to reply to them. Staff answer from that inbox, and common questions are
> answered automatically so that a customer asking "do you deliver to Gulshan
> today?" at midnight is not left waiting until morning. Every automated reply
> can be taken over by a person at any time.
>
> We only send messages in reply to a customer, inside the standard 24-hour
> window. We do not send promotional messages through this permission.

### `pages_manage_metadata`

> We use this permission only to subscribe our app to the Page's webhook so
> that incoming messages are delivered to our support inbox. We do not change
> any other Page setting with it.

### `instagram_business_basic`

> We use this permission to read the account's own profile and the username of
> the person who has messaged us, so that a conversation in our support inbox
> shows who it is from rather than an anonymous ID.

### `instagram_business_manage_messages`

> Customers reach Radian through Instagram direct messages as often as through
> our website. We use this permission to receive those messages in the same
> support inbox as our Facebook and WhatsApp conversations, and to reply to
> them.
>
> This lets one team answer every channel in one place, and lets us connect a
> customer's question to the order they already placed. As with Messenger, some
> replies are drafted automatically and a person can take over at any moment.
>
> We reply only to people who have messaged us first, inside the standard
> 24-hour window.

### `whatsapp_business_messaging` (যদি চাওয়া হয়)

> We send order-related updates on WhatsApp using templates Meta has approved:
> order confirmation, out for delivery, delivered, and a message when a payment
> did not complete. Customers may reply to any of these, and their replies
> arrive in the same support inbox where our staff answer them.

---

## ৩. Screencast — কী দেখাতে হবে

Meta-র reviewer আমাদের admin-এ ঢুকতে পারে না, তাই ভিডিওই একমাত্র প্রমাণ。
**পর্দা রেকর্ড করে দেখাও, ২–৩ মিনিট, কথা বলার দরকার নেই。**

দেখানোর ক্রম:

1. Facebook Page খুলে **একটা আসল message পাঠাও** (অন্য একটা ফোন/account থেকে)
2. Radian Admin → **Inbox** — বার্তাটা এসে বসেছে, Messenger লেখা কার্ডে গণনা বাড়ল
3. Inbox থেকে **উত্তর লেখো ও পাঠাও**
4. Messenger-এ ফিরে দেখাও — **উত্তরটা পৌঁছেছে**
5. একই তিনটে ধাপ **Instagram DM** দিয়ে আবার
6. শেষে **Privacy Policy পাতাটা** একবার scroll করে দেখাও

⚠️ ভিডিওতে যেন কোনো token, key বা গ্রাহকের ফোন নম্বর না দেখা যায়。

---

## ৪. ফাঁদ

| ফাঁদ | কী হয় |
|---|---|
| **Screencast-এ শুধু কোড বা dashboard দেখানো** | Meta ফিরিয়ে দেয় — গ্রাহকের চোখে কী ঘটে সেটাই দেখতে চায় |
| **Privacy Policy URL app settings-এ বসানো নেই** | সাথে সাথে reject |
| **যে permission ব্যবহারই করি না সেটা চাওয়া** | "explain this" — উত্তর না থাকলে পুরো submission আটকায়。 তাই `instagram_business_manage_comments` **চাইব না**, যদিও use case-এর সাথে যোগ হয়ে আছে |
| **Business Verification ছাড়া জমা** | পরে আবার সব করতে হয় |
| **AI-এর কথা লুকানো** | স্বয়ংক্রিয় উত্তরের কথা privacy policy-তে আছে; submission-এও একই কথা থাকা দরকার, নইলে অসঙ্গতি |

---

## ৫. ক্রম

```
Business Verification  →  App settings (icon, privacy URL)  →
Screencast  →  Permission-প্রতি লেখা  →  Submit  →  অপেক্ষা
```

জমা দেওয়ার পরে সাধারণত কয়েক কর্মদিবস。 ফিরিয়ে দিলে Meta কারণ লিখে দেয়,
সেটা ঠিক করে আবার জমা দেওয়া যায় — যতবার দরকার。
