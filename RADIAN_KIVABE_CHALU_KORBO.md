# Radian Admin Panel — কীভাবে চালু করব (সবুজের জন্য নোট)

## সবচেয়ে সহজ উপায় (মনে রাখার দরকার নেই)

প্রতিবার **কম্পিউটার অন করার পর**, শুধু একবার এই ফাইলটা **ডাবল-ক্লিক** করো:

```
D:\radian\START_RADIAN.bat
```

এটা নিজে থেকেই ৩টা জিনিস চালু করবে:
1. Database (Docker Postgres, port 5433)
2. API (port 4000)
3. Admin panel (port 3001)

তারপর ব্রাউজারে খোলো: **http://localhost:3001**

> দুটো নতুন কালো window (radian-api, radian-admin) খুলবে — ওগুলো **খোলা রাখতে হবে**। বন্ধ করলে server বন্ধ হয়ে যায়। launcher window-টা বন্ধ করলে সমস্যা নেই।

---

## কেন "সবসময় on" থাকে না?

- **Database** docker-এ চলে, `restart: unless-stopped` দেওয়া — Docker Desktop চালু থাকলে নিজে নিজে ফিরে আসে।
- কিন্তু **Admin + API** `npm run dev` দিয়ে চলে (developer mode) — কম্পিউটার বন্ধ করলে এগুলো বন্ধ হয়, নিজে থেকে ফেরে না।

তাই: **পিসি অন করার পর একবার `START_RADIAN.bat` চালালেই হবে।**

---

## (Optional) লগইন করলেই নিজে নিজে চালু হোক

চাইলে এভাবে সেট করলে Windows-এ লগইন করার সাথে সাথে সব চালু হবে:

1. **Docker Desktop auto-start:** Docker Desktop খোলো → Settings → General → "Start Docker Desktop when you sign in" টিক দাও।
2. **Launcher auto-start:** কীবোর্ডে `Win + R` চাপো → লেখো `shell:startup` → Enter। যে folder খুলবে সেখানে `START_RADIAN.bat`-এর একটা **shortcut** রেখে দাও (ফাইলটা copy না করে, right-click → "Create shortcut" → shortcut-টা ওই folder-এ নাও)।

এরপর থেকে পিসি অন করে Windows-এ লগইন করলেই Postgres + API + Admin নিজে নিজে চালু হয়ে যাবে।

---

## সমস্যা হলে

- **Admin খুলছে না / 500 error:** api window-তে error দেখো; দরকারে দুই window বন্ধ করে আবার `START_RADIAN.bat` চালাও।
- **Docker error:** Docker Desktop চালু আছে কিনা দেখো (নিচে ডানদিকে whale icon)।
- নতুন npm package বসালে: `cd D:\radian\apps\admin` → `npm install` → আবার চালাও।
