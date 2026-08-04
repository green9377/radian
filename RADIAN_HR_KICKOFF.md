# Radian — Employee / HR module · Kickoff

লেখা: ২৮ জুলাই ২০২৬, Finance module শেষ হওয়ার পর।
এই ফাইলটা নতুন chat-এর প্রথম পড়ার জিনিস।

---

## ১. কেন এই module এখন

Finance-এ কর্মীর টাকা **ইতিমধ্যেই চলছে** — কিন্তু কর্মী বলে কোনো সত্তা নেই।

- `5420 Staff Salary` — বেতন খরচ
- `1210 Employee Advance` — অগ্রিম, ব্যক্তির নাম **dimension** হিসেবে (`JournalLine.employeeName`)
- ইচ্ছাকৃত সিদ্ধান্ত: প্রতি কর্মীর জন্য আলাদা account নয় — সেটা chart of accounts নষ্ট করে (gap G2-র শিক্ষা)

অর্থাৎ রাকিবকে ৳৫,০০০ অগ্রিম দিলে সিস্টেম শুধু **"Rakib" শব্দটা** জানে। বানান
ভুল হলে দ্বিতীয় একজন রাকিব তৈরি হয়ে যায়, আর কার কাছে কত পাওনা তা কখনো নিশ্চিত নয়।

**HR module-এর মূল কাজ: ওই string-টাকে আসল Employee-তে বদলানো, পুরনো এন্ট্রি না ভেঙে।**

---

## ২. যা ইতিমধ্যে আছে (নতুন করে বানানো নয়)

| জিনিস | কোথায় | HR-এর সাথে সম্পর্ক |
|---|---|---|
| `AppUser` + `AppSession` | auth module | **লগইন account** — নাম, username, password, PIN, role (OWNER/MANAGER/STAFF)। কর্মী ≠ account |
| `Partner` + `PartnerTransaction` | finance | মালিক-অংশীদার। বেতন `5410`, drawings equity — **কর্মী নয়**, গুলিয়ে ফেলা যাবে না (FIN-RULE-010) |
| `Rider` | delivery | ডেলিভারি রাইডার — নাম, ফোন, vehicle, photo |
| `JournalLine.employeeName` | finance | অগ্রিম ও বেতনের dimension |
| `StockIssue.actor`, `AssemblyProduction.actorName`, `AuditLog.actorName` | নানা module | কে করল — এখন session-এর নাম বসে |

---

## ৩. যেসব প্রশ্ন আগে লক করতে হবে (কোড নয়)

এগুলোর উত্তর না জেনে schema লেখা মানে পরে ভাঙা।

### ৩.১ Employee আর AppUser — এক না আলাদা?
রাঁধুনি বা ডেলিভারি বয়ের admin panel-এ ঢোকার দরকার নেই, কিন্তু বেতন পাবে।
আবার ম্যানেজারের দুটোই লাগবে। **সুপারিশ: আলাদা দুটো সত্তা, ঐচ্ছিক লিংক** —
`Employee.appUserId?`। কিন্তু মালিকের সিদ্ধান্ত।

### ৩.২ Rider কি Employee?
ডেলিভারি module-এ `Rider` আলাদা টেবিল। নিজের রাইডার হলে সে কর্মীও — তাহলে
দুই জায়গায় দুই সারি থাকবে, আর বেতন দিতে গিয়ে গুলিয়ে যাবে। বাইরের কুরিয়ারের
রাইডার কর্মী নয়। **লিংক করা হবে, না আলাদা থাকবে — লক করতে হবে।**

### ৩.৩ বেতন কীভাবে হিসাব হয়
মাসিক ঠিক অঙ্ক? দৈনিক হাজিরা? ঘণ্টা? ফুলের দোকানে উৎসবে (ভ্যালেন্টাইন,
পহেলা ফাল্গুন, মা দিবস) অস্থায়ী লোক লাগে — তাদের হিসাব আলাদা।

### ৩.৪ হাজিরা রাখা হবে কি
রাখলে: কে কখন এল, ছুটি, অতিরিক্ত সময়। না রাখলে বেতন হাতে ঠিক করে দিতে হবে।
**অতিরিক্ত জটিলতা বনাম আসল প্রয়োজন** — এখানে থামা দরকার, নইলে module ফুলে যাবে।

### ৩.৫ বাংলাদেশের আইনি দিক
বোনাস (ঈদ), ছুটির নিয়ম, provident fund, gratuity — কোনটা এখন দরকার আর কোনটা
পরে। **আইনি বিষয়ে অনুমান করা যাবে না, মালিকের কাছ থেকে জেনে নিতে হবে।**

### ৩.৬ পুরনো ডেটার কী হবে
`employeeName` string হিসেবে যা আছে সেগুলো নতুন Employee-র সাথে মেলাতে হবে।
পুরনো ledger entry **বদলানো যাবে না** (FIN-RULE-003) — তাই mapping কৌশল লাগবে।

---

## ৪. যেসব ভুল করা যাবে না (আগের module-গুলোর শিক্ষা)

1. **Finance-এর dimension ভাঙবে না** — `employeeName` string-ই থাকবে; Employee যোগ হবে *পাশে*, বদলে নয়। পুরনো এন্ট্রি অক্ষত থাকতে হবে।
2. **প্রতি কর্মীর আলাদা ledger account নয়** — এক account (1210) + dimension। এটা locked সিদ্ধান্ত।
3. **Partner আর Employee মেশানো নয়** — 5410 বনাম 5420, drawings বনাম salary।
4. **schema বদলালেই migration `.bat`** — নইলে API boot করবে না (আগে একবার হয়েছে)।
5. **soft-delete extension** — নতুন model-এ `deletedAt` না থাকলে `NO_SOFT_DELETE`-এ যোগ করতে হবে (`apps/api/src/prisma/soft-delete.extension.ts`), নইলে সব read 500 দেবে।
6. **নতুন controller জন্ম থেকেই বন্ধ** (global AuthGuard)। বেতন ও অগ্রিম MANAGER+; কর্মীর ব্যক্তিগত তথ্য সম্ভবত OWNER-only।
7. **টাকা সংক্রান্ত কাজে `@NeedsPin()`**।

---

## ৫. কাজের ছন্দ (অপরিবর্তনীয়)

1. আমার প্রয়োজন বিশ্লেষণ
2. প্রতিযোগী/বাস্তব practice দেখা
3. উন্নতির পরামর্শ (business logic না বদলে)
4. এক এক করে প্রশ্ন — **আমি লক করার আগে কোড নয়**
5. বানানো → নিজে পরীক্ষা → দেখানো → আমার feedback → অনুমোদন
6. অনুমোদনের আগে পরের ধাপে যাওয়া নয়

---

## ৬. পরিবেশ

- Postgres · API · web → Docker; admin panel host-এ `:3001`
- API `:4000` · storefront `:3000` · Postgres host-এ `5433`
- **API watcher host-এর ফাইল বদল টের পায় না** → `D:\radian\radian_lock_all.bat` (restart)
- **আমি টার্মিনাল চালাব না** — সব `.bat`, নয়তো তুমি নিজে চালিয়ে দেবে
- `schema.prisma` শুধু তুমি ছোঁবে
- লগইন `sobuj` / OWNER · টাকার কাজে ৪ সংখ্যার PIN

---

## ৭. Finance-এর বকেয়া (HR-এর কাজ নয়, ভুলো না)

drift পর্দায় ৪টা লাল দাগ — practice ডেটা মোছা, আসল opening balance, প্রতিটা
খরচে fixed/variable। বিস্তারিত `RADIAN_NEXT_CHAT_HANDOFF.md` §২।
