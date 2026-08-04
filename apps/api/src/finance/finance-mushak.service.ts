import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from './finance.service';

/*  MUSHAK 6.3 — the government VAT challan (gap G3).

    Under the VAT and Supplementary Duty Act 2012, a VAT-registered business
    issues this form, not an ordinary cash memo, every time it makes a taxable
    supply. Corporate gift buyers ask for it by name: without a valid Mushak 6.3
    carrying a verifiable BIN they cannot claim their own input VAT, so many of
    them simply will not buy.

    Two rules shape everything below.

    1. NOTHING ON A GOVERNMENT FORM MAY BE INVENTED.
       Our BIN, our registered name, our address, the person who signs — all of
       it comes from the owner. Until those are filled in, this service refuses
       to produce a challan instead of printing a plausible-looking document
       with a made-up number on it. A wrong BIN on a buyer's challan is their
       audit problem as much as ours.

    2. THE NUMBERS COME FROM THE ORDER, NEVER FROM A FRESH CALCULATION.
       The VAT that was actually charged is what must appear. Re-deriving it
       here (subtotal × 15%) would quietly disagree with the ledger and the
       money the customer paid the moment anything is discounted, waived or
       rounded — and the challan is the one document where that must never
       happen. So the order's own vatPaisa is split across the lines, with the
       rounding remainder landing on the last line so the parts always add back
       to exactly the whole.

    Challan number = the order number. One supply, one order, one challan —
    unique, already sequential, and traceable both ways without a second table
    that could drift out of step with the orders it describes.
*/

export interface MushakLine {
  description: string;
  unit: string;
  qty: number;
  unitPricePaisa: number;
  valuePaisa: number; // before VAT, after this line's share of any discount
  sdPaisa: number; // supplementary duty — zero for flowers and gifts
  vatPaisa: number;
  totalPaisa: number;
}

export interface MushakChallan {
  challanNo: string;
  issuedAt: string;
  seller: {
    name: string;
    address: string;
    bin: string;
    vatCircle: string | null;
  };
  buyer: {
    name: string;
    address: string;
    bin: string | null;
    phone: string | null;
  };
  lines: MushakLine[];
  subtotalPaisa: number;
  discountPaisa: number;
  deliveryPaisa: number;
  sdPaisa: number;
  vatPaisa: number;
  totalPaisa: number;
  inWords: string;
  signatory: { name: string; designation: string };
  vatRateBps: number;
}

/** Bangladeshi grouping — lakh and crore, not million */
export function takaInWords(paisa: number): string {
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const under100 = (n: number): string =>
    n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`;
  const under1000 = (n: number): string =>
    n < 100
      ? under100(n)
      : `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${under100(n % 100)}` : ''}`;

  const whole = Math.floor(Math.abs(paisa) / 100);
  const coins = Math.abs(paisa) % 100;
  if (whole === 0 && coins === 0) return 'Zero Taka only';

  const parts: string[] = [];
  let rest = whole;
  const crore = Math.floor(rest / 10000000);
  rest %= 10000000;
  const lakh = Math.floor(rest / 100000);
  rest %= 100000;
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;

  if (crore) parts.push(`${under1000(crore)} Crore`);
  if (lakh) parts.push(`${under1000(lakh)} Lakh`);
  if (thousand) parts.push(`${under1000(thousand)} Thousand`);
  if (rest) parts.push(under1000(rest));

  const takaWords = parts.length ? parts.join(' ') : 'Zero';
  const coinWords = coins ? ` and ${under100(coins)} Poisha` : '';
  return `${paisa < 0 ? 'Minus ' : ''}${takaWords} Taka${coinWords} only`;
}

@Injectable()
export class FinanceMushakService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  /**
   * What the owner still has to fill in before a challan may be printed.
   *
   * ADM-D08, 30 Jul 2026 — WHO WE ARE now lives in CompanySetting, because the
   * company's registered name and address are not Finance's property. Finance
   * still owns the VAT rate and whether VAT is on: those ARE its business rules.
   *
   * ⚠️ Company FIRST, Finance as the fallback, per field. Mushak 6.3 is a
   * government form that is complete and tested, and it was waiting on the BIN
   * alone. Reading only from the new table would have meant a challan that
   * silently lost the name somebody already typed in months ago. When the two
   * agree, the old columns get dropped — not before.
   */
  async readiness() {
    const s = await this.finance.settings();
    const c = await this.prisma.db.companySetting.findFirst();

    const pick = (fresh?: string | null, legacy?: string | null) =>
      fresh?.trim() ? fresh.trim() : (legacy?.trim() || null);

    const bin = pick(c?.bin, s?.businessBin);
    const name = pick(c?.legalName, s?.businessName);
    const address = pick(c?.registeredAddress, s?.businessAddress);
    const circle = pick(c?.vatCircle, s?.businessVatCircle);
    const signer = pick(c?.signatoryName, s?.signatoryName);
    const designation = pick(c?.signatoryDesignation, s?.signatoryDesignation);

    const missing: string[] = [];
    if (!bin) missing.push('Your 13-digit BIN');
    if (!name) missing.push('Registered business name');
    if (!address) missing.push('Registered address');
    if (!signer) missing.push('Who signs the challan');

    return {
      ready: missing.length === 0,
      missing,
      vatEnabled: !!s?.vatEnabled,
      vatRateBps: s?.vatRateBps ?? 1500,
      businessBin: bin,
      businessName: name,
      businessAddress: address,
      businessVatCircle: circle,
      signatoryName: signer,
      signatoryDesignation: designation,
    };
  }

  /** orders a challan can be issued for — VAT was actually charged on them */
  async issuable(take = 50) {
    const rows = await this.prisma.db.order.findMany({
      where: { vatPaisa: { gt: 0 }, salesStatus: { in: ['confirmed', 'completed'] } },
      orderBy: { placedAt: 'desc' },
      take,
      select: {
        id: true,
        orderNo: true,
        placedAt: true,
        totalPaisa: true,
        vatPaisa: true,
        buyerBin: true,
        salesStatus: true,
        customer: { select: { name: true } },
      },
    });
    return rows.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      placedAt: o.placedAt.toISOString(),
      customerName: o.customer?.name ?? '',
      buyerBin: o.buyerBin,
      totalPaisa: o.totalPaisa,
      vatPaisa: o.vatPaisa,
      salesStatus: o.salesStatus,
    }));
  }

  async challan(orderId: string): Promise<MushakChallan> {
    const ready = await this.readiness();
    if (!ready.ready)
      throw new BadRequestException(
        `The challan cannot be issued yet — still needed: ${ready.missing.join(', ')}`,
      );

    const order = await this.prisma.db.order.findUnique({
      where: { id: orderId },
      select: {
        orderNo: true,
        placedAt: true,
        address: true,
        buyerBin: true,
        subtotalPaisa: true,
        discountPaisa: true,
        deliveryPaisa: true,
        deliveryWaivedPaisa: true,
        vatPaisa: true,
        totalPaisa: true,
        customer: { select: { name: true, phone: true } },
        lines: {
          select: {
            name: true,
            sizeLabel: true,
            qty: true,
            unitPaisa: true,
            linePaisa: true,
            discountPaisa: true,
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.vatPaisa <= 0)
      throw new BadRequestException('No VAT was charged on this order, so there is nothing to certify');

    /*  Split the VAT that was actually charged across the lines, in proportion
        to what each line is worth. The last line absorbs the rounding leftover
        so the parts always add back to the whole — a challan whose lines do not
        sum to its total is the first thing an inspector notices. */
    const net = (l: { linePaisa: number; discountPaisa: number }) =>
      Math.max(0, l.linePaisa - l.discountPaisa);
    const base = order.lines.reduce((s, l) => s + net(l), 0) || 1;
    const lines: MushakLine[] = order.lines.map((l, i) => {
      const isLast = i === order.lines.length - 1;
      const share = isLast
        ? order.vatPaisa -
          order.lines
            .slice(0, -1)
            .reduce((s, x) => s + Math.floor((order.vatPaisa * net(x)) / base), 0)
        : Math.floor((order.vatPaisa * net(l)) / base);
      return {
        description: l.sizeLabel ? `${l.name} (${l.sizeLabel})` : l.name,
        unit: 'pcs',
        qty: l.qty,
        unitPricePaisa: l.unitPaisa,
        valuePaisa: net(l),
        sdPaisa: 0,
        vatPaisa: share,
        totalPaisa: net(l) + share,
      };
    });

    const delivery = Math.max(0, order.deliveryPaisa - order.deliveryWaivedPaisa);

    return {
      challanNo: order.orderNo,
      issuedAt: order.placedAt.toISOString(),
      seller: {
        name: ready.businessName!,
        address: ready.businessAddress!,
        bin: ready.businessBin!,
        vatCircle: ready.businessVatCircle,
      },
      buyer: {
        name: order.customer?.name ?? '',
        address: order.address,
        bin: order.buyerBin,
        phone: order.customer?.phone ?? null,
      },
      lines,
      subtotalPaisa: order.subtotalPaisa,
      discountPaisa: order.discountPaisa,
      deliveryPaisa: delivery,
      sdPaisa: 0,
      vatPaisa: order.vatPaisa,
      totalPaisa: order.totalPaisa,
      inWords: takaInWords(order.totalPaisa),
      signatory: {
        name: ready.signatoryName!,
        designation: ready.signatoryDesignation ?? '',
      },
      vatRateBps: ready.vatRateBps,
    };
  }
}
