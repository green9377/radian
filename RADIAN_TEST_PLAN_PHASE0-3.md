# RADIAN BUSINESS OS — TEST PLAN, PHASE 0 → PHASE 3
**For an independent tester. Version 1.0 — 22 Aug 2026.**

---

## 0. BEFORE YOU START

### 0.1 What you are testing
The Radian admin panel (the shop's back office) on the **demo** deployment.
Nothing here touches real customers or real money.

| Part | Address |
|---|---|
| Admin panel — this is what you test | **https://radian-admin.vercel.app** |
| Storefront (customer site) — only for two checks | https://radian-web-tan.vercel.app |

Login details are sent to you separately. Do not share them.

### 0.2 Rules for the tester
1. **The API sleeps.** The first page after a quiet spell can take **30–50
   seconds**. Wait a full minute before calling anything broken.
2. **Test in the order written.** Later sections use data created earlier
   (an item is needed before a purchase; a purchase before stock).
3. **Report like this:** screen → what you did → what you expected → what
   happened → screenshot. One row per problem.
4. Mark every check **PASS / FAIL / N-A**. If a step is blocked by an earlier
   failure, write BLOCKED and move on.
5. **Do not** delete other people's test rows unless a step says to.
6. Watch for these four things everywhere, even when a step does not mention
   them:
   - a number that does not add up
   - a screen that jumps, flickers or scrolls by itself after saving
   - text in **Bangla** anywhere in the panel (there must be none)
   - **paisa** being dropped (type 19.80 → it must stay 19.80, never 19)

### 0.3 Vocabulary
| Word | Meaning |
|---|---|
| **Item** | a thing the shop holds in stock (a rose, a teddy, wrapping paper) |
| **Product** | a thing the website sells; it points at exactly one Item |
| **Warehouse / store** | a place stock sits: *Radian Shop*, *Main Storeroom* |
| **POS / counter** | selling face to face at the shop |
| **Ledger** | the running record of every stock or money movement |
| **AVCO** | average cost — what the shop paid on average for one unit |

---

## 1. PHASE 0 — BASELINE AND HOUSEKEEPING

**What was built:** the demo database was emptied down to configuration only,
and every "sample data" pour was removed from the code (fake products, fake
staff, fake suppliers).

### Checklist 1 — no invented data anywhere
| # | Step | Expected | P/F |
|---|---|---|---|
| 1.1 | Open the panel; log in | Dashboard loads, no error banner | |
| 1.2 | Visit Items → All items, Suppliers, Purchases, Inventory → Stock board | Only rows a human created. No "Sample", "Demo", "Lorem", "Test supplier 1" style rows that nobody made | |
| 1.3 | Look for buttons like "Add the usual categories" / "Load sample data" | None exist | |
| 1.4 | Anywhere a list is empty | It says so plainly; it never invents rows to look busy | |
| 1.5 | Whole panel: any Bangla text on screen? | None. English only | |

---

## 2. PHASE 1 — ADMINISTRATION (access, people, company, backup)

**What was built:** who may open which screen, invitations, the guard that
enforces it, one notification bell, company details, backup.

Screens: `Setup → Administration →` Overview · Access control · People &
accounts · Activity & sessions · Company settings · All settings · Backup &
restore · Integrations & keys.

### Checklist 2A — access templates
| # | Step | Expected | P/F |
|---|---|---|---|
| 2.1 | Administration → Access control | Templates list (OWNER / MANAGER / STAFF style rows) | |
| 2.2 | Open a template; switch a screen from Allowed to Blocked; save | Saves without the page jumping; a confirmation appears | |
| 2.3 | Re-open the template | The change is still there | |
| 2.4 | Turn a whole module to **Auto** | Module opens if any screen inside it is allowed | |

### Checklist 2B — people and invitations
| # | Step | Expected | P/F |
|---|---|---|---|
| 2.5 | People & accounts → invite a new person **without** choosing a template | Refused — a template is required | |
| 2.6 | Invite with a template | A one-time link is produced; it points at the real panel address | |
| 2.7 | Open that link in a private window | It asks to set a password; after that it opens the panel | |
| 2.8 | Log in as that person | Only the allowed screens are reachable | |
| 2.9 | As that person, paste the URL of a blocked screen | A polite "door closed" card — NOT a wall of errors | |

### Checklist 2C — the rest
| # | Step | Expected | P/F |
|---|---|---|---|
| 2.10 | Activity & sessions | Recent actions with who and when; history opens as a modal | |
| 2.11 | Company settings — fill legal name, BIN, address, signatory; save | Saves; re-open shows the values | |
| 2.12 | The bell (top right, owner only) | Carries state notices — backup, invites, licence, payment sandbox. Pages themselves carry no such banners | |
| 2.13 | Backup & restore | The screen explains what it will do; a backup can be started | |
| 2.14 | Integrations & keys | Payment gateway sits at the top, separate from analytics keys | |

---

## 3. PHASE 2 — MASTERS (the lists everything else picks from)

**What was built:** units, categories, colours, sizes, brands, tags, supplier
types, sales channels, and the delivery masters + setup. Every master was
rebuilt clean: no page prose, no field hints, errors inside the dialog, live
duplicate checks.

Screens: `Setup → Sales channels` · `Setup → Delivery setup → Methods & slots /
Setup / Riders` · Items → Units, Categories, Colours, Sizes, Types · Suppliers →
Settings · Brands · Tags.

### Checklist 3A — the shape of every master (repeat for at least 4 masters)
| # | Step | Expected | P/F |
|---|---|---|---|
| 3.1 | Open the master | A clean list. No paragraph of explanation at the top | |
| 3.2 | Add a row | A dialog opens; it has a **Save** button; nothing saves by itself | |
| 3.3 | Add a row with the **same name** again | Refused, with the message **inside the dialog** (not a browser popup) | |
| 3.4 | Save with an empty name | Refused politely | |
| 3.5 | Rename a row | Works; the list updates without the page jumping | |
| 3.6 | Delete a row that is **in use** | Refused, and it says what is using it | |
| 3.7 | Delete a row that is not used | Goes away | |

### Checklist 3B — sales channels feed the rest
| # | Step | Expected | P/F |
|---|---|---|---|
| 3.8 | Setup → Sales channels; add "Facebook" | Saved | |
| 3.9 | POS → Sell (counter) | "Facebook" is offered as the sales channel | |
| 3.10 | Switch that channel off; re-open POS | It is gone from the till | |

### Checklist 3C — delivery
| # | Step | Expected | P/F |
|---|---|---|---|
| 3.11 | Delivery setup → Methods & slots | Methods (2-hour, same day, midnight, courier) and slot templates exist | |
| 3.12 | Delivery setup → Setup | Price per zone and slot capacity are set HERE, not in the master | |
| 3.13 | Change a delivery price; open the storefront's delivery options | The storefront shows the new price | |
| 3.14 | Delivery → Riders | Riders can be added; couriers are NOT here (they live in Administration) | |

---

## 4. PHASE 3 PART A — ITEMS

**What was built:** every Items screen; item types; sub-categories; variant
families as their own page; per-variant photos; **cost = purchase average**;
**sell price = cost + markup**; the "See cost prices" permission; two separate
switches, "We sell it" and "Sell online"; and the rule that **the counter sells
Items, never Products**.

Screens: Items → All items · New item · Item page · Family · Groups · Costs ·
Pricing · Recipes · Types · Categories · Colours · Sizes · Units · Trash.

### Checklist 4A — create an item
| # | Step | Expected | P/F |
|---|---|---|---|
| 4.1 | Items → New item; fill name, type, unit, category | Saves; lands on the item page | |
| 4.2 | Inside the form, create a **new category** without leaving the page | Possible; the new category is selected immediately | |
| 4.3 | Same for brand, supplier, unit, colour, size | All can be created inline | |
| 4.4 | Upload a photo | Shows on the item and in every picker afterwards | |
| 4.5 | Set a **Counter price** below the price floor | The field turns red and warns | |
| 4.6 | Save without a name | Refused | |

### Checklist 4B — the two switches (DEC-ITM-024/025)
| # | Step | Expected | P/F |
|---|---|---|---|
| 4.7 | Turn **We sell it** ON, **Sell online** OFF | Item appears at the POS counter, not on the website | |
| 4.8 | Turn **Sell online** ON | A Product can be made for it; it can reach the website | |
| 4.9 | Turn **We sell it** OFF | It disappears from the POS list | |
| 4.10 | Create an item of type **Service** (e.g. gift wrapping) | It is sellable by default and holds no stock | |

### Checklist 4C — variants and family
| # | Step | Expected | P/F |
|---|---|---|---|
| 4.11 | Generate variants from colour/size (e.g. rose — Red / Pink / Green) | Each variant is its own item, grouped in one family | |
| 4.12 | Items → Family page | The family lists its variants; each can carry its own photo | |
| 4.13 | All items list | Variants appear grouped under the family, not scattered | |

### Checklist 4D — cost and price
| # | Step | Expected | P/F |
|---|---|---|---|
| 4.14 | Note an item's cost. Buy the same item at a very different price (see §5) and come back | Cost has moved to the weighted average, not the last price | |
| 4.15 | Items → Pricing; set the shop markup (e.g. 20%) | New sell prices are suggested as cost + markup | |
| 4.16 | Log in as a person **without** "See cost prices" | Cost columns are absent everywhere — item list, item page, POS | |
| 4.17 | Same person opens a purchase bill | No cost figures leak | |

### Checklist 4E — deleting
| # | Step | Expected | P/F |
|---|---|---|---|
| 4.18 | Delete an item that has stock or history | Refused with the reason | |
| 4.19 | Delete a fresh unused item | Goes to Items → Trash, not gone forever | |
| 4.20 | Restore it from Trash | Comes back whole | |

---

## 5. PHASE 3 PART B — PURCHASE AND SUPPLIERS

**What was built:** the whole buying circle — write a bill, receive the goods,
stock lands in the right store, the item's average cost updates, money is paid
in parts, goods can go back to the supplier, and the supplier's ledger reads
like a bank book. Plus: **receive line by line**, the **cost-jump guard**, and
the supplier's **What we buy** tab.

Screens: Purchases → Overview · All purchases · New purchase · Returns ·
Reports. Suppliers → Overview · All suppliers · supplier page · Vendors ·
Settings.

### Checklist 5A — a normal purchase
| # | Step | Expected | P/F |
|---|---|---|---|
| 5.1 | Purchases → New purchase | Clean form; supplier, date, receipt no, notes | |
| 5.2 | Press **Add items** | The **photo picker** opens (same as the POS), with search and type filters | |
| 5.3 | Add 2–3 items, set quantity and price | Line totals and the purple **Grand total** update instantly | |
| 5.4 | Open the **Discount** door, put ৳44.13 | Applies to the paisa — the total drops by exactly 44.13 | |
| 5.5 | Open **Charge**, add "Van fare ৳28" | Adds; the name is kept with the bill | |
| 5.6 | Open **Adjustment**, choose −, type **.42** | **Total drops by 42 paisa** (this is the paisa test) | |
| 5.7 | Pick a supplier from the dropdown, or type a new name | Both work; a new supplier is created on the spot | |
| 5.8 | Pay part of the bill (e.g. ৳100 of ৳160) | PAID and **Still owed** boxes show the split | |
| 5.9 | Save | Lands on the bill page; number PUR-0000xx | |

### Checklist 5B — the bill page
| # | Step | Expected | P/F |
|---|---|---|---|
| 5.10 | Look at the right rail | Dark purple card: **Payable** biggest, then Subtotal / Discount / Adjustment / VAT, then green **Paid** and amber **Due** | |
| 5.11 | Payments card | Purple header; each payment has a coloured method chip (CASH green, bKash pink…) and a green amount | |
| 5.12 | Timeline card | Icon beads on a thread: purchase recorded, goods received, payments | |
| 5.13 | Press **Add payment**, pay the rest | Badge flips to **Paid**; the Add payment button disappears | |
| 5.14 | Top of page | **New purchase** and **Sell (counter)** buttons are there | |

### Checklist 5C — receiving
| # | Step | Expected | P/F |
|---|---|---|---|
| 5.15 | Make a purchase with **Advance order — goods arrive later** ticked, pay a small advance | Status ADVANCE PAID; goods NOT in stock yet | |
| 5.16 | Try to save an advance order with 0 paid | Refused — an advance order needs money now | |
| 5.17 | Press **Only part of it arrived**; take 4 of 10 | Stock rises by 4 only; the bill still shows 6 to come | |
| 5.18 | Inventory → Stock board | The item shows +4 in the receiving store | |
| 5.19 | Press **Receive everything outstanding** | The rest lands; status RECEIVED | |
| 5.20 | Items → the item's cost | Moved to the new weighted average | |

### Checklist 5D — the cost-jump guard
| # | Step | Expected | P/F |
|---|---|---|---|
| 5.21 | Buy an item at more than **3×** its usual cost (e.g. usual ৳6, type ৳30) and receive it | An amber card: "Price looks unusual — 5.3× away from the current cost (৳6 per Pice)" | |
| 5.22 | Press **Never mind** | Nothing is received | |
| 5.23 | Press **The price is right — receive anyway** | Received; average cost updates | |
| 5.24 | Repeat with a **part** receipt | The confirm receives only the part you typed, never the whole bill | |

### Checklist 5E — returning goods to the supplier
| # | Step | Expected | P/F |
|---|---|---|---|
| 5.25 | On a received bill press **Return goods to supplier**; return 2 units with a reason | PRT-0000xx created | |
| 5.26 | Stock board | Stock has dropped by 2 | |
| 5.27 | The bill's rail | "Returned − ৳x", Payable reduced, Due reduced first | |
| 5.28 | Return more than was received | Refused | |
| 5.29 | Return when nothing is owed | The value becomes **credit with the supplier**, never cash back | |

### Checklist 5F — supplier page
| # | Step | Expected | P/F |
|---|---|---|---|
| 5.30 | Suppliers → open a supplier | Four coloured tiles: Due (we owe) · Credit we hold · Bought (all time) · Purchases | |
| 5.31 | **Ledger** tab | Day headings; purchases red +, payments green −; method chips; and under each amount **"owed ৳x"** — the running balance | |
| 5.32 | Walk down the ledger | The owed line decreases exactly to the Due tile at the top | |
| 5.33 | **What we buy** tab | Every item bought from him: bills count, quantity, **last price**, **average price**, last bill number | |
| 5.34 | **Pay supplier** button | Dialog: amount, method (only methods the shop has ON), oldest bill first, "Still owed after this" | |
| 5.35 | Pay more than is owed | Refused | |
| 5.36 | Purchases → Reports | Month by month, supplier board, and **Item price history** (every price ever paid for one item) | |

---

## 6. PHASE 3 PART C — INVENTORY

**What was built:** the stock board as photo tiles, opening stock, transfers,
wastage & gift with an editable reason list and an **Analysis** tab, stocktake,
movements, reports, settings — and warehouses moved to Setup.

Screens: Inventory → Overview · Stock board · Opening stock · Transfer ·
Wastage & Gift · Stocktake · Movements · Reports · Settings.
Plus `Setup → Warehouses`.

### Checklist 6A — stock board
| # | Step | Expected | P/F |
|---|---|---|---|
| 6.1 | Inventory → Stock board | **Photo tiles**: image, IN STOCK big, per-store chips, value | |
| 6.2 | Press the table icon (top right) | Same data as rows; press the grid icon to go back | |
| 6.3 | Search by name and by SKU | Both filter | |
| 6.4 | Filters **Low stock** and **Negative** | Only matching tiles remain; low = amber border, negative = red | |
| 6.5 | Press **Adjust** on a tile; change the count with a reason | Stock changes; the tile updates | |
| 6.6 | Inventory → Movements | The adjustment is listed with reason, who and when | |

### Checklist 6B — opening stock
| # | Step | Expected | P/F |
|---|---|---|---|
| 6.7 | Inventory → Opening stock; choose a store | Only items that have **never moved in that store** are offered | |
| 6.8 | Choose a store where everything already moves | An amber card explains why the list is empty and links to Adjust | |
| 6.9 | Add items through the picker, type quantities | "Lines ready" and "Worth at cost" update on the right | |
| 6.10 | Post | Stock appears on the board; Movements shows OPENING | |
| 6.11 | Try to open the same item in the same store again | It is not in the list at all | |

### Checklist 6C — transfer
| # | Step | Expected | P/F |
|---|---|---|---|
| 6.12 | Inventory → Transfer; **From = Main Storeroom** | The picker offers **only what that store holds** | |
| 6.13 | Change **From = Radian Shop** | The list changes to that store's goods | |
| 6.14 | An item that sits in **both** stores | Appears in both lists | |
| 6.15 | Ask for more than the source holds | The "In …" column turns red with ⚠, and the right panel warns | |
| 6.16 | Post the transfer | TRF-0000xx; source −qty, destination +qty, **one** entry each in Movements | |
| 6.17 | Stock board | Both stores' numbers match what you moved | |

### Checklist 6D — wastage & gift
| # | Step | Expected | P/F |
|---|---|---|---|
| 6.18 | Inventory → Wastage & Gift; choose Wastage | Reason chips appear (Rotten, Dried out, …) | |
| 6.19 | Hover a chip | A small pencil and × appear **inside** the chip | |
| 6.20 | Rename a reason | Renames; the list updates in place | |
| 6.21 | Press × once, then again | First press arms it (turns red), second deletes | |
| 6.22 | **+ New reason** → type one → Add | Added and selected immediately | |
| 6.23 | Add the same reason name twice | Refused | |
| 6.24 | Pick items — only what that store holds is offered; the "In store" column shows the count | Correct | |
| 6.25 | Post a wastage | WST-0000xx; stock down; Movements shows WASTAGE with the reason | |
| 6.26 | Switch to **Gift** and post one | GFT-0000xx; the reason list is the gift list, not the wastage list | |
| 6.27 | The month totals line | Wastage and gift totals for this month are right | |

### Checklist 6E — the Analysis tab
| # | Step | Expected | P/F |
|---|---|---|---|
| 6.28 | Wastage & Gift → **Analysis** | Four tiles: Wasted · Gifted · Total lost · Entries | |
| 6.29 | Switch 7 / 30 / 90 days / 1 year | Every panel re-reads for that window | |
| 6.30 | **Day by day** graph | Red = wastage, pink = gift, stacked; hovering a bar shows the day and the amounts | |
| 6.31 | **Which item, how much** | Items ordered by money lost, with photo, quantity wasted/gifted and a two-colour bar | |
| 6.32 | **Why — reason by reason** | Each reason with a WASTE/GIFT tag, how many times, how much money | |
| 6.33 | **Month by month** and **Store by store** | Totals split by kind | |
| 6.34 | Cross-check | Add the entries you posted by hand — the totals must agree | |

### Checklist 6F — stocktake (the counting day)
| # | Step | Expected | P/F |
|---|---|---|---|
| 6.35 | Inventory → Stocktake; choose a store → **Start counting** | The sheet lists **only what that store holds** (not the whole catalogue) | |
| 6.36 | The sheet columns | Item · Ledger · Counted · Diff · Diff (taka) | |
| 6.37 | Leave a row blank | It stays "—" — blank is NOT zero | |
| 6.38 | Type a count lower than the ledger | Diff goes red with the money value | |
| 6.39 | Type one higher | Diff goes green | |
| 6.40 | **Found something else** | The picker offers items the ledger says are not in this store; adding one puts it on the sheet | |
| 6.41 | **Save as draft** | STK-0000xx appears under Sessions: "x counted · y differ", net taka. **Stock has NOT changed yet** | |
| 6.42 | Check the stock board | Unchanged — the draft only proposes | |
| 6.43 | Press **Apply** | "applied — adjustments posted"; stock board now matches your counts | |
| 6.44 | Movements | One ADJUSTMENT per differing line, noted "Stocktake STK-0000xx" | |
| 6.45 | Try to apply the same session twice | Refused — an applied session is final | |

### Checklist 6G — settings and warehouses
| # | Step | Expected | P/F |
|---|---|---|---|
| 6.46 | Inventory → Settings | Three cards side by side: Sales leave from · Purchases land in · Assembly picks from | |
| 6.47 | Change "Sales leave from" | Saves; a green line explains where the rest comes from when it runs out | |
| 6.48 | The two switches below | "Staff pick a store per order" and "When every store is empty" (Allow-warn / Block) | |
| 6.49 | Set **Block**, then sell more than exists at the POS | The sale is refused | |
| 6.50 | Set **Allow, warn me**, sell again | The sale goes through and the row turns red on the board | |
| 6.51 | "Your stores" strip → **Manage in Setup** | Goes to Setup → Warehouses | |
| 6.52 | Setup → Warehouses: close a store that **holds stock** | Refused, and it names what is inside | |
| 6.53 | Close the **only** open store | Refused | |
| 6.54 | Close a store that Settings still points at | Refused, and it says which setting | |
| 6.55 | Delete a store with movement history | Refused — close it instead | |
| 6.56 | Short code of an existing store | Cannot be changed | |

---

## 7. SHOP-WIDE RULES (came out of Phase 3 — test these carefully)

### Checklist 7A — one payment list (DEC-GBL-001)
| # | Step | Expected | P/F |
|---|---|---|---|
| 7.1 | Setup → **Payment methods** | Coloured cards: Cash green, bKash pink, Nagad orange, Card blue, Bank navy, Other | |
| 7.2 | Switch **bKash OFF** | Toast "bKash is off everywhere"; the card greys | |
| 7.3 | POS → Sell (counter) → payment method list | bKash is gone | |
| 7.4 | Purchase bill → Add payment | bKash is gone | |
| 7.5 | Suppliers → Pay supplier | bKash is gone | |
| 7.6 | Returns → a refund payout | bKash is gone | |
| 7.7 | An old bill that was paid by bKash | Still says bKash — history is not rewritten | |
| 7.8 | Switch bKash back ON | It returns in all four places | |
| 7.9 | Try to switch off **Online payment** or **Cash on delivery** | Refused — those belong to the website | |

### Checklist 7B — accounts under a method (DEC-GBL-006)
| # | Step | Expected | P/F |
|---|---|---|---|
| 7.10 | Payment methods → Bank → **Add bank account** | Dialog: **Bank dropdown (39 Bangladeshi banks + Other)**, account number, holder, branch, routing | |
| 7.11 | Save with no bank or no number | Refused | |
| 7.12 | Save a full one | Card shows "Bank name · …last4 — branch · holder" | |
| 7.13 | bKash → add a **second** number | Two accounts under bKash | |
| 7.14 | POS or purchase → choose bKash | A second box appears: **"Which account…"** listing both | |
| 7.15 | Try to pay without choosing | Refused by the server | |
| 7.16 | Cash (one account only) | No extra question is asked | |
| 7.17 | Edit an account → **Delete** (two presses) | Deleted only if no money ever moved through it; otherwise refused with the reason | |
| 7.18 | Switch one account OFF | It disappears from the payment screens; the method stays | |

### Checklist 7C — one VAT rate (DEC-GBL-002) and one company identity (DEC-GBL-003)
| # | Step | Expected | P/F |
|---|---|---|---|
| 7.19 | Money → Finance → Settings; set VAT to 7.5% | Saved | |
| 7.20 | POS → Settings | Shows **7.5%**, read-only, with a link "Set in Finance" | |
| 7.21 | POS bill → VAT door | Uses the shop's rate | |
| 7.22 | Finance → VAT challan (Mushak 6.3) | The business name/BIN/address it prints are the ones from **Company settings** | |
| 7.23 | Change the BIN on the Mushak screen; open Administration → Company settings | The same new BIN is there — one copy only | |

### Checklist 7D — paisa (money precision)
| # | Step | Expected | P/F |
|---|---|---|---|
| 7.24 | POS: type a payment of **19.80** | Stays 19.80 | |
| 7.25 | POS: Adjustment − **.42** on a ৳1,814.42 bill | Grand total becomes ৳1,814.00 | |
| 7.26 | Purchase: discount **44.13** | Applies exactly | |
| 7.27 | Due board: collect **29.80** | Accepted; the due drops by 29.80 | |
| 7.28 | Returns: refund a part-compensation of 100 on a ৳507.5 line | The payout dialog says **100**, not 507.5 | |

---

## 8. CROSS-MODULE CIRCLES (the real proof)

Run these three from start to end without skipping.

### Circle 1 — buy → sell → the books
| # | Step | Expected | P/F |
|---|---|---|---|
| 8.1 | Buy 20 of an item at ৳8, receive, pay in full | Stock +20, cost = weighted average | |
| 8.2 | Transfer 5 from the storeroom to the shop | Storeroom −5, shop +5 | |
| 8.3 | POS: sell 2 from the shop | Shop −2; the bill lands on a counter bill page | |
| 8.4 | The counter bill page | Purple money rail, coloured payment rows, timeline, **New purchase / Sell (counter)** buttons | |
| 8.5 | Stock board | Numbers match every step above | |
| 8.6 | Inventory → Movements | PURCHASE, TRANSFER out/in, SALE — all present with the right notes | |

### Circle 2 — a customer returns something
| # | Step | Expected | P/F |
|---|---|---|---|
| 8.7 | Returns → New return; pick the counter bill | Only delivered orders can be picked; already-returned ones are marked | |
| 8.8 | Tick a line; **The goods**: Back on the shelf / Thrown away | Small "i" on each explains it; the page carries no loose paragraphs | |
| 8.9 | **How it is settled**: Money back | The refund dialog pays what was collected, never more | |
| 8.10 | Complete | Stock rises again (if Back on the shelf); Movements shows SALE_RETURN | |
| 8.11 | Repeat with **Store credit** | It asks **how much** credit; the customer's credit balance rises | |
| 8.12 | Repeat with **Replacement** | It asks **what goes out instead** (same goods by default, or pick another item); on complete, the returned item comes back AND the replacement leaves stock | |
| 8.13 | Repeat with **Keeps it, part back** | Only the agreed amount is paid out | |

### Circle 3 — the counting day
| # | Step | Expected | P/F |
|---|---|---|---|
| 8.14 | Waste 2 of an item without telling the system? (skip a step on purpose) | — | |
| 8.15 | Stocktake that store; count what is really there | Diff shows the missing 2 in red with the money | |
| 8.16 | Apply | Stock corrected; Movements records the adjustment | |
| 8.17 | Wastage & Gift → Analysis | The loss shows in the day graph and against the item | |

---

## 9. THINGS THAT ARE **KNOWN** AND NOT BUGS

Do not raise these; they are already on the board.

1. **New order (admin)** still quotes its own delivery methods, fees and time
   slots instead of reading the Delivery module (DEC-GBL-005).
2. **Offers → Coupons** shows sample coupon names.
3. **Return reasons** are a separate list from the wastage/gift reasons; they
   will be merged later.
4. **Movements** and **Inventory → Reports** were never restyled — they work,
   they are simply older-looking.
5. Test rows made by the owner exist in the demo (bKash accounts named
   "sobuj"/"sohag", items named test 2 / test 8, a "Due test" customer).
6. Phase 4 onwards (Products, Checkout, Orders, Delivery, POS deep-dive,
   Finance, Growth) has **not** been tested yet — anything odd there is out of
   scope for this round.

---

## 10. HOW TO REPORT

One table, one row per finding:

| # | Screen | Steps to reproduce | Expected | What happened | Severity | Screenshot |
|---|---|---|---|---|---|---|
| 1 | Inventory → Transfer | From = Radian Shop, add rose — Red, qty 999, Post | Warning then negative | Page froze | High | shot1.png |

**Severity:** High = money or stock is wrong, or the screen is unusable ·
Medium = a rule is not enforced, or the flow is confusing · Low = looks,
wording, alignment.

At the end, send back: the filled checklist (P/F per line), the findings
table, and one line — *"Which screen felt worst to use, and why?"*
