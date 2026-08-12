"use client";

import { useState } from "react";
import { baseFor } from "../../_data/shop";

/*
  The pre-filled form behind a WhatsApp review link (DEC-WEB-008).

  No name box: the token already knows who is writing. The review it creates
  is born Verified — the link could not exist without the delivered order —
  but still lands PENDING, because nothing reaches the screen without the
  owner reading it first. That rule has no exceptions, not even this one.
*/

interface InviteInfo {
  used: boolean;
  orderNo: string;
  customerName: string;
  customerImageUrl: string | null;
  product: { name: string; slug: string; imageUrl: string | null } | null;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

export default function InviteReviewForm({ token, invite }: { token: string; invite: InviteInfo }) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function pickPhoto(file: File | null) {
    if (!file) return;
    setPhotoBusy(true); setErrMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${baseFor()}/media/upload/review-photo`, { method: "POST", body: fd });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.message ?? "Could not upload the photo");
      }
      setPhoto((await res.json()).url as string);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Could not upload the photo");
    } finally { setPhotoBusy(false); }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length < 5) {
      setErrMsg("Please write a few words");
      return;
    }
    setState("sending"); setErrMsg(null);
    try {
      const res = await fetch(`${baseFor()}/shop/review-invite/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, body: body.trim(), imageUrl: photo ?? undefined }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.message ?? "Could not send the review");
      }
      setState("done");
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Could not send the review");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="bg-white rounded-[28px] shadow-soft px-8 py-10 text-center">
        <p className="font-display text-[22px] text-purple mb-2">Thank you, {invite.customerName}! 💐</p>
        <p className="text-[14px] text-body-soft">
          We read every review before it goes up — yours is on its way to us.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="bg-white rounded-[28px] shadow-soft p-7 sm:p-9">
      {/* who — pre-filled by the token, shown so they know we know */}
      <div className="flex items-center gap-3 mb-5">
        {invite.customerImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={invite.customerImageUrl} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
        ) : (
          <span className="w-12 h-12 rounded-full grid place-items-center text-white font-semibold text-[15px] shrink-0"
            style={{ background: "linear-gradient(135deg,#e9a8f5,#cf43ea)" }}>
            {initials(invite.customerName)}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-purple mb-0">{invite.customerName}</p>
          <p className="text-[12px] text-body-soft mb-0">
            Order {invite.orderNo} ·{" "}
            <span className="text-[#0E7A3D] font-medium">✓ verified delivery</span>
          </p>
        </div>
      </div>

      <h1 className="font-display text-[clamp(20px,4vw,26px)] font-medium text-purple leading-tight mb-1.5">
        How was it?
      </h1>

      {/* what — the product the token pre-selected */}
      {invite.product && (
        <div className="flex items-center gap-3 bg-lavender/40 border border-lavender-deep rounded-[16px] px-4 py-3 mb-5">
          {invite.product.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={invite.product.imageUrl} alt="" className="w-[52px] h-[52px] rounded-[12px] object-cover shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium text-purple truncate mb-0">{invite.product.name}</p>
            <p className="text-[11.5px] text-body-soft mb-0">your review will appear on this product</p>
          </div>
        </div>
      )}

      {/* stars */}
      <div className="flex items-center gap-1.5 mb-5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)}
            className="text-[30px] leading-none transition-transform hover:scale-110"
            style={{ color: n <= rating ? "#b76e79" : "#E3D9F3" }}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}>
            ★
          </button>
        ))}
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="What did they say when the door opened?"
        className="w-full rounded-[16px] border border-lavender-deep bg-[#FDFCFF] px-4 py-3 text-[14px] text-ink outline-none focus:border-orchid transition-colors resize-none"
      />

      {/* photo — optional, uploaded on pick so Send stays instant */}
      <div className="mt-4">
        {photo ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="w-[76px] h-[76px] rounded-[14px] object-cover border border-lavender-deep" />
            <button type="button" onClick={() => setPhoto(null)}
              className="text-[13px] text-body-soft hover:text-[#c0392b]">Remove</button>
          </div>
        ) : (
          <label className="inline-flex items-center gap-2 text-[13px] text-orchid cursor-pointer hover:underline">
            {photoBusy ? "Uploading…" : "📷 Add a photo of the gift (optional)"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              disabled={photoBusy}
              onChange={(e) => void pickPhoto(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </div>

      {errMsg && (
        <p className="text-[13px] text-[#a3261f] bg-[#fdecea] border border-[#f5c6c2] rounded-[12px] px-4 py-2.5 mt-4 mb-0">
          {errMsg}
        </p>
      )}

      <button type="submit" disabled={state === "sending" || photoBusy}
        className="w-full mt-5 rounded-full bg-purple hover:bg-purple-deep text-white text-[15px] font-semibold py-3.5 transition-colors disabled:opacity-50">
        {state === "sending" ? "Sending…" : "Send my review"}
      </button>
      <p className="text-[11.5px] text-body-soft text-center mt-3 mb-0">
        We read every review before it goes up.
      </p>
    </form>
  );
}
