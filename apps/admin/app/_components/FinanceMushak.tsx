"use client";

/*
  MUSHAK 6.3 — the government VAT challan (gap G3).

  A corporate buyer cannot claim their own input VAT without a valid Mushak 6.3
  carrying a verifiable BIN, so for gift-corporate work this is not paperwork —
  it is the difference between winning the order and not being considered.

  The screen is deliberately built as: fill in who we are ONCE, then every
  eligible order becomes one click to print. Nothing on the form is invented;
  until the owner enters the real registration details the print button stays
  shut, because a challan with a made-up BIN is worse than no challan at all.
*/

import { useCallback, useEffect, useState } from "react";
import {
  ApiMushakChallan, ApiMushakOrder, ApiMushakReadiness,
  mushakChallan, mushakOrders, mushakReadiness, saveCompany,
} from "../_data/api";
import {
  Banner, Card, Empty, FinHeader, Flash, Panel, Table, Td, Th, TONE, WRAP,
  btnGhost, btnPrimary, btnPrimaryStyle, input, Lbl, taka,
} from "./FinanceUI";

export default function FinanceMushak() {
  const [ready, setReady] = useState<ApiMushakReadiness | null>(null);
  const [rows, setRows] = useState<ApiMushakOrder[]>([]);
  const [open, setOpen] = useState<ApiMushakChallan | null>(null);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  const [f, setF] = useState({
    businessName: "", businessBin: "", businessAddress: "",
    businessVatCircle: "", signatoryName: "", signatoryDesignation: "",
  });

  const load = useCallback(async () => {
    try {
      const [r, o] = await Promise.all([mushakReadiness(), mushakOrders()]);
      setReady(r); setRows(o);
      setF({
        businessName: r.businessName ?? "",
        businessBin: r.businessBin ?? "",
        businessAddress: r.businessAddress ?? "",
        businessVatCircle: r.businessVatCircle ?? "",
        signatoryName: r.signatoryName ?? "",
        signatoryDesignation: r.signatoryDesignation ?? "",
      });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    try {
      /*  DEC-GBL-003 (owner, 21 Aug) — who we are is written ONCE, in Company
          settings. This screen used to save a second copy inside Finance, and
          two BINs is how a challan goes out with the wrong number. The reader
          already prefers the company row; now the writer does too.  */
      await saveCompany({
        legalName: f.businessName.trim() || null,
        bin: f.businessBin.trim() || null,
        registeredAddress: f.businessAddress.trim() || null,
        vatCircle: f.businessVatCircle.trim() || null,
        signatoryName: f.signatoryName.trim() || null,
        signatoryDesignation: f.signatoryDesignation.trim() || null,
      });
      await load();
      setErr(""); setOk("Saved — challans can be printed now");
      setTimeout(() => setOk(""), 3500);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setOk(""); }
  }

  async function view(orderId: string) {
    try { setOpen(await mushakChallan(orderId)); setErr(""); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  if (open) return <ChallanSheet c={open} onBack={() => setOpen(null)} />;

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Finance"
        title="VAT challan · মূসক ৬.৩"
        tone={ready?.ready ? "emerald" : "amber"}
      />

      <Flash ok={ok} err={err} />

      {ready && !ready.vatEnabled && (
        <Banner tone="sky" emoji="ℹ" title="VAT is switched off">
          Turn it on in Finance → Settings.
        </Banner>
      )}

      {ready && !ready.ready && (
        <Banner tone="amber" emoji="✍" title="Challans will not print yet">
          Still needed: <b>{ready.missing.join(" · ")}</b>
        </Banner>
      )}

      <Panel tone="brand" emoji="🏛" title="Who we are on the form">
        <Card className="px-5 py-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Lbl>Registered business name</Lbl>
              <input className={input} value={f.businessName} placeholder="Radian Flowers & Gifts"
                onChange={(e) => setF({ ...f, businessName: e.target.value })} />
            </div>
            <div>
              <Lbl>BIN — 13 digits</Lbl>
              <input className={`${input} tracking-[0.12em]`} value={f.businessBin} placeholder="0000000000000"
                onChange={(e) => setF({ ...f, businessBin: e.target.value.replace(/[^\d]/g, "").slice(0, 13) })} />
              {f.businessBin.length > 0 && f.businessBin.length !== 13 && (
                <p className="text-[11.5px] mt-1 mb-0" style={{ color: TONE.rose.text }}>
                  A BIN is exactly 13 digits — this one has {f.businessBin.length}.
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <Lbl>Registered address</Lbl>
              <input className={input} value={f.businessAddress} placeholder="House, road, area, Dhaka"
                onChange={(e) => setF({ ...f, businessAddress: e.target.value })} />
            </div>
            <div>
              <Lbl>VAT circle / division (optional)</Lbl>
              <input className={input} value={f.businessVatCircle} placeholder="Circle · Division · Commissionerate"
                onChange={(e) => setF({ ...f, businessVatCircle: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Lbl>Who signs it</Lbl>
                <input className={input} value={f.signatoryName} placeholder="Sobuj"
                  onChange={(e) => setF({ ...f, signatoryName: e.target.value })} />
              </div>
              <div>
                <Lbl>Their title</Lbl>
                <input className={input} value={f.signatoryDesignation} placeholder="Proprietor"
                  onChange={(e) => setF({ ...f, signatoryDesignation: e.target.value })} />
              </div>
            </div>
          </div>
          <button className={`${btnPrimary} mt-4`} style={btnPrimaryStyle}
            disabled={f.businessBin.length > 0 && f.businessBin.length !== 13}
            onClick={() => void save()}>Save these details</button>
        </Card>
      </Panel>

      <Panel tone="sky" emoji="🧾" title="Sales that need a challan"
        sub={`${rows.length} order${rows.length === 1 ? "" : "s"} with VAT charged`} className="mt-5">
        {rows.length === 0 ? (
          <Empty title="No VAT sale yet" />
        ) : (
          <Table head={<tr><Th>Order</Th><Th>Date</Th><Th>Buyer</Th><Th>Buyer BIN</Th><Th right>VAT</Th><Th right>Total</Th><Th right></Th></tr>}>
            {rows.map((o) => (
              <tr key={o.id}>
                <Td><b className="text-purple">{o.orderNo}</b></Td>
                <Td>{new Date(o.placedAt).toLocaleDateString()}</Td>
                <Td>{o.customerName}</Td>
                <Td>
                  {o.buyerBin
                    ? <span className="tracking-[0.08em]">{o.buyerBin}</span>
                    : <span className="text-[12px]" style={{ color: TONE.amber.text }}>not given</span>}
                </Td>
                <Td right>{taka(o.vatPaisa)}</Td>
                <Td right><b>{taka(o.totalPaisa)}</b></Td>
                <Td right>
                  <button className={btnGhost} disabled={!ready?.ready} onClick={() => void view(o.id)}>
                    Open challan
                  </button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------- the form itself ------------------------------- */

function ChallanSheet({ c, onBack }: { c: ApiMushakChallan; onBack: () => void }) {
  const rate = (c.vatRateBps / 100).toFixed(c.vatRateBps % 100 ? 2 : 0);
  return (
    <div className="px-6 md:px-8 pt-6 pb-16 max-w-[900px]">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .challan { border: none !important; box-shadow: none !important; margin: 0; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      <div className="no-print flex gap-2 mb-4">
        <button className={btnGhost} onClick={onBack}>← Back</button>
        <button className={btnPrimary} style={btnPrimaryStyle} onClick={() => window.print()}>Print</button>
      </div>

      <div className="challan bg-white border border-[var(--l-accent)] rounded-lg p-8 text-[12.5px] text-[var(--t-accent)]">
        <div className="text-center border-b-2 border-[var(--l-accent)] pb-3 mb-4">
          <div className="text-[15px] font-bold">গণপ্রজাতন্ত্রী বাংলাদেশ সরকার</div>
          <div className="text-[13px]">জাতীয় রাজস্ব বোর্ড</div>
          <div className="text-[16px] font-bold mt-2">কর চালানপত্র · TAX INVOICE</div>
          <div className="text-[12px]">[মূসক-৬.৩ · Mushak 6.3]</div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-4">
          <div>
            <div className="font-bold border-b border-[var(--l-accent)] mb-1 pb-0.5">সরবরাহকারী · Supplier</div>
            <div><b>{c.seller.name}</b></div>
            <div>{c.seller.address}</div>
            <div>BIN: <b className="tracking-[0.08em]">{c.seller.bin}</b></div>
            {c.seller.vatCircle && <div>{c.seller.vatCircle}</div>}
          </div>
          <div>
            <div className="font-bold border-b border-[var(--l-accent)] mb-1 pb-0.5">ক্রেতা · Buyer</div>
            <div><b>{c.buyer.name}</b></div>
            <div>{c.buyer.address}</div>
            <div>BIN: {c.buyer.bin ? <b className="tracking-[0.08em]">{c.buyer.bin}</b> : "—"}</div>
            {c.buyer.phone && <div>{c.buyer.phone}</div>}
          </div>
        </div>

        <div className="flex justify-between mb-3 pb-2 border-b border-[var(--l-accent)]">
          <div>চালান নম্বর · Challan no: <b>{c.challanNo}</b></div>
          <div>ইস্যুর তারিখ ও সময় · Issued: <b>{new Date(c.issuedAt).toLocaleString()}</b></div>
        </div>

        <table className="w-full border-collapse mb-3">
          <thead>
            <tr className="bg-[var(--s-accent)]">
              <Cell head w="34">ক্রম</Cell>
              <Cell head>পণ্যের বিবরণ · Description</Cell>
              <Cell head w="52">একক</Cell>
              <Cell head w="52" right>পরিমাণ</Cell>
              <Cell head w="84" right>একক মূল্য</Cell>
              <Cell head w="90" right>মোট মূল্য</Cell>
              <Cell head w="70" right>সম্পূরক শুল্ক</Cell>
              <Cell head w="84" right>মূসক {rate}%</Cell>
              <Cell head w="94" right>মূসকসহ মূল্য</Cell>
            </tr>
          </thead>
          <tbody>
            {c.lines.map((l, i) => (
              <tr key={i}>
                <Cell>{i + 1}</Cell>
                <Cell>{l.description}</Cell>
                <Cell>{l.unit}</Cell>
                <Cell right>{l.qty}</Cell>
                <Cell right>{taka(l.unitPricePaisa)}</Cell>
                <Cell right>{taka(l.valuePaisa)}</Cell>
                <Cell right>{taka(l.sdPaisa)}</Cell>
                <Cell right>{taka(l.vatPaisa)}</Cell>
                <Cell right><b>{taka(l.totalPaisa)}</b></Cell>
              </tr>
            ))}
            {c.deliveryPaisa > 0 && (
              <tr>
                <Cell>—</Cell>
                <Cell>ডেলিভারি চার্জ · Delivery charge</Cell>
                <Cell>—</Cell><Cell right>1</Cell>
                <Cell right>{taka(c.deliveryPaisa)}</Cell>
                <Cell right>{taka(c.deliveryPaisa)}</Cell>
                <Cell right>{taka(0)}</Cell>
                <Cell right>{taka(0)}</Cell>
                <Cell right><b>{taka(c.deliveryPaisa)}</b></Cell>
              </tr>
            )}
            <tr className="bg-[var(--s-accent)] font-bold">
              <Cell colSpan={7} right>সর্বমোট · Grand total</Cell>
              <Cell right>{taka(c.vatPaisa)}</Cell>
              <Cell right>{taka(c.totalPaisa)}</Cell>
            </tr>
          </tbody>
        </table>

        <div className="mb-6">কথায় · In words: <b>{c.inWords}</b></div>

        <div className="flex justify-between items-end mt-12">
          <div className="text-[11.5px] text-[var(--t-accent)] max-w-[380px]">
            This challan is issued under the Value Added Tax and Supplementary Duty Act, 2012.
          </div>
          <div className="text-center">
            <div className="border-t border-[var(--l-accent)] w-56 pt-1">
              <b>{c.signatory.name}</b>
              {c.signatory.designation && <div className="text-[11.5px]">{c.signatory.designation}</div>}
              <div className="text-[11px] text-[var(--t-accent)]">দায়িত্বপ্রাপ্ত ব্যক্তির স্বাক্ষর ও সিল</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Cell({
  children, head = false, right = false, w, colSpan,
}: {
  children?: React.ReactNode; head?: boolean; right?: boolean; w?: string; colSpan?: number;
}) {
  const Tag = head ? "th" : "td";
  return (
    <Tag
      colSpan={colSpan}
      className={`border border-[var(--l-accent)] px-2 py-1.5 align-top ${right ? "text-right" : "text-left"} ${head ? "font-bold text-[11.5px]" : ""}`}
      style={w ? { width: `${w}px` } : undefined}
    >
      {children}
    </Tag>
  );
}
