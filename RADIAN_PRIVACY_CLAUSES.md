# Privacy Policy — যে অনুচ্ছেদগুলো এখনো যোগ করা হয়নি

_৭ আগস্ট ২০২৬。_

দুটো জিনিস আমরা বানিয়েছি যা privacy policy-তে বলা নেই, অথচ বলা **দরকার**:

1. **অসমাপ্ত checkout ধরে রাখা** — গ্রাহক submit না করেও যা টাইপ করেছে তা
   আমরা রাখি, ৯০ দিন পর্যন্ত (Admin → Marketing → Recovery-তে বদলানো যায়)
2. **WhatsApp · Messenger · Instagram** — এই তিন চ্যানেলের কথোপকথন Radian-এর
   Inbox-এ জমা হয়

⚠️ **Meta-র App Review এই পাতাটা পড়বে।** advanced access চাওয়ার আগে এটা
প্রকাশিত থাকতে হবে, নইলে review ফিরিয়ে দেবে。

⚠️ আমি আইনজীবী নই。 নিচের লেখাটা খসড়া — মালিক পড়ে, দরকারে আইনি পরামর্শ
নিয়ে, তারপর প্রকাশ করবেন。

---

## কোথায় বসবে

Radian Admin → **Content → Pages → Privacy Policy** → "Information We Collect"
অংশের পরে。

---

## খসড়া (ইংরেজি — সাইটের ভাষা)

### Information you enter before completing an order

When you begin checkout, we save what you have typed — name, phone number,
delivery address, delivery date and the items in your cart — before you press
the final button. We do this so that if your payment fails, your connection
drops, or you leave the page, we can help you finish the order rather than ask
you to start again.

**We never store card numbers, CVV codes, PINs or one-time passwords.** Those
are handled entirely by the payment provider and never reach our servers.

We keep this information for up to **90 days**, after which it is permanently
deleted. If you complete the order, the information becomes part of your order
record and is kept under the order retention terms above instead.

We may contact you once about an unfinished order, on the phone number you
entered. To stop this, reply STOP to any message from us, or write to
[support email] and we will remove your details immediately.

### Messages you send us

We reply to customers on WhatsApp, Facebook Messenger, Instagram and the chat
on this website. Messages you send on any of these reach the same inbox, and
we keep them so that whoever helps you next can see what was already
discussed. Where you have messaged us before, we may connect that conversation
to your order history.

Some replies are drafted automatically. A member of our team can take over any
conversation at any time, and you can ask to speak to a person at any point.

Meta operates WhatsApp, Messenger and Instagram, and your use of those services
is also governed by Meta's own privacy policy.

---

## যা আগে ঠিক করতে হবে

- `[support email]` — আসল ঠিকানা বসাতে হবে
- "order retention terms above" — উপরের অনুচ্ছেদে order কতদিন রাখা হয় তা
  স্পষ্ট করে লেখা আছে কিনা দেখতে হবে; না থাকলে ওটাও লিখতে হবে
- **"reply STOP" এখনো সত্যি নয়** — যাচাই করে দেখলাম: `MarketingOptOut`
  আছে এবং পাঠানোর আগে দেখাও হয় (`checkout-leads.service.ts` →
  `skipReason()`), কিন্তু কেউ WhatsApp/Messenger/Instagram-এ "STOP" লিখলে
  সেটা কোথাও বসে না。 লেখা প্রকাশের আগে হয় কোডটা বানাতে হবে, নয়তো
  বাক্যটা বদলাতে হবে。 **যা করি না তা policy-তে লেখা যাবে না।**

  আরেকটা বাধা: `MarketingOptOut.customerId` বাধ্যতামূলক。 কিন্তু
  Messenger/Instagram-এ ফোন নম্বর আসে না — scoped id আসে。 তাই ওই
  চ্যানেলে "STOP" লেখা লোককে চেনার উপায় এখনো নেই。 এটা একটা নকশার
  সিদ্ধান্ত, মালিকের。
