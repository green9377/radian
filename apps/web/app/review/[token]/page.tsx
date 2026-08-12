import type { Metadata } from "next";
import InviteReviewForm from "./InviteReviewForm";

/*
  ─── /review/[token] — DEC-WEB-008 (12 Aug 2026) ────────────────────────────
  The page a WhatsApp review request opens. The token was minted when the
  order was delivered and sent to the customer's own phone, so the form
  already knows who they are and what they bought — they only bring the
  stars and the words. Single-use: once submitted, the link shows a thank-you
  instead of a second form.

  Server component fetches the invite; the form itself is a client island.
  `no-store` on purpose — a used link must say so immediately, not after a
  cache window.
*/

export const metadata: Metadata = {
  title: "Share your experience — Radian",
  robots: { index: false, follow: false }, // a personal link is not a page to rank
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface InviteInfo {
  used: boolean;
  orderNo: string;
  customerName: string;
  customerImageUrl: string | null;
  product: { name: string; slug: string; imageUrl: string | null } | null;
}

async function getInvite(token: string): Promise<InviteInfo | null> {
  try {
    const r = await fetch(`${API}/shop/review-invite/${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as InviteInfo;
  } catch {
    return null;
  }
}

export default async function InviteReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getInvite(token);

  return (
    <main className="bg-[#F6F4FA] min-h-[70vh]">
      <div className="max-w-[560px] mx-auto px-4 sm:px-6 py-12">
        {!invite ? (
          <Card>
            <p className="font-display text-[22px] text-purple mb-2">This link is not valid</p>
            <p className="text-[14px] text-body-soft">
              It may have been mistyped. You can still write a review from any
              product page, or the{" "}
              <a href="/reviews" className="text-orchid hover:underline">reviews page</a>.
            </p>
          </Card>
        ) : invite.used ? (
          <Card>
            <p className="font-display text-[22px] text-purple mb-2">Already received 💐</p>
            <p className="text-[14px] text-body-soft">
              This link was for one review, and yours is safely with us. Thank
              you, {invite.customerName}!
            </p>
          </Card>
        ) : (
          <InviteReviewForm token={token} invite={invite} />
        )}
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-[28px] shadow-soft px-8 py-10 text-center">
      {children}
    </div>
  );
}
