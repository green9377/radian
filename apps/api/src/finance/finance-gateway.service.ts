import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ACC, FinanceService } from './finance.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  DEC-FIN-030 — GATEWAY SETTLEMENT: closing the gap between what the gateway
  owes and what the bank actually holds.

  A payment gateway does not hand money over as it is taken. SSLCommerz keeps
  every online payment, waits until at least Tk 2,500 has piled up, skips bank
  holidays, and then sends one lump sum to the settlement account — BRAC Bank,
  Natun Bazar, A/C 2071119390001, read from the merchant panel on 26 Aug 2026.

  So the Gateway money account (1050) runs permanently ahead of the bank, and
  that is CORRECT rather than a fault: it holds exactly what SSLCommerz still
  owes the shop, which is a figure with an outside authority to check it
  against — the panel's own "Unsettled Payable".

  ⚠️ THIS SERVICE OWNS NO TABLE. A payout is money moving between two money
  accounts, and `Transfer` already owns that fact. A `GatewaySettlement` model
  was written into the schema and removed the same hour rather than give one
  fact two owners (house rule 4). What lives here is the part that is genuinely
  about gateways: the balance, the ceiling, and the words.
  ═══════════════════════════════════════════════════════════════════════════
*/

export interface GatewaySettleDto {
  /** where the payout landed — a Finance money account (DEC-GBL-006) */
  toAccountId: string;
  /** what the BANK received, in paisa. Typed from the statement, never derived */
  amountPaisa: number;
  /** the bank's own date, YYYY-MM-DD */
  settledOn?: string;
  note?: string;
  actorName?: string;
}

@Injectable()
export class FinanceGatewayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  /**
   * What the screen shows before anything is typed.
   *
   * `heldPaisa` is derived from the ledger like every other balance
   * (FIN-RULE-008) — never stored, never edited. It is the number to hold up
   * against the panel.
   */
  async summary() {
    const accounts = await this.finance.accounts();
    const gateway = accounts.find((a) => a.code === ACC.GATEWAY);
    if (!gateway) throw new BadRequestException(`Chart of accounts is missing ${ACC.GATEWAY}`);

    /*  Where a payout may land: any money account that is not the gateway
        itself. The owner's own named bank accounts are in here (DEC-GBL-006),
        so the screen can ask rather than pick a silent default.  */
    const destinations = accounts
      .filter((a) => a.isMoneyAccount && a.isActive && a.code !== ACC.GATEWAY)
      .map((a) => ({ id: a.id, code: a.code, name: a.name, balancePaisa: a.balancePaisa }));

    return {
      gatewayAccountId: gateway.id,
      gatewayName: gateway.name,
      /** what the gateway still owes the shop, by our books */
      heldPaisa: gateway.balancePaisa,
      destinations,
      /** what the gateway has already paid over, newest first */
      recent: await this.recent(gateway.id),
      /*  The shop's own settlement terms, so the screen can say WHY nothing
          has arrived yet instead of looking broken on a quiet week. Read from
          the merchant panel, not guessed — but they are SSLCommerz's terms and
          SSLCommerz can change them, so they are shown as a note, never used
          to block anything.  */
      terms: {
        minimumPaisa: 250_000, // Tk 2,500
        note: 'SSLCommerz pays out once at least Tk 2,500 has built up, and not on bank holidays.',
      },
    };
  }

  private async recent(gatewayAccountId: string) {
    const rows = await this.prisma.db.transfer.findMany({
      where: { fromId: gatewayAccountId },
      orderBy: [{ movedAt: 'desc' }, { transferNo: 'desc' }],
      take: 50,
      include: { to: { select: { code: true, name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      transferNo: r.transferNo,
      movedAt: r.movedAt,
      amountPaisa: r.amountPaisa,
      toName: r.to?.name ?? null,
      note: r.note,
      actorName: r.actorName,
    }));
  }

  /**
   * Record one payout.
   *
   * ⚠️ The ONE rule this method exists to enforce: **a payout can never be
   * larger than what the gateway still owes.** Money in/out would have taken
   * any figure typed into it, and a slip of a digit leaves an orphan balance
   * on the Gateway account that nobody notices until it is old and nobody can
   * say which settlement it came from. That failure mode is why the owner
   * chose a screen over a plain transfer (DEC-FIN-030).
   *
   * ⚠️ The amount is NOT computed from the unsettled payments. It is typed
   * from the bank statement, because the statement is the authority. A figure
   * this system worked out for itself would agree with itself for ever while
   * being wrong, and then the one check worth having — our books against the
   * panel — would be checking a number against its own source.
   */
  async settle(dto: GatewaySettleDto) {
    const { gatewayAccountId, heldPaisa, gatewayName } = await this.summary();

    if (!dto.toAccountId) throw new BadRequestException('Say which account received the money');
    if (!dto.amountPaisa || dto.amountPaisa <= 0)
      throw new BadRequestException('Enter the amount the bank received');
    if (dto.toAccountId === gatewayAccountId)
      throw new BadRequestException('A payout has to land somewhere other than the gateway');

    if (dto.amountPaisa > heldPaisa) {
      const taka = (p: number) => `Tk ${(p / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      throw new BadRequestException(
        `${gatewayName} is only holding ${taka(heldPaisa)}, so a payout of ${taka(dto.amountPaisa)} cannot be right. ` +
          'Check the amount against the bank statement — and if the statement is right, ' +
          'a payment is missing from our books before this settlement can be recorded.',
      );
    }

    /*  Straight onto the existing transfer posting: debit the bank, credit the
        gateway. `feePaisa` is deliberately ZERO — the gateway's cut was already
        taken out of each payment as it settled (DEC-FIN-029), so charging it
        again here would count the same expense twice.  */
    return this.finance.createTransfer({
      fromId: gatewayAccountId,
      toId: dto.toAccountId,
      amountPaisa: dto.amountPaisa,
      feePaisa: 0,
      movedAt: dto.settledOn,
      note: dto.note?.trim() || 'Gateway settlement',
      actorName: dto.actorName,
    });
  }
}
