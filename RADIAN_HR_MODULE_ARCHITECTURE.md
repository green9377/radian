# Radian — Employee / HR Module Architecture (locked 28 Jul 2026)

> Owner locked the six open questions in the HR kickoff chat (28 Jul). Chat in
> Bangla; everything below in English per project convention. Companion docs:
> `RADIAN_HR_KICKOFF.md` (the questions), `RADIAN_FINANCE_MODULE_ARCHITECTURE.md`
> (accounts 5420 / 1210, FIN-RULE-003, DEC-FIN-014/023), `RADIAN_NEXT_CHAT_HANDOFF.md`.

---

## 1. Purpose

Finance has been paying salary (`5420 Staff Salary`) and handing out advances
(`1210 Employee Advance`) against a **typed name**. To the system, "Rakib",
"rakib" and "Rakib Hasan" were three different people, so nobody could say what
anyone actually owed.

This module turns that string into a real person, and closes the door behind it:
from now on money cannot be paid to anyone who is not on the staff list.

It also gives the shop the two things a payroll needs and nothing more — a daily
attendance sheet and a monthly run. Deliberately **not** a full HR suite.

## 2. Owned entities

| Entity | Notes |
|---|---|
| `Employee` | the person: contact, personal, employment, pay type + rate, optional login link |
| `Attendance` | one row per person per day; upserted, never deleted |
| `Payroll` | one run — a month (or a festival batch), draft → approved |
| `PayrollLine` | one payslip; pay type and rate are snapshotted onto it |

References (not owned):
`JournalLine.employeeId` — a nullable dimension on Finance's ledger, added
beside the existing `employeeName`. Additive migration; nothing is rewritten.

Explicitly **not** owned: `AppUser` (Administration), `Rider` (Delivery),
`Partner` (Finance), the ledger itself (Finance).

## 3. Decisions

### HR-D01 — `Employee` and `AppUser` are separate tables with an optional link
A login account is not a staff member. The cook is paid and never signs in; an
accountant may sign in and never be on payroll; a manager needs both. Merging
them forces a fake username on everyone who is paid, and leaves an empty salary
column on everyone who only signs in.

`Employee.appUserId` is nullable and `@unique` (one login belongs to at most one
person). The FK sits on the HR side so the auth module's table is not touched at
all — login and PIN keep working untouched.

### HR-D02 — `Rider` stays in Delivery, untouched and unlinked
Owner (28 Jul): *"there is no salaried rider right now, and I do not need a
separate employee record for riders — if I ever hire one, they are an ordinary
employee."*

So no `Rider.employeeId`, no changes to the Delivery module, no risk to the live
`DeliveryAssignment` history. If a "rider X delivered 124 parcels and costs ৳12,000"
view is ever wanted, a nullable column on `Rider` adds it later without breaking
anything. Cheap to add, so it is not added speculatively.

### HR-D03 — Three pay types, one rate each
`MONTHLY` (a fixed figure whatever the days), `DAILY` (festival helpers), and
`HOURLY` (owner asked for this explicitly — evening part-timers).

Designation is **free text with suggestions**, not a master table. A curated
designation list is one more thing to maintain for a shop with eight people; the
admin offers the existing distinct values in a `datalist`, which removes most of
the spelling drift for no schema cost. Revisit if the list ever gets messy.

**Branch is deliberately absent** — there is no `Branch` table in the schema yet.
A field with no master behind it is a free-text trap.

### HR-D04 — Daily attendance, for everyone
Owner overruled the lighter option (write the day-count once at payroll time).
Accepted with one design condition that decides whether it survives contact with
a real shop: **the sheet opens with everybody already on `PRESENT`.** A normal
day is open-and-save; only exceptions are touched. A sheet that starts empty
stops being filled in by week two, and then payroll is done from memory anyway —
which is the lighter option, reached the expensive way.

Hours are only shown and only stored for `HOURLY` staff, in whole **minutes**, so
no float ever reaches a money calculation.

### HR-D05 — Bonus is a free amount; leave is marked, not counted
Bangladesh Labour Act 2006 sets casual leave 10 days, sick leave 14, earned leave
1 per 18 worked, 11 festival days and two festival bonuses a year. What applies
to a particular establishment depends on registration and headcount, and this is
not legal advice — the owner will confirm with an accountant.

What the **system** does was scoped accordingly:
- Bonus / overtime / incentive = a free `extraPaisa` + note on the payslip. One
  path for all of them, amount decided by the owner.
- Leave is recorded on the day sheet as paid or unpaid, and paid leave earns a
  `DAILY` day. **No entitlement balance is computed.** Coding a legal formula
  that may not apply produces a confidently wrong number, which is worse than no
  number.
- Provident fund and gratuity: out of scope. Not running today.

### HR-D06 — No employee on the list, no money (the owner's rule)
Owner (28 Jul): *"if the name is not in my employee list, it should not appear as
an option to give advance or salary. To pay, they must be on the list first."*

This is stronger than the matching screen originally proposed, and better: it
removes the failure mode instead of cleaning up after it.

Consequences, implemented:
- `StaffAdvanceDto` / `StaffSalaryDto` take `employeeId`. The name field is gone
  from the request. `FinanceService.requireEmployee()` rejects anything else.
- The server writes **both** `employeeId` and `employeeName` on the ledger line,
  taking the name from the Employee row.
- `JournalLine.employeeName` stays for ever. It is what the entry said on the day
  and a posted entry is never rewritten (FIN-RULE-003). Rows posted before this
  module have the name and no id; they are reported as *"before the staff list"*
  and never guessed at.
- No bulk matching screen was built. Practice data is being cleared anyway, so
  the population is near zero.

### HR-D12 — Every person has their own full-day length
Owner, on seeing the day sheet: *"one person's duty may be 8 hours, another's 12
— how do I read half day or full day if there is no time?"* He was right, and the
first design was wrong: `HALF_DAY` was a label with no quantity behind it.

`Employee.dutyHoursPerDay` (default 8) is what a **full day means for that
person**. Everything reads against it:

- Half day = half of *their* day — 6 h on a 12-hour shop day, 2 h on a 4-hour
  evening shift. Pressing the button fills that number in, and it can be typed
  over.
- Hours are now recorded for **everyone**, not only hourly staff. For `HOURLY`
  they are the pay; for the other two they are the record, so a monthly person
  who worked twelve hours on Valentine's Day leaves a trace.
- `PayrollLine.absentDays` carries the unpaid part of the month, and the payroll
  screen offers a monthly deduction as `rate × absent ÷ days recorded` — with
  the arithmetic visible, and **never applied on its own**. A monthly salary is
  an agreement; the system does not get to reinterpret it silently (HR-D05).

The identity `paid days + absent days = days recorded` holds by construction,
which is what makes that deduction explainable rather than magic.

### HR-D13 — Clock times: a usual shift, and what actually happened
Owner: *"there is no entry time and no leaving time."* Hours alone are a
conclusion; the times are the evidence.

- `Employee.shiftStart` / `shiftEnd` — their usual shift, optional (casual
  helpers have none). Plain `HH:MM` text, because that is exactly what an
  `<input type="time">` speaks and a shift has no timezone of its own.
- `Attendance.inTime` / `outTime` — what actually happened that day. The sheet
  arrives pre-filled from the usual shift, so an ordinary day still needs no
  typing.
- **An out-time at or before the in-time means the shift crossed midnight**, not
  an error. Radian runs midnight deliveries; 20:00 → 01:00 is a real five-hour
  shift. Both the server and the screen read it that way.
- Hours come from the most specific thing available: what was typed → the gap
  between in and out → the person's `dutyHoursPerDay`. The hours box stays
  editable on top of the clock, because an hour of the day may have been lunch;
  when it is overridden the row says so.

### HR-D14 — Documents can be attached while hiring
The Documents tab only existed on a saved employee, so during hiring there was
nowhere to put the NID copy or the signed contract — and the owner reasonably
read that as "there is no document upload".

Files chosen on the New employee form are now held in the browser and posted the
instant the create succeeds. If one fails, the person is still saved and the
message says which attachment to retry — losing the employee record because a
scan was too large would be the wrong trade.

Suggested titles cover what was actually asked for: NID copy, birth certificate,
job contract / commitment letter, educational certificate, guardian's NID,
passport photo, bank details, reference letter, police verification.

### HR-D15 — The clock and the status keep each other honest
Owner: *"present / half / leave should work off the time."*

They now work both ways. Pressing a status fills the times; typing the times
re-reads the status:

| Hours worked | Status |
|---|---|
| nothing | Absent |
| under 75 % of *their* day | Half day |
| 75 % or more | Present |

**Leave is never derived.** A clock can say somebody was not here; it cannot say
whether it was approved. That is a decision, so it stays a button, and once
pressed the times stop overriding it.

The rule lives in `attendance.service.ts` as well as in the screen, so an API
caller cannot write a row whose status and hours disagree (HR-R20).

The time fields themselves are styled down (`.time-field` in `globals.css`) —
the browser's native control is tall, wide and carries a grey clock button that
fights the rest of the panel. The picker still opens; it is simply quiet.

### HR-D07 — Payroll posts one completed event, then freezes
A run is free to edit while `DRAFT`. Approving posts a single balanced entry
through `FinanceService.postEntry()` and the run is frozen. A mistake found later
is corrected by **reversing that entry in Finance** (DEC-FIN-014), never by
editing history.

`sourceKey = PAYROLL:<payrollNo>` makes double-approval a silent no-op
(DEC-FIN-023).

### HR-D08 — Advance recovery is never automatic
The draft proposes `0`. The owner types how much comes back this month. A system
that collects the whole outstanding balance by default sends somebody home with
nothing on payday.

### HR-D09 — Personal columns are OWNER-only, enforced server-side
NID, date of birth, address and next of kin come back `null` for a `MANAGER`,
with a `privateHidden` flag so the UI can explain the blank. Enforced in
`EmployeesService.mask()`, not in the UI — hiding a field is not the same as not
sending it. The editor also omits those keys when saving as a MANAGER, so a save
cannot blank what the manager could not see.

## 4. Business rules

| # | Rule |
|---|---|
| HR-R01 | Name + joining date are the only required fields |
| HR-R02 | Soft delete only; `INACTIVE` hides from pickers and keeps history |
| HR-R03 | Audit + timeline on every write |
| HR-R04 | Advance outstanding is **derived** from the ledger (1210 + `employeeId`), never stored |
| HR-R05 | Advance recovery is owner-decided, and can never exceed what is owed |
| HR-R06 | More than one run per period is allowed, but the second one warns |
| HR-R07 | Pay type and rate are snapshotted onto the payslip |
| HR-R08 | `DRAFT` is editable, `APPROVED` is frozen — corrections go through Finance |
| HR-R09 | Sequential `EMP-000001` / `PAY-000001` numbers |
| HR-R10 | Personal columns are OWNER-only |
| HR-R11 | An employee with an open advance or an unapproved payslip cannot be removed |
| HR-R12 | One attendance row per person per day (upsert, never delete) |
| HR-R13 | A future day cannot be marked |
| HR-R14 | Minutes only apply to `HOURLY` staff |
| HR-R15 | A day inside an approved payroll is frozen |
| HR-R16 | HR never writes a `JournalLine` — it emits one completed event to Finance |
| HR-R17 | No salary without a real employee (structural: a payslip needs an `employeeId`) |

### Base pay

| Pay type | Base |
|---|---|
| `MONTHLY` | the agreed figure. Absence is an **explicit deduction**, visible on the payslip, not hidden inside an arithmetic |
| `DAILY` | paid days × rate (present 1, half day 0.5, paid leave 1, unpaid leave / absent 0) |
| `HOURLY` | minutes ÷ 60 × rate |

`earned = base + extra − deduction` · `net = earned − advance recovered`

### The journal entry on approval

```
Dr 5420 Employee Salary     earned, one line per person  (employeeId dimension)
Cr 1210 Employee Advance    recovered, one line per person
Cr <money account>          net total
```

Balanced by construction, since `net = earned − recovered`.

## 5. Screens (`apps/admin`)

| Route | What |
|---|---|
| `/employees` | staff list; leads with advance outstanding, because that is why this module exists |
| `/employees/new`, `/employees/[id]/edit` | editor |
| `/employees/[id]` | the person: overview · attendance · payslips · money history · activity |
| `/employees/attendance` | the day sheet, everybody pre-marked present |
| `/employees/payroll` | runs, and the "build a month" box |
| `/employees/payroll/[id]` | the run: edit, then approve (OWNER + PIN) |
| `/finance/staff` | rewritten — employee picker, no name box |

⚠️ `/employees/[id]` is dynamic; `new`, `attendance` and `payroll` are reserved
static names (same Nest/Next trap as `/suppliers`, `/purchases`).

## 6. API surface (`/hr`)

`GET|POST /hr/employees` · `/hr/employees/stats` · `/hr/employees/payable` ·
`/hr/employees/designations` · `/hr/employees/trash` ·
`GET|PATCH|DELETE /hr/employees/:id` · `/hr/employees/:id/timeline|ledger|payslips|attendance` ·
`POST /hr/employees/:id/restore`
`GET|POST /hr/attendance`
`GET|POST /hr/payroll` · `GET|PATCH|DELETE /hr/payroll/:id` ·
`DELETE /hr/payroll/:id/lines/:employeeId` · `POST /hr/payroll/:id/approve`

Whole controller: `@Roles('OWNER','MANAGER')`. Approve: `@Roles('OWNER')` +
`@NeedsPin()`. Actor name comes from the session (ActorInterceptor), never a
typed field.

## 7. Cross-module log

| Module | Change |
|---|---|
| Finance | `JournalLine.employeeId` added beside `employeeName`; `LineInput.employeeId`; `postEntry` and `reverseEntry` carry it; `staffAdvances()` groups by person and flags pre-HR rows; `giveStaffAdvance` / `payStaffSalary` require `employeeId`; the staff report groups by person, not by name string |
| Auth | `AppUser.employee` back-relation only. No columns, no behaviour changed |
| Delivery | **nothing** (HR-D02) |
| Prisma | `Attendance` and `PayrollLine` added to `NO_SOFT_DELETE` |

## 8. Non-goals this cycle

Leave entitlement balances · provident fund · gratuity · shifts and rosters ·
overtime multipliers · document/file upload (photo is a data URL, as everywhere
else) · branch assignment (no `Branch` table exists) · bulk matching of pre-HR
ledger names (HR-D06 made it unnecessary) · employee self-service.

## 9. Review — 28 Jul 2026 (owner asked for a full pass)

Findings and what was done. Severity uses the architecture-review scale.

### 🔴 Fixed — the same person could be paid twice for a month
Building a run twice and approving both paid everyone twice. The only guard was
a warning returned by `build()`, which is shown once and gone on reload.

Now: `build()` **leaves out** anyone already paid for that period, and
`approve()` **refuses** outright, naming them. This is also what finally makes
HR-R06 ("more than one run per period") safe — the festival batch simply picks
up whoever the monthly run did not. (HR-R22)

### 🟠 Fixed — a leaver was a dead end
`payable()`, the attendance sheet and `build()` all filtered on *status ACTIVE
today*. So somebody who resigned on the 20th could not be paid for the twenty
days they worked, and — worse — an advance they were still holding could never
be recovered, only forgotten.

Now the question everywhere is **"were they employed during this period"**, not
"are they active today". Finance still refuses a *new* advance to a leaver
(that money is unlikely to come back) but allows a final settlement. (HR-R21,
HR-R25)

### 🟠 Fixed — the privacy rule was decorative
HR-R10 hid the NID **number** from a MANAGER while the Documents tab handed over
a scan of the same card. Documents are now OWNER-only, enforced in the service.
(HR-R26)

### 🟠 Fixed — approval trusted a stored total
`approve()` derived each debit from `base + extra − deduction` but took the
credit from the stored `netPaisa`. Any disagreement between them surfaced as a
baffling "entry does not balance". Every figure is now recomputed from its parts
at approval, and a stale stored total is repaired rather than believed.
(HR-R24)

### 🟡 Fixed — a silent zero payslip
A daily or hourly person with no attendance recorded earned ৳0 and the run
approved without comment. Build now says so by name before the money moves.
(HR-R23)

### 🟡 Fixed — practice data could delete a real draft
`clear()` matched payroll runs with `lines: { every: … }`, and `every` is true
for a run with **no** lines — so an empty draft the owner had just started was
swept away with the samples. Now pinned with `some` as well.

### 🟡 Fixed — soft delete with no way back
`restore()` had existed since the first build with nothing linking to it, which
makes a soft delete no better than a hard one. Added **Staff → Removed staff**.

### Self-test — 62 passed, 2 failed, both real
`apps/api/src/hr/hr.selftest.ts`, run by `radian_hr_selftest.bat`. It invents its
own staff, marks a week, gives an advance, runs and approves a payroll, opens the
resulting journal entry and checks it, then tries every rule that is supposed to
say no. Everything it makes is tagged `[selftest]` / `SELFTEST:` and removed
again, before and after.

Two things the desk review had missed:

**🟠 A draft accepted an impossible advance recovery.**
`patch()` only compared the recovery with what the payslip was worth, never with
what was actually owed — that check lived in `approve()` alone. So ৳5,000 could
be set against a ৳3,000 advance, sit in the draft looking fine, and be refused at
the very last step after the whole month had been worked through. The check now
happens while editing. (HR-R27)

**🟠 Somebody who left owing nothing could not be paid at all.**
`payable()` kept leavers only if they still held an advance. A person who
resigned owing nothing therefore vanished from Finance's picker before their
final salary went out. Leavers are now reachable for 90 days after leaving, or
indefinitely while they hold an advance.

Both were found by the test rather than by reading — which is the argument for
having written it.

**🔴 And then the re-run found the one that mattered most.**
Fixing the two above and running again turned up a third, worse thing:
`approve()` marked a run **APPROVED even when nothing reached the ledger**.

`postEntry()` returns `null` when it judges an entry a duplicate
(FIN-RULE-021 — same `sourceKey`). Correct for an event replay. Here it meant
the screen said *paid*, the month froze, payslips existed — and no money was
recorded anywhere. No error, no clue. Approval now refuses outright unless a
real entry comes back. (HR-R28)

It surfaced because of a mistake in the test itself: its cleanup removed
everything tagged `SELFTEST:` but not the payroll entry, whose key is
`PAYROLL:<no>` and carries no tag of ours. That entry stayed in the ledger, the
next run reused the payroll number, and the keys collided. The leak is fixed
too — the cleanup now sweeps orphaned `PAYROLL:` entries, which cannot belong to
anything real because an approved run can never be deleted through the app.

Worth recording plainly: the most dangerous bug in this module was found by an
accident inside the test, not by the design review, not by reading the code, and
not by using the screens. **Final: 65 passed, 0 failed, nothing left behind.**

### 🟢 Noted, deliberately left alone
- `PayrollBuildDto.periodStart/periodEnd/employeeIds` and `EmployeeRole.sortOrder`
  are not reachable from any screen yet. They cost nothing, and the festival-batch
  case will want them.
- `Payroll.paidFromId` is a soft reference rather than an FK, matching
  `RecurringExpense.paidFromId`. Consistent with the module around it.
- The 75 % half-day threshold is a constant, not a setting. One number, and a
  setting nobody ever changes is a setting nobody understands. Revisit if asked.

## 10. Open — needs the owner

1. **Designation as free text** — confirm, or ask for a small master list later.
2. **Branch** — confirm one location for now.
3. **Documents** — NID number is stored as text; no file upload. Confirm that is
   enough, or say what needs to be scanned and kept.
4. **Legal** — HR-D05's scope should be checked with an accountant before the
   first Eid bonus.
