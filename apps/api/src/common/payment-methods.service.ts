import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/*
  DEC-GBL-001 (owner, 21 Aug 2026) — one payment-method list for the whole
  Business OS.

  Before this, the same four names lived in three enums, a POS-only on/off
  array and Finance's money accounts, so switching bKash off at the till left
  it standing on purchase bills and refunds. The owner's rule: "off krle sob
  jaygay off, on krle sob jaygay on."

  This service is the single reader. It sits in CommonModule (@Global) so POS,
  Purchases, Suppliers and Returns can all ask the same question without any
  of them owning the answer.

  What it does NOT do: rewrite history. The enums stay as the stored value, so
  a bill written in bKash is still a bKash bill after bKash is switched off.
  The master only decides what a NEW payment may use.
*/

export interface PaymentMethodRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
}

/** ORIGINAL / STORE_CREDIT are rules, not tills — they are always allowed. */
const NOT_A_TILL = new Set(['ORIGINAL', 'STORE_CREDIT']);

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

  async list(): Promise<PaymentMethodRow[]> {
    const t = this.table;
    if (!t) return [];
    try {
      return await t.findMany({ orderBy: { sortOrder: 'asc' } });
    } catch {
      return [];
    }
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
    const code = method.toUpperCase();
    if (NOT_A_TILL.has(code)) return;
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
    return t.update({ where: { id }, data });
  }
}
