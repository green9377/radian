# পরের বার localhost চালু করলে — একটাই migration চালাও

Product module lock হয়েছে। schema-তে নতুন সব table/field যোগ করা হয়েছে
(Upgrade · Add-on · Variant template · lead time · OrderLine.addedFrom)।
এখন শুধু একবার migration চালালেই DB-তে বসে যাবে। এরপর Product module-এ আর
migration লাগবে না।

## ধাপ (cmd-এ)

```
cd /d D:\radian
docker compose up -d postgres api
docker compose run --rm api npx prisma migrate dev --name product_module_complete
docker compose exec api npx prisma generate
docker compose restart api
```

- ৩ নম্বর লাইন migration তৈরি করে + চালায়।
- ৪–৫ নম্বর: চলমান api container-এর Prisma client নতুন করে বানায়, নইলে
  API 500 দেবে ("findMany of undefined")। (আগের বার এই ভুলটা হয়েছিল।)

## যা যোগ হলো (schema)

| নতুন | কী |
|---|---|
| `Product.leadTimeDays` | made-to-order কত দিন |
| `Product.upgradeOfProductId` (self-relation) | এই product কার বড় version |
| `AddOn` · `AddOnGroup` · `AddOnGroupItem` · `AddOnRule` | add-on পরিবার (many-to-many) |
| `VariantAttribute` · `VariantValue` | Colour/Flavour/Size template master |
| `OrderLine.addedFrom` (PRODUCT/CART/CHECKOUT) | add-on কোন page থেকে নেওয়া হলো |

migration চললে বলো — তখন admin screen-গুলোকে memory থেকে সরিয়ে এই আসল
table-এ যুক্ত করে দেব (API endpoint + persist)।
