"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { confirmPhoneCode, resendPhoneCode } from "../../_data/checkoutApi";
import { formatTaka } from "../../_data/products";
import { API_BASE } from "../../_data/shop";
import { track } from "../../_data/tracking";
import { useOrderHydrated, useOrderStore } from "../../_store/useOrderStore";
import Icon from "../Pdp/PdpIcons";
import DeliveryTimeline from "./DeliveryTimeline";

/*
  /order-success — shows what checkout just built.

  ❌ No "Create my account / set a password" CTA (§11 retro-fix) — asking for
     a password before the Auth module exists means creating an account
     nobody can ever sign in to.
  ❌ No "Need Help" section — D19.

  Track this order → /track?id=RAD-XXXXX (delivery timeline).

  ═══════════════════════════════════════════════════════════════════════════
  ⚠️ THE `?id=` IN THE URL DECIDES WHAT IS SHOWN. It did not, until 27 Aug
  2026, and the money circle walk found what that cost.

  This page used to render `useOrderStore.last` — whatever order THIS BROWSER
  placed most recently — and ignore the URL completely. After paying at the
  gateway the customer comes back to `/order-success?id=RAD-74146`, and the
  page showed RAD-82739 with a different receipt: a real test, a real
  mismatch. Three ways that hurts, worst last:

    · the customer reads a number that is not their order, and a total that is
      not what they paid, and concludes the shop is broken
    · on a shared device it is the PREVIOUS person's order — their name, their
      address, their receipt
    · with nothing in local storage — a different device, cleared data, or
      simply a browser that dropped it — `missing` fired and the customer who
      had just paid was redirected to the homepage with no confirmation at all

  So: the local receipt is shown only when it IS the order in the URL.
  Otherwise the page asks the server about that order number and shows the
  little it can prove.

  ⚠️ AND IT SHOWS ONLY THE LITTLE IT CAN PROVE. A `?id=` is a guessable order
  number in an address bar; it is not identity. The confirmed-from-server view
  carries the order number and whether it is paid, and nothing else — no
  receipt, no address, no name. The same reasoning that keeps /track to a
  timeline: that number may be in the receiver's hand, and a surprise must not
  spoil itself.
  ═══════════════════════════════════════════════════════════════════════════
*/

/*
  ─── The code box (DEC-WA-010) ────────────────────────────────────────────

  The owner's ruling, 29 Aug: the ORDER GOES THROUGH FIRST and the number is
  proved afterwards. So this block sits below a finished order and can be
  ignored entirely — nothing here can undo or delay anything.

  Why ask at all, then. Every message this shop sends about this order —
  confirmed, on its way, delivered — goes to that number. A number that
  cannot receive means a customer who hears nothing and a shop that does not
  know it. One code answers that.

  ⚠️ Never says which channel failed. The customer is told where the code
  WENT, never where it did not: "no WhatsApp on this number" is a fact about
  a stranger that a public page should not hand out.
*/
function PhoneVerifyBlock({ phone, email }: { phone: string; email?: string }) {
  /*  Opens already in the "we sent it" state: checkout sent a code on the way
      here, so asking the customer to press Send first would mean a second
      code for no reason while the first is still in the air.  */
  const [state, setState] = useState<"sending" | "sent" | "done" | "gone">("sent");
  const [sentTo, setSentTo] = useState<{ via: string | null; to: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (code.trim().length !== 6 || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await confirmPhoneCode(phone, code.trim());
      /*  Two different "no" here: the call failed (r.ok false), or the call
          worked and the code was simply wrong (r.data.ok false). The customer
          is told the same thing either way — which code was wrong is not
          something a public page should help anyone narrow down.  */
      if (r.ok && r.data.ok) setState("done");
      else setErr("That code did not match. Check it, or send a new one.");
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setState("sending");
    try {
      const r = await resendPhoneCode(phone, email);
      if (r.ok && r.data.sent) {
        setSentTo({ via: r.data.via, to: r.data.to });
      } else {
        /*  The rate limiter's message is worth showing — "wait 40 seconds" is
            useful. Anything else is not explained away.  */
        setErr(
          (r.ok ? r.data.error : r.message) ?? "We could not send a code right now.",
        );
      }
      setState("sent");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "We could not send a code right now.");
      setState("sent");
    } finally {
      setBusy(false);
    }
  }

  if (state === "gone") return null;

  if (state === "done") {
    return (
      <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#E8F9EE] px-5 py-2.5 text-[13.5px] font-semibold text-[#0E7A3D]">
        <Icon name="check" className="w-4 h-4" />
        Number confirmed — you will get every update here.
      </div>
    );
  }

  const where =
    sentTo?.via === "EMAIL"
      ? `your email (${sentTo.to})`
      : sentTo?.via === "SMS"
        ? "you by SMS"
        : "your WhatsApp";

  return (
    <div className="mt-7 mx-auto max-w-[420px] rounded-[20px] border-[1.5px] border-lavender-deep bg-white p-5 text-left">
      <p className="text-[14px] font-semibold text-purple">Confirm your number</p>
      <p className="text-[13px] text-body-soft mt-1 leading-relaxed">
        We sent a 6-digit code to {where}. Entering it makes sure every update about this order
        reaches you.
      </p>

      <div className="flex gap-2 mt-3.5">
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          className="flex-1 min-w-0 h-[46px] rounded-[14px] border-[1.5px] border-lavender-deep px-4 text-[15px] tracking-[3px] font-semibold text-purple outline-none focus:border-orchid"
        />
        <button
          type="button"
          disabled={busy || code.length !== 6}
          onClick={() => void submit()}
          className="h-[46px] px-5 rounded-[14px] bg-purple text-white font-semibold text-[14px] disabled:opacity-40 hover:bg-purple-deep transition-colors"
        >
          {busy ? "…" : "Confirm"}
        </button>
      </div>

      {err && <p className="text-[12.5px] text-[#B4232A] mt-2">{err}</p>}

      <div className="flex items-center justify-between mt-3">
        <button
          type="button"
          onClick={() => void resend()}
          disabled={busy}
          className="text-[12.5px] font-semibold text-purple hover:text-orchid disabled:opacity-40"
        >
          {state === "sending" ? "Sending…" : "Send a new code"}
        </button>
        {/*  Skipping is allowed and says so. The order is already placed;
             pretending otherwise would be a lie on a receipt.  */}
        <button
          type="button"
          onClick={() => setState("gone")}
          className="text-[12.5px] text-body-soft hover:text-purple"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

/** what the server will admit about an order to somebody holding its number */
interface PaidCheck {
  found: boolean;
  orderNo?: string;
  duePaisa?: number;
  paid?: boolean;
  cancelled?: boolean;
}

export default function OrderSuccessView() {
  const router = useRouter();
  const params = useSearchParams();
  const hydrated = useOrderHydrated();
  const order = useOrderStore((s) => s.last);

  /*  Upper-cased because order numbers are, and a customer re-typing the link
      by hand should not be told their order does not exist.  */
  const wantedNo = (params.get("id") ?? "").trim().toUpperCase();

  /*  The local receipt is only this order's receipt when the numbers agree.
      With no `?id=` at all the page is being reached straight from checkout,
      where the store IS the order — that path is unchanged.  */
  const localIsTheOne = !!order && (!wantedNo || order.id.toUpperCase() === wantedNo);

  const [remote, setRemote] = useState<PaidCheck | null>(null);
  const needRemote = !!wantedNo && hydrated && !localIsTheOne;

  useEffect(() => {
    if (!needRemote) return;
    let alive = true;
    fetch(`${API_BASE}/shop/payment/due/${encodeURIComponent(wantedNo)}`)
      .then((r) => r.json())
      .then((d: PaidCheck) => { if (alive) setRemote(d); })
      /*  Fail-soft: the money is already taken and the gateway has already
          sent them here. A network hiccup must not turn into a blank page —
          the fallback below still names their order.  */
      .catch(() => { if (alive) setRemote({ found: false }); });
    return () => { alive = false; };
  }, [needRemote, wantedNo]);

  /*  Only send them away when there is genuinely nothing to show: no order in
      this browser AND no order number in the URL.  */
  const missing = hydrated && !order && !wantedNo;

  useEffect(() => {
    if (missing) router.replace("/");
  }, [missing, router]);

  /*
    Purchase — the one event ad platforms actually learn from. Guarded per
    order number: refreshing this page must not count the sale twice.
  */
  useEffect(() => {
    if (!order) return;
    const key = `trk-purchase-${order.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    track("Purchase", {
      transaction_id: order.id,
      value: order.totalPaisa / 100,
      currency: "BDT",
    });
  }, [order]);

  if (!hydrated || (!order && !wantedNo)) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <span className="text-[13.5px] text-body-soft">Loading your order…</span>
      </div>
    );
  }

  /*  Came back from the gateway on a device that does not hold this order —
      or holds a different one. Confirm what the server will confirm, and say
      nothing else.  */
  if (!localIsTheOne) {
    if (!remote) {
      return (
        <div className="min-h-[50vh] grid place-items-center">
          <span className="text-[13.5px] text-body-soft">Checking your order…</span>
        </div>
      );
    }
    const paid = remote.found && remote.paid === true;
    const cancelled = remote.found && remote.cancelled === true;
    return (
      <div className="py-12">
        <div className="text-center max-w-[560px] mx-auto">
          <span
            className={`w-16 h-16 rounded-full grid place-items-center mx-auto ${
              paid ? "bg-[#E8F9EE] text-[#0E7A3D]" : "bg-lavender text-purple"
            }`}
          >
            <Icon name={paid ? "check" : "truck"} className="w-7 h-7" />
          </span>

          <h1 className="font-display text-[30px] sm:text-[36px] text-purple font-semibold mt-5">
            {cancelled
              ? "This Order Was Cancelled"
              : paid
                ? "Payment Received"
                : "Your Order Is Placed"}
          </h1>

          <p className="text-[14.5px] text-body mt-3">
            {cancelled
              ? "Nothing more is owed on it."
              : paid
                ? "Thank you — we have your payment and your order is with our studio."
                : remote.found
                  ? "We have your order. The payment has not reached us yet."
                  : "We could not find that order number. If money left your account, keep this page and contact us."}
          </p>

          <div className="inline-flex flex-wrap items-center justify-center gap-2 mt-5">
            <span className="rounded-full bg-white border-[1.5px] border-lavender-deep px-4 py-2 text-[13px] font-semibold text-purple">
              Order {remote.orderNo ?? wantedNo}
            </span>
            {paid && (
              <span className="rounded-full bg-[#E8F9EE] px-4 py-2 text-[13px] font-semibold text-[#0E7A3D]">
                Paid
              </span>
            )}
          </div>

          {/*  ⚠️ No receipt here, deliberately — see the note at the top. An
               order number in an address bar is not proof of who is holding
               it. The timeline behind Track asks for the phone as well.  */}
          <div className="flex flex-col sm:flex-row gap-2.5 justify-center mt-8">
            <Link
              href={`/track?id=${encodeURIComponent(remote.orderNo ?? wantedNo)}`}
              className="h-[50px] px-6 inline-flex items-center justify-center gap-2 bg-purple text-white rounded-[16px] font-semibold text-[14.5px] hover:bg-purple-deep transition-colors"
            >
              <Icon name="truck" className="w-[18px] h-[18px]" />
              Track this order
            </Link>
            <Link
              href="/"
              className="h-[50px] px-6 inline-flex items-center justify-center gap-2 bg-white border-[1.5px] border-lavender-deep text-purple rounded-[16px] font-semibold text-[14.5px] hover:border-orchid transition-colors"
            >
              Continue shopping
              <Icon name="chev" className="w-4 h-4 -rotate-90" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const placedAt = new Date(order.placedAt).toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="py-8">
      {/* ─── hero ─── */}
      <div className="text-center max-w-[620px] mx-auto">
        <span className="w-16 h-16 rounded-full bg-[#E8F9EE] text-[#0E7A3D] grid place-items-center mx-auto">
          <Icon name="check" className="w-7 h-7" />
        </span>

        <h1 className="font-display text-[30px] sm:text-[36px] text-purple font-semibold mt-5">
          {order.isGift ? "Their Gift Is On Its Way" : "Your Order Is On Its Way"}
        </h1>

        <p className="text-[14.5px] text-body mt-3">
          {order.isGift && order.recipient?.name
            ? `${order.recipient.name} will receive it — ${order.etaDone.toLowerCase()}.`
            : `Arriving ${order.etaDone.toLowerCase()}.`}{" "}
          We&apos;ve sent the details to {order.sender.phone}.
        </p>

        <div className="inline-flex flex-wrap items-center justify-center gap-2 mt-5">
          <span className="rounded-full bg-white border-[1.5px] border-lavender-deep px-4 py-2 text-[13px] font-semibold text-purple">
            Order {order.id}
          </span>
          <span className="rounded-full bg-white border-[1.5px] border-lavender-deep px-4 py-2 text-[13px] text-body-soft">
            {placedAt} · {order.paymentLabel}
          </span>
        </div>

        <PhoneVerifyBlock phone={order.sender.phone} email={order.sender.email} />
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-8 items-start mt-9">
        <div className="space-y-4">
          <DeliveryTimeline
            stage={1}
            photos={order.photoUpdates}
            outAt={order.etaOut}
            doneAt={order.etaDone}
            title="What Happens Next"
          />

          {/* ─── delivery card ─── */}
          <section className="bg-white rounded-[24px] border-[1.5px] border-lavender-deep p-5 sm:p-6">
            <h3 className="flex items-center gap-2 font-display text-[17px] text-purple font-semibold mb-4">
              <Icon name="pin" className="w-[18px] h-[18px] text-orchid" />
              Delivering To
            </h3>

            <dl className="grid sm:grid-cols-2 gap-4 text-[13.5px]">
              <div>
                <dt className="text-body-soft text-[12px]">
                  {order.isGift ? "Receiver" : "You"}
                </dt>
                <dd className="text-purple font-semibold mt-0.5">
                  {order.isGift ? order.recipient?.name : order.sender.name}
                  <span className="block font-normal text-body-soft">
                    {order.isGift ? order.recipient?.phone : order.sender.phone}
                  </span>
                </dd>
              </div>

              <div>
                <dt className="text-body-soft text-[12px]">When</dt>
                <dd className="text-purple font-semibold mt-0.5">
                  {order.etaDone}
                  <span className="block font-normal text-body-soft">
                    {order.methodLabel}
                  </span>
                </dd>
              </div>

              <div className="sm:col-span-2">
                <dt className="text-body-soft text-[12px]">Address</dt>
                <dd className="text-body mt-0.5">{order.address}</dd>
              </div>

              {order.giftMessage && (
                <div className="sm:col-span-2">
                  <dt className="text-body-soft text-[12px]">Card message</dt>
                  <dd className="mt-1 rounded-[14px] bg-lavender border border-lavender-deep px-4 py-3 text-[13.5px] text-body italic">
                    “{order.giftMessage}”
                    <span className="block not-italic text-[12px] text-body-soft mt-1.5">
                      {order.anonymousGift
                        ? "Sent anonymously — your name won't appear"
                        : `— ${order.sender.name}`}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        {/* ─── receipt ─── */}
        <aside className="bg-white border-[1.5px] border-lavender-deep rounded-[24px] p-5 sm:p-6">
          <h2 className="font-display text-[19px] text-purple font-semibold mb-4">
            Your Receipt
          </h2>

          <div className="space-y-3 pb-3 border-b border-lavender">
            {order.lines.map((l) => (
              <div key={l.slug + l.sizeLabel} className="flex items-center gap-3">
                <span
                  className="w-11 h-11 rounded-[12px] shrink-0"
                  style={{ background: l.bg }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-purple truncate">
                    {l.name}
                  </span>
                  <span className="block text-[11.5px] text-body-soft truncate">
                    {[l.variantLabel, l.sizeLabel, l.qty > 1 ? `× ${l.qty}` : null, ...l.bundleLabels, ...l.addonLabels]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="text-[12.5px] font-semibold text-purple shrink-0">
                  {formatTaka(l.linePaisa)}
                </span>
              </div>
            ))}
          </div>

          <div className="divide-y divide-lavender">
            <div className="flex justify-between py-2.5 text-[13.5px]">
              <span className="text-body-soft">Subtotal</span>
              <span className="text-purple font-semibold">
                {formatTaka(order.subtotalPaisa)}
              </span>
            </div>

            {order.discountPaisa > 0 && (
              <div className="flex justify-between py-2.5 text-[13.5px]">
                <span className="text-body-soft">Coupon {order.couponCode}</span>
                <span className="text-[#0E7A3D] font-semibold">
                  − {formatTaka(order.discountPaisa)}
                </span>
              </div>
            )}

            <div className="flex justify-between py-2.5 text-[13.5px]">
              <span className="text-body-soft">Delivery</span>
              <span
                className={
                  order.deliveryWaivedPaisa > 0
                    ? "text-[#0E7A3D] font-semibold"
                    : "text-purple font-semibold"
                }
              >
                {order.deliveryPaisa === 0 ? "FREE" : formatTaka(order.deliveryPaisa)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t-[1.5px] border-lavender-deep pt-4 mt-2">
            <span className="text-[15px] font-semibold text-purple">Paid</span>
            <span className="font-display text-[24px] text-purple font-semibold">
              {formatTaka(order.totalPaisa)}
            </span>
          </div>

          <p className="text-[12px] text-body-soft mt-1.5">
            {order.payment === "cod"
              ? "Cash on delivery — please keep the exact amount ready."
              : `Paid with ${order.paymentLabel}.`}
          </p>

          <Link
            href={`/track?id=${order.id}`}
            className="w-full mt-5 h-[50px] inline-flex items-center justify-center gap-2 bg-purple text-white rounded-[16px] font-semibold text-[14.5px] hover:bg-purple-deep transition-colors"
          >
            <Icon name="truck" className="w-[18px] h-[18px]" />
            Track this order
          </Link>

          <Link
            href="/"
            className="w-full mt-2.5 h-[50px] inline-flex items-center justify-center gap-2 bg-white border-[1.5px] border-lavender-deep text-purple rounded-[16px] font-semibold text-[14.5px] hover:border-orchid transition-colors"
          >
            Continue shopping
            <Icon name="chev" className="w-4 h-4 -rotate-90" />
          </Link>
        </aside>
      </div>
    </div>
  );
}
