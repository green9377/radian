import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/*
  DEC-GBL-001 / DEC-GBL-006 (owner, 21 Aug 2026) — one payment list for the
  whole Business OS, and under each method the actual accounts it is taken in.

  Before this, the same four names lived in three enums, a POS-only on/off
  array and Finance's money accounts, so switching bKash off at the till left
  it standing on purchase bills and refunds. The owner's rule: "off krle sob
  jaygay off, on krle sob jaygay on."

  Then the second half of the same problem: "amder bkash 2-3 ta ba bank 3-4 ta"
  — a method is not an account. bKash is HOW the money moves; 01711…, 01812…
  are WHERE it lands. The accounts are Finance's money accounts (DEC-FIN-008),
  not a second list: the ledger has always had one per method, so another bKash
  number is simply another row on the same table. Add one here and the books
  know it immediately.

  This service is the single reader. It sits in CommonModule (@Global) so POS,
  Purchases, Suppliers and Returns can all ask the same question without any
  of them owning the answer.

  What it does NOT do: rewrite history. The enums stay as the stored value, so
  a bill written in bKash is still a bKash bill after bKash is switched off.
  The master only decides what a NEW payment may use.
*/

export interface PaymentAccountRow {
  id: string;
  name: string;
  accountRef: string | null;
  accountHolder: string | null;
  bankName: string | null;
  branchName: string | null;
  routingNo: string | null;
  isActive: boolean;
  isSystem: boolean;
}

export interface PaymentMethodRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
  accounts?: PaymentAccountRow[];
}

/** ORIGINAL / STORE_CREDIT are rules, not tills — they are always allowed. */
const NOT_A_TILL = new Set(['ORIGINAL', 'STORE_CREDIT']);

/** the counter's own value and the website's two ride on the cash drawer */
const METHOD_ALIAS: Record<string, string> = { COUNTER: 'CASH', COD: 'CASH', ONLINE: 'CARD' };

interface AccountRecord {
  id: string;
  name: string;
  accountRef: string | null;
  accountHolder: string | null;
  bankName: string | null;
  branchName: string | null;
  routingNo: string | null;
  isActive: boolean;
  isSystem: boolean;
  payMethod: string | null;
  code: string;
}

/** the free-text details a screen may write on an account */
export interface AccountDetailsDto {
  name?: string;
  accountRef?: string | null;
  accountHolder?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  routingNo?: string | null;
}

const DETAIL_KEYS = ['accountRef', 'accountHolder', 'bankName', 'branchName', 'routingNo'] as const;

@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  private get table() {
    /*  cast: a client generated before this migration has no model for it.
        Drops out at the next regenerate.  */
    return (this.prisma as unknown as {
      paymentMethodMaster?: {
        findMany(a: unknown): Promise<PaymentMethodRow[]>;
        findFirst(a: unknown): Promise<PaymentMethodRow | null>;
        update(a: unknown): Promise<PaymentMethodRow>;
      };
    }).paymentMethodMaster;
  }

  /* ------------------------------------------------------------- methods */

  async list(): Promise<PaymentMethodRow[]> {
    const t = this.table;
    if (!t) return [];
    let methods: PaymentMethodRow[];
    try {
      methods = await t.findMany({ orderBy: { sortOrder: 'asc' } });
    } catch {
      return [];
    }
    const accounts = await this.moneyAccounts();
    return methods.map((m) => ({
      ...m,
      accounts: accounts
        .filter((a) => (a.payMethod ?? '').toUpperCase() === m.code.toUpperCase())
        .map((a) => this.accountRow(a)),
    }));
  }

  /** the codes a new payment may use, upper-cased */
  async activeCodes(): Promise<Set<string>> {
    const rows = await this.list();
    return new Set(rows.filter((r) => r.isActive).map((r) => r.code.toUpperCase()));
  }

  /**
   * Refuse a payment on a method the shop has switched off. Fail-OPEN when the
   * table is empty or unreachable: a till that cannot read a setting must still
   * be able to take money (the shop does not close because a lookup failed).
   */
  async assertActive(method: string | null | undefined): Promise<void> {
    if (!method) return;
    const code = this.canonical(method);
    if (!code) return;
    const rows = await this.list();
    if (!rows.length) return;
    const row = rows.find((r) => r.code.toUpperCase() === code);
    if (!row) return; // unknown to the master — the module's own enum already judged it
    if (!row.isActive)
      throw new BadRequestException(
        `${row.name} is switched off for the whole shop — turn it back on in Setup → Payment methods, or use another method.`,
      );
  }

  async update(
    id: string,
    patch: { isActive?: boolean; name?: string; sortOrder?: number },
  ): Promise<PaymentMethodRow> {
    const t = this.table;
    if (!t) throw new BadRequestException('Payment methods are not set up yet.');
    const row = await t.findFirst({ where: { id } });
    if (!row) throw new BadRequestException('No such payment method.');
    if (row.isSystem && patch.isActive === false)
      throw new BadRequestException(
        `${row.name} belongs to the website — switch it off where the gateway or the delivery method is set up.`,
      );
    const data: Record<string, unknown> = {};
    if (patch.isActive !== undefined) data.isActive = patch.isActive;
    if (patch.name !== undefined && patch.name.trim()) data.name = patch.name.trim();
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
    await t.update({ where: { id }, data });
    const fresh = await this.list();
    return fresh.find((m) => m.id === id)!;
  }

  /* ------------------------------------------------------------ accounts */

  private async moneyAccounts(): Promise<AccountRecord[]> {
    const rows = await this.prisma.db.financeAccount.findMany({
      where: { isMoneyAccount: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: {
        id: true, name: true, isActive: true, isSystem: true, payMethod: true, code: true,
        // DEC-GBL-006 (cast: pre-migration client)
        ...({ accountRef: true, accountHolder: true, bankName: true, branchName: true, routingNo: true } as object),
      },
    });
    return rows as unknown as AccountRecord[];
  }

  /** every account of one method — the till only asks when there is a choice */
  async accountsFor(method: string | null | undefined): Promise<PaymentAccountRow[]> {
    const code = this.canonical(method);
    if (!code) return [];
    const all = await this.moneyAccounts();
    return all
      .filter((a) => (a.payMethod ?? '').toUpperCase() === code && a.isActive)
      .map((a) => this.accountRow(a));
  }

  /**
   * Which account this payment belongs to. One account = no question asked;
   * several = the screen must have said which, because "৳5,000 in bKash" with
   * three numbers on the wall is not an answer anybody can reconcile.
   */
  async resolveAccount(
    method: string | null | undefined,
    accountId?: string | null,
  ): Promise<string | null> {
    const list = await this.accountsFor(method);
    if (!list.length) return null;
    if (accountId) {
      const hit = list.find((a) => a.id === accountId);
      if (!hit)
        throw new BadRequestException('That account does not belong to this payment method.');
      return hit.id;
    }
    if (list.length === 1) return list[0].id;
    throw new BadRequestException(
      `Say which ${(await this.label(method)) ?? 'account'} the money went to — there are ${list.length}.`,
    );
  }

  private accountRow(a: AccountRecord): PaymentAccountRow {
    return {
      id: a.id,
      name: a.name,
      accountRef: a.accountRef ?? null,
      accountHolder: a.accountHolder ?? null,
      bankName: a.bankName ?? null,
      branchName: a.branchName ?? null,
      routingNo: a.routingNo ?? null,
      isActive: a.isActive,
      isSystem: a.isSystem,
    };
  }

  private detailData(dto: AccountDetailsDto): Record<string, string | null> {
    const data: Record<string, string | null> = {};
    for (const k of DETAIL_KEYS) {
      if (dto[k] !== undefined) data[k] = (dto[k] ?? '').trim() || null;
    }
    return data;
  }

  async addAccount(
    methodId: string,
    dto: AccountDetailsDto,
  ): Promise<PaymentMethodRow[]> {
    const t = this.table;
    if (!t) throw new BadRequestException('Payment methods are not set up yet.');
    const method = await t.findFirst({ where: { id: methodId } });
    if (!method) throw new BadRequestException('No such payment method.');
    const name = (dto.name ?? '').trim();
    if (!name) throw new BadRequestException('Give the account a name.');

    /*  The code is the ledger's, so it has to stay unique and readable: take
        the next number after the highest money account there is.  */
    const money = await this.moneyAccounts();
    const highest = money
      .map((a) => parseInt(a.code, 10))
      .filter((n) => Number.isFinite(n))
      .reduce((m, n) => Math.max(m, n), 1000);
    const code = String(highest + 1);

    await this.prisma.db.financeAccount.create({
      data: {
        code,
        name,
        type: 'ASSET',
        groupName: 'Money',
        isMoneyAccount: true,
        payMethod: method.code.toUpperCase(),
        isSystem: false,
        isActive: true,
        sortOrder: 100 + money.length,
        ...(this.detailData(dto) as object),
      },
    });
    return this.list();
  }

  async updateAccount(
    accountId: string,
    patch: AccountDetailsDto & { isActive?: boolean },
  ): Promise<PaymentMethodRow[]> {
    const acc = await this.prisma.db.financeAccount.findFirst({ where: { id: accountId } });
    if (!acc || !acc.isMoneyAccount) throw new BadRequestException('No such account.');
    const data: Record<string, unknown> = this.detailData(patch);
    if (patch.name !== undefined && patch.name.trim()) data.name = patch.name.trim();
    if (patch.isActive !== undefined) {
      if (patch.isActive === false) {
        const siblings = await this.accountsFor(acc.payMethod);
        if (siblings.length <= 1)
          throw new BadRequestException(
            'This is the only account left on that method — switch the whole method off instead.',
          );
      }
      data.isActive = patch.isActive;
    }
    await this.prisma.db.financeAccount.update({ where: { id: accountId }, data });
    return this.list();
  }

  /**
   * Delete an account that was added by mistake. Same rules as the chart of
   * accounts (DEC-FIN-014): a system row or one with ledger lines or payments
   * behind it can only be switched off — history never loses its account.
   */
  async deleteAccount(accountId: string): Promise<PaymentMethodRow[]> {
    const acc = await this.prisma.db.financeAccount.findFirst({ where: { id: accountId } });
    if (!acc || !acc.isMoneyAccount) throw new BadRequestException('No such account.');
    if (acc.isSystem)
      throw new BadRequestException(
        `${acc.name} is the ledger's built-in account for this method — switch it off instead.`,
      );
    const [lines, pos, pur, sup] = await Promise.all([
      this.prisma.db.journalLine.count({ where: { accountId } }),
      this.prisma.db.paymentTransaction.count({ where: ({ accountId } as object) }),
      this.prisma.db.purchasePayment.count({ where: ({ accountId } as object) }),
      this.prisma.db.supplierPayment.count({ where: ({ accountId } as object) }),
    ]);
    if (lines + pos + pur + sup > 0)
      throw new BadRequestException(
        'Money has already moved through this account — switch it off instead of deleting.',
      );
    await this.prisma.db.financeAccount.update({
      where: { id: accountId },
      data: { deletedAt: new Date() },
    });
    return this.list();
  }

  /* ------------------------------------------------------------- helpers */

  /** the master's code for a stored value, or null when it is not a till at all */
  private canonical(method: string | null | undefined): string | null {
    if (!method) return null;
    const raw = method.toUpperCase();
    if (NOT_A_TILL.has(raw)) return null;
    return METHOD_ALIAS[raw] ?? raw;
  }

  private async label(method: string | null | undefined): Promise<string | null> {
    const code = this.canonical(method);
    if (!code) return null;
    const rows = await this.list();
    return rows.find((r) => r.code.toUpperCase() === code)?.name ?? null;
  }
}
