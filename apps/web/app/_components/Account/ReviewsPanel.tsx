"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getReviews, type AccountReviews } from "../../_data/accountApi";
import { useToken } from "../../_store/useAuthStore";
import { Empty, Loading, Panel } from "./AccountShell";

/*
  /account/reviews — two halves, and the FIRST one is the point.

  The owner, 8 Sep 2026: the screen was only showing reviews already written,
  *"je sob product se already purchased kre delivered hoiche segula nei ar
  bola-o hocche na je akhane apnar review den."* So every delivered product
  that has not been reviewed is listed by name, with the order it came on and
  who it went to, and asked for plainly.

  ⚠️ Only delivered products can be reviewed at all (DEC-WEB-006, the review
  invite): that is what makes the stars on the shop worth reading.
*/

function Stars({ n = 0, empty = false }: { n?: number; empty?: boolean }) {
  return (
    <span className={`tracking-[2px] text-[13px] ${empty ? "text-[#D9C7E6] text-[20px]" : "text-[#E8A33D]"}`}>
      {"★".repeat(empty ? 5 : n)}
      {!empty && "☆".repeat(Math.max(0, 5 - n))}
    </span>
  );
}

export default function ReviewsPanel() {
  const token = useToken();
  const [data, setData] = useState<AccountReviews | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getReviews(token)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load your reviews."));
  }, [token]);

  return (
    <Panel
      icon="star"
      title="My reviews"
      sub="Only what was actually delivered to you — that is why they can be trusted."
    >
      {err && (
        <p className="mb-4 rounded-[13px] bg-[#FDECEE] border border-[#F5C2C7] px-4 py-3 text-[13px] text-[#8A1220]">
          {err}
        </p>
      )}

      {!data && !err && <Loading />}

      {data && (
        <>
          {data.waiting.length > 0 && (
            <>
              <div className="rounded-[18px] border-[1.5px] border-[#F2D9A8] bg-[#FFF7E8] px-5 py-4 mb-4">
                <b className="block font-display text-[17px] text-[#8A5A00]">
                  Waiting for your review · {data.waiting.length}
                </b>
                <span className="block text-[12.5px] text-[#8A5A00] mt-1">
                  These reached the person you sent them to. Tell us how they looked when they
                  arrived — it is the only thing new customers trust.
                </span>
              </div>

              {data.waiting.map((w) => (
                <div
                  key={`${w.productId}-${w.orderId}`}
                  className="border-[1.5px] border-lavender-deep rounded-[16px] p-4 mb-3 flex gap-3.5 items-center flex-wrap"
                >
                  <span className="w-16 h-16 rounded-[14px] shrink-0 overflow-hidden bg-[linear-gradient(160deg,#F1E6F8,#DFC8F0)]">
                    {w.imageUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={w.imageUrl} alt={w.name} className="w-full h-full object-cover" />
                    )}
                  </span>
                  <span className="flex-1 min-w-[180px]">
                    <b className="block text-[14px] text-purple">{w.name}</b>
                    <span className="block text-[12px] text-body-soft mt-0.5">
                      {w.orderNo}
                      {w.deliveredAt
                        ? ` · delivered ${new Date(w.deliveredAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}`
                        : ""}
                      {w.forWhom ? ` to ${w.forWhom}` : ""}
                    </span>
                    <span className="block mt-1.5">
                      <Stars empty />
                    </span>
                  </span>
                  <Link
                    href={`/p/${w.slug}#reviews`}
                    className="ml-auto rounded-[13px] bg-purple text-white px-5 py-3 font-bold text-[13px]"
                  >
                    Write your review
                  </Link>
                </div>
              ))}
            </>
          )}

          <b className="block font-display text-[17px] text-purple mt-7 mb-3">
            Your reviews · {data.written.length}
          </b>

          {data.written.length === 0 ? (
            <Empty
              title="You haven't written one yet"
              sub="A line about how it arrived helps the next person more than any photo we can take."
            />
          ) : (
            data.written.map((r) => (
              <div key={r.id} className="border-[1.5px] border-lavender-deep rounded-[16px] p-4 mb-3">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <b className="text-[14px] text-purple">{r.name}</b>
                  <Stars n={r.rating} />
                  <span className="rounded-full bg-lavender text-purple px-2.5 py-1 text-[11px] font-bold">
                    {new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                  {r.status === "PENDING" && (
                    <span className="rounded-full bg-[#FFF7E8] text-[#8A5A00] px-2.5 py-1 text-[11px] font-bold">
                      Waiting to be published
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-body leading-relaxed m-0">{r.body}</p>
              </div>
            ))
          )}
        </>
      )}
    </Panel>
  );
}
