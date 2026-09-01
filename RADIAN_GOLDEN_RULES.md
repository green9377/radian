# RADIAN — GOLDEN RULES

_The permanent engineering decision framework for Radian. **The twelve rules
below were approved by the owner on 2 Sep 2026.**_

⚠️ **Not everything in this file is approved.** The twelve rules are. Sections
after them carry an explicit status — *approved principle*, *implemented on an
unmerged branch*, *proposed*, or *open decision* — and those four are not the
same thing. Nothing marked *proposed* or *open decision* may be implemented
without the owner's approval.

**Read this before proposing anything.** It applies to architecture, code,
integrations, testing, data, deployment, security and production readiness. When
a proposed change conflicts with a rule here, **stop, explain the conflict,
propose the safest alternative, and wait** — do not implement the conflicting
part.

---

## The core idea

We are not building two systems. We are building **one Radian system**, and DEV
is where we build, test, fix and fully validate it.

```
Development → complete testing → verification → production readiness
            → promote the verified system → Production
```

Production must never require rebuilding functionality that was never properly
tested. **DEV is the full rehearsal for Production.**

---

## The twelve rules

### 1. DEV is a full production rehearsal

DEV is not a demo, a fake system, a reduced-feature build or a traditional
sandbox. Everything that will exist in Production must be properly testable in
DEV: the website, the admin, orders, customers, inventory, payment, SSLCommerz,
WhatsApp, SMS, email, Messenger, Instagram, webhooks, pollers, AI, automation,
OTP, order notifications, marketing, background jobs, refunds, cancellations,
error handling, reporting, database workflows and external integrations.

**A feature must not be disabled simply because the environment is DEV.**

### 2. Safety is not feature limitation

If something is risky in DEV, do not answer the risk by making the feature
incomplete.

| wrong | right |
|---|---|
| fake payment, fake WhatsApp, fake SMS | real technology |
| mock API, disabled automation | real workflow |
| a dummy flow that does not behave like Production | **controlled target** |

The principle is **real technology + real workflow + controlled target**. Safety
comes from isolation and guards, never from removing functionality.

### 3. DEV and PROD must be environmentally isolated

Business logic and functionality stay as consistent as possible. What separates
is the environment:

| DEV | PROD |
|---|---|
| development domain | production domain |
| development database | production database |
| development media | production media |
| development env vars | production env vars |
| DEV integration accounts where required | production integration accounts |

**One environment must never accidentally use another environment's resources.**

### 4. DEV must pass before PROD

```
feature → development → DEV deployment → real workflow testing → bug fixing
        → retest → final DEV verification → review → Production
```

A feature that has not been verified in DEV is not production-ready.

### 5. Production is not the testing ground

Production must not be the first place we discover whether something works.
Payment, messaging, WhatsApp, SMS, email, Meta, AI, automation, background jobs
and migrations are all tested before Production.

### 6. Real integration does not mean real customers

We want real integration testing, and DEV stays a **full real-system
rehearsal**. It must be possible to test real outbound flows — SMS, WhatsApp,
Meta, payment — with **arbitrary real recipients**, when a person intentionally
runs that test. **DEV is not reduced to a fixed list of test numbers.**

What must never happen is a real customer becoming a test target **by
accident**: a bulk send, a runaway automation, a job that should not have
fired, a wrong recipient.

```
DEV SMS       → real SMS provider
DEV WhatsApp  → real WhatsApp API
DEV Meta      → real Meta API / webhook
```

The technology and the workflow stay real.

⚠️ **How the protection against accidental, bulk and wrong-recipient sending is
built is an OPEN DESIGN DECISION** (owner, 2 Sep 2026). The rule above is
approved; the mechanism that enforces it is not decided, and nothing about it
may be treated as settled.

### 7. An environment mismatch must protect itself

Do not rely on a person remembering which environment they are in. The system
detects the dangerous mismatches and refuses, or safely disables the affected
integration:

- DEV using the PROD database, or PROD using the DEV database
- DEV using PROD Meta credentials, or PROD using DEV credentials
- a deployment landing in the wrong folder
- a production deployment made from the wrong branch
- **Production starting with DEV-only outbound safety settings** (an allowlist
  or a catch-all redirect) — it must fail at startup rather than silently
  redirect real customers' messages

### 8. DEV and PROD data are separate

DEV and PROD never share a database. **There is no automatic DEV → PROD data
flow.** Any deliberate copy or migration is explicit, reviewed, controlled and
auditable.

### 9. No normal direct production editing

```
feature branch → DEV → testing → review → main → production branch → PROD
```

Editing code on the production server is not a normal workflow. An emergency
change is reconciled into git history afterwards.

### 10. "Works on DEV" means end to end

A page that opens and an HTTP 200 are not verification. Payment, for example,
means:

```
order → payment initiation → gateway → payment result → callback/IPN
      → validation → order settlement → database update → notification
      → admin visibility
```

The same applies to Meta, WhatsApp, SMS, AI, orders and automation.

### 11. No hidden production surprises

Temporary development-only behaviour must never reach Production unnoticed:
hardcoded values, test credentials, mocks, bypasses, disabled features,
temporary webhooks, temporary cron jobs, test-only conditions. Before
Production, each one is explicitly identified and resolved.

### 12. Architecture before code

Before a significant change, answer:

1. How will it work in DEV?
2. How will the same functionality work in PROD?
3. Is the difference genuinely environment-specific?
4. Can the complete production workflow be tested in DEV?
5. Can DEV accidentally affect PROD?
6. Can PROD accidentally use DEV resources?
7. What happens when it fails?
8. How will it be verified before Production?

Then implement.

---

## Outbound messaging

> ### ⚠️ STATUS — read this before the rest of the section
>
> **There is no outbound guard in `main`, and none running.** The code exists
> only on the unmerged branch **`outbound-guard`** — not merged, not deployed.
> The running development stack has no such protection today.
>
> **The safety ARCHITECTURE is an OPEN DESIGN DECISION** (owner, 2 Sep 2026).
> The branch's first model gated on *who the recipient is* — a fixed allowlist
> of approved test numbers. That model has been **ruled out**: DEV must stay a
> full real-system rehearsal and must be able to reach **arbitrary real
> recipients** when a person intentionally runs a test.
>
> That is **not** a decision to remove safety. Protection against accidental,
> bulk and wrong-recipient sending is still required. **What that protection
> looks like is not decided**, and nothing below may be read as approved beyond
> what is explicitly marked as such.

### Approved principle — the three doors

There are exactly **three external outbound doors**:

| door | file | covers |
|---|---|---|
| A | `common/whatsapp-cloud.ts` `sendRaw()` | WhatsApp |
| B | `messaging/channel-sender.service.ts` `post()` | Messenger, Instagram |
| C | `marketing/messaging.service.ts` `sendSms()` / `sendEmail()` | SMS, email |

**Every external message must pass the safety check at the door, immediately
before the provider call.** OTP, order messages, the sweeper, the AI agent,
inbox replies, marketing and admin tools are **callers, not doors** — safety
logic is not scattered across them, because a check at a caller is a check the
next caller forgets.

A blocked attempt must **never be silently discarded**. What tried to send, on
which channel, to whom, why it was refused, when, and from which environment
must all be recoverable — with the recipient masked in logs and screens.

### Implemented on the unmerged branch `outbound-guard` — under review

Recorded so the state is not lost. **Not merged, not deployed, and the second
step is the one the owner has put back under review.**

```
kill switch → environment allowlist → rate limit → optional catch-all → provider
```

On that branch, an empty allowlist means *everyone* on the live stack and
*nobody* anywhere else. **That allowlist model is the part now under review**
(see the status box above). The kill switch, the rate limit, the audit trail and
the placement at the three doors are not what is in question.

---

## Test scripts

Any script that creates orders, customers, payments, messages, inventory
movements or other business transactions must be **environment-aware**. It must
not be able to create test business data in Production.

**A warning is not protection** for a destructive or business-writing
operation. The script must refuse.

---

## The current DEV is not disposable

The DEV environment already holds real business data, real customer
conversations and real integrations. Until Production exists and the business is
deliberately moved there: protect the database, protect customer data, protect
the integrations, keep backups, and test changes carefully.

**The fact that it is called DEV does not make it safe to break.**

---

## Do not over-engineer

These rules are not permission to rewrite working parts of Radian. If an
existing implementation works and breaks no rule here, **leave it alone**.

Prefer *smallest safe change + existing working system + strong boundary* over a
large rewrite.

---

## Approval boundary

Inspecting, researching, testing and explaining need no wait, as long as nothing
is modified.

Before a significant change to **architecture, the database, production,
external integrations, DNS, payment, security boundaries, data migration, or the
branch/deployment structure**, first present:

1. current behaviour
2. the problem or risk
3. the proposed solution
4. files and systems affected
5. the test plan
6. rollback and residual risk
7. DEV vs PROD impact

Then wait for approval. **Never make an architectural decision silently.**

---

## Language

All technical artifacts in this repository are written in **English** —
documentation, architecture and deployment notes, code comments, configuration
descriptions, admin and system messages, logs, test names and self-test output.

- new technical documentation: English
- new code comments: English
- new system, admin, log and test text: English
- **existing Bengali content is not mass-converted.** It is translated
  gradually, only when a file is already being modified for another reason and
  translating it is the smallest safe change.

Conversation with the owner is in Bengali. Customer-facing product content may
be Bengali where the product intends it.

---

## Where the rest is written down

| file | what it holds |
|---|---|
| `CLAUDE.md` | the standing brief a new session reads first |
| `RADIAN_ENVIRONMENTS.md` | what runs where, backups, DNS. ⚠️ its outbound-guard section exists **only on the `outbound-guard` branch**, not in `main` |
| `RADIAN_PENDING.md` | the live board of work in progress |
| `RADIAN_PHASE*_DIRECTION.md` | how each phase was handed over |

---

## Open gaps this framework has already exposed

Recorded so they are not lost. **Four statuses, and they are not the same
thing:**

| status | what it means |
|---|---|
| **approved principle** | the owner has approved the rule. How and when it is built is still to be decided |
| **implemented (unmerged branch)** | code exists on a branch. **Not in `main`, not deployed**, and merging it is not approved |
| **proposed** | a recommendation out of review. **Not decided** |
| **open decision** | waiting on the owner |

⚠️ **Nothing here is approved for implementation.** Where a row says code
exists, that means it exists on a branch — never that it is live.

| gap | status |
|---|---|
| **The DEV outbound safety architecture.** The fixed-allowlist model was ruled out on 2 Sep; DEV must reach arbitrary real recipients on an intentional test, while accidental, bulk and wrong-recipient sending is still prevented. The mechanism is undecided | **open decision** |
| The three-door placement, the kill switch, the rate limit and the audit trail | **approved principle**, and **implemented (unmerged branch)** `outbound-guard` |
| Production must refuse to start with DEV-only outbound settings (rule 7) | **approved principle** — not implemented |
| Startup guards for environment, database, Meta credentials, deployment folder and stack identity (rule 7) | **approved principle** — not implemented |
| The runtime kill switch is in memory, so a restart silently lifts it. Making it survive a restart before Production is an engineering recommendation, not an owner ruling | **proposed** |
| `RUN_TESTS.bat full` writes real orders and has no environment check. Today it cannot reach Production only because its address is dead — protection by accident, not by design. The owner has approved that **protection is added before the address is corrected**; the form of that protection is not chosen | **approved principle** · form is an **open decision** |
| DEV will use **real SSLCommerz payment** for end-to-end testing (owner, 2 Sep). A DEV order prefix is the **preferred direction** for telling DEV and PROD transactions apart, pending the merchant-account questions. `ORDER_NO_PREFIX` exists **only on the `outbound-guard` branch** and is **not in use**. A second Store ID is one option, not a requirement | payment **approved** · prefix **approved direction, not implemented** · Store ID **open decision** |
| Meta: giving DEV its own Page, Instagram account and app — with the same permissions, so the DEV integration is not weaker — is a **recommendation** from review. Not approved, and it depends on checking Meta's permission and app-review requirements first | **proposed / open decision** |

---

_This document is the permanent decision framework. It changes only by the
owner's decision, and the change is recorded here._
