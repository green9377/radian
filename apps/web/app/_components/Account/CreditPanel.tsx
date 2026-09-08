"use client";

import { useEffect, useState } from "react";

import { getCredit, type AccountCredit } from "../../_data/accountApi";
import { formatTaka } from "../../_data/products";
import { useToken } from "../../_store/useAuthStore";
import { Empty, Loading, Panel } from "./AccountShell";

/*
  /account/credit — the store credit the shop already keeps.

  DEC-RTN-013: Finance owns `CustomerCredit`; this screen only adds the lines
  up and shows them. Nothing here can issue or spend credit — that happens
  where the money actually moves (a return, a refund, a checkout).
*/

export default function CreditPanel() {
  const token = useToken();
  const [data, setData] = useState<AccountCredit | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getCredit(token)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load your credit."));
  }, [token]);

  return (
    <Panel
      icon="tag"
      title="Store credit"
      sub="Spend it at checkout — it comes off the bill automatically."
    >
      {err && (
        <p className="mb-4 rounded-[13px] bg-[#FDECEE] border border-[#F5C2C7] px-4 py-3 text-[13px] text-[#8A1220]">
          {err}
        </p>
      )}

      {!data && !err && <Loading />}

      {data && (
        <>
          <div className="rounded-[20px] px-6 py-6 mb-5 flex items-center gap-5 flex-wrap bg-[linear-gradient(150deg,#4D0170,#320049)]">
            <span>
              <u className="block no-underline text-[12px] text-[#DCC4EA] tracking-[0.04em]">
                AVAILABLE
              </u>
              <b className="block font-display text-[34px] text-white mt-1">
                {formatTaka(data.balancePaisa)}
              </b>
            </span>
            <p className="ml-auto max-w-[300px] text-[12px] text-[#DCC4EA] leading-relaxed m-0">
              Credit belongs to this phone number. It never expires, and it cannot be sent to
              anybody else.
            </p>
          </div>

          {data.lines.length === 0 ? (
            <Empty
              title="No credit yet"
              sub="Refunds and returns land here — and come off your next bill by themselves."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Date", "What happened", "Amount"].map((h, i) => (
                      <th
                        key={h}
                        className={`text-[11.5px] text-body-soft font-bold px-2.5 py-2 border-b-[1.5px] border-lavender-deep ${
                          i === 2 ? "text-right" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="text-[13px] px-2.5 py-3 border-b border-lavender-deep whitespace-nowrap">
                        {new Date(l.at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="text-[13px] px-2.5 py-3 border-b border-lavender-deep">
                        {l.note?.trim() ||
                          (l.amountPaisa >= 0 ? "Credit issued" : "Spent on an order")}
                      </td>
                      <td
                        className={`text-[13px] px-2.5 py-3 border-b border-lavender-deep text-right font-bold ${
                          l.amountPaisa >= 0 ? "text-[#0E7A3D]" : "text-body"
                        }`}
                      >
                        {l.amountPaisa >= 0 ? "+ " : "− "}
                        {formatTaka(Math.abs(l.amountPaisa))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
