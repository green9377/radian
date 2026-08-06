"use client";

import { useState } from "react";
import Icon from "./Icon";
import { APPROVALS, type Approval } from "../_data/offers";

/* Offers & Promotions · Approvals queue (MOCK, §9). Deep-discount / below-cost sign-off. */

const WRAP = "px-6 md:px-8 pt-7 pb-16 max-w-[1150px]"; // 6 Aug — widened, see FinanceUI.WRAP note

export default function OffersApprovals() {
  const [queue, setQueue] = useState<Approval[]>(APPROVALS);
  const [done, setDone] = useState<{ id: string; verdict: "approved" | "declined"; offer: string }[]>([]);
  const act = (a: Approval, verdict: "approved" | "declined") => {
    setQueue((q) => q.filter((x) => x.id !== a.id));
    setDone((d) => [{ id: a.id, verdict, offer: a.offer }, ...d]);
  };

  return (
    <div className={WRAP}>
      <div className="mb-5">
        <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] uppercase text-orchid"><span className="w-[9px] h-[9px] -rotate-45 bg-gradient-to-br from-orchid to-rosegold" style={{ borderRadius: "50% 50% 50% 0" }} />Offers & Promotions · approvals</div>
        <h1 className="font-display text-[28px] text-purple mt-1.5 mb-1 leading-tight">Approvals</h1>
        <p className="text-body-soft text-[13.5px] m-0 max-w-[720px]">Deep discounts and below-cost (perishable) offers need a manager's sign-off before they go live. Every decision is audited.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        {[{ n: String(queue.length), l: "Pending" }, { n: String(done.filter((d) => d.verdict === "approved").length), l: "Approved today" }, { n: String(done.filter((d) => d.verdict === "declined").length), l: "Declined today" }].map((s, i) => (
          <div key={i} className="bg-white border border-lavender-deep rounded-[14px] px-4 py-3.5 shadow-soft"><div className="text-[24px] font-medium font-display text-purple leading-none">{s.n}</div><div className="text-[13px] text-body-soft mt-1.5">{s.l}</div></div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {queue.map((a) => (
          <div key={a.id} className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-4 flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <div className="font-display text-[16px] text-purple">{a.offer}</div>
              <div className="text-[13px] text-body-soft mt-0.5">Requested by {a.requestedBy}</div>
              <div className="mt-2 flex gap-2 flex-wrap"><span className="text-[11.5px] font-semibold bg-[#fff4e2] text-[#b45309] px-2.5 py-1 rounded-full">{a.ask}</span><span className="text-[11.5px] bg-lavender text-body px-2.5 py-1 rounded-full">{a.reason}</span></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => act(a, "approved")} className="bg-[#0f9d6b] hover:bg-[#0c855a] text-white text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] inline-flex items-center gap-1.5 transition-colors"><Icon name="check" size={16} /> Approve</button>
              <button onClick={() => act(a, "declined")} className="bg-white border-[1.5px] border-lavender-deep hover:border-[#c0392b] hover:text-[#c0392b] text-body-soft text-[13.5px] font-medium px-4 py-2.5 rounded-[11px]">Decline</button>
            </div>
          </div>
        ))}
        {queue.length === 0 && <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-8 text-center text-body-soft">🎉 Queue clear — no pending approvals.</div>}
      </div>

      {done.length > 0 && (
        <div className="mt-6">
          <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-body-soft mb-2">Decided (this session)</div>
          <div className="flex flex-col gap-2">
            {done.map((d, i) => (<div key={i} className="flex items-center gap-2 text-[13px] bg-white border border-lavender-deep rounded-[11px] px-3 py-2"><span className={`w-2 h-2 rounded-full ${d.verdict === "approved" ? "bg-[#0f9d6b]" : "bg-[#c0392b]"}`} /><span className="text-purple font-medium">{d.offer}</span><span className={`text-[11.5px] font-semibold ${d.verdict === "approved" ? "text-[#0f7d55]" : "text-[#c0392b]"}`}>{d.verdict}</span></div>))}
          </div>
        </div>
      )}
    </div>
  );
}
