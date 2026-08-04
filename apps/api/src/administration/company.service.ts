import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { ensureSingleton } from '../common/singleton';

export interface CompanyWriteDto {
  legalName?: string | null;
  tradeName?: string | null;
  bin?: string | null;
  tin?: string | null;
  tradeLicenceNo?: string | null;
  tradeLicenceExpiry?: string | null;
  vatCircle?: string | null;
  registeredAddress?: string | null;
  operatingAddress?: string | null;
  city?: string | null;
  postcode?: string | null;
  country?: string | null;
  publicPhone?: string | null;
  publicEmail?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  /* the storefront's "Visit the shop" card (31 Jul 2026). Administration still
     owns the row; the Storefront screen edits it through this service rather
     than writing CompanySetting itself. */
  mapUrl?: string | null;
  whatsappPhone?: string | null;
  shopImageUrl?: string | null;
}

/**
 * CompanyService — who the company itself is. ADM-D08.
 *
 * Six identity fields have been living in `FinanceSetting` since Mushak 6.3 was
 * built, because that is where they were first needed. That was reasonable then
 * and wrong now: the company's registered name and address are not Finance's
 * property, they are the company's. A trade licence number certainly is not.
 *
 * Mushak 6.3 has been complete and tested for weeks and was waiting on the BIN
 * field alone. So this takes over as the source WITHOUT touching the old
 * columns: the challan reads here first and falls back to Finance when a field
 * is blank. Changing a government form and moving its data in one step is how
 * you find out in an audit that you got it wrong.
 */
@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /*  ⚠️ ensureSingleton, never a hand-written findFirst-then-create and never a
      bare upsert. Two requests arriving together — which is the NORMAL case, a
      React effect fires the same fetch twice on mount — both saw no row, both
      inserted, and the second died with P2002. That was found the hard way on
      29 July across eight modules. See common/singleton.ts.  */
  async settings() {
    return ensureSingleton(
      () => this.prisma.db.companySetting.findFirst(),
      () => this.prisma.db.companySetting.create({ data: {} }),
    );
  }

  /**
   * What is still missing before a Mushak 6.3 challan may be printed.
   *
   * The form is a government document, so nothing on it may be invented. The
   * screen refuses to print rather than issue a challan with a made-up BIN.
   */
  async readiness() {
    const c = await this.settings();
    const missing: string[] = [];
    if (!c.bin?.trim()) missing.push('13-digit BIN');
    if (!c.legalName?.trim()) missing.push('Registered business name');
    if (!c.registeredAddress?.trim()) missing.push('Registered address');
    if (!c.signatoryName?.trim()) missing.push('Who signs the challan');

    /*  A licence that expired is worse than one nobody recorded: the business is
        trading without it and nobody knows. Not blocking — Mushak does not ask
        for it — but said out loud on the screen.  */
    const licence = c.tradeLicenceExpiry
      ? {
          expiry: c.tradeLicenceExpiry,
          daysLeft: Math.ceil(
            (c.tradeLicenceExpiry.getTime() - Date.now()) / 86400000,
          ),
        }
      : null;

    return { ready: missing.length === 0, missing, licence };
  }

  async update(dto: CompanyWriteDto, actorName: string) {
    const before = await this.settings();

    /*  Checked, not trusted. A BIN with the wrong number of digits on a
        government form is the kind of mistake that is only discovered by
        somebody official.  */
    if (dto.bin != null && dto.bin.trim() && !/^\d{9,13}$/.test(dto.bin.trim()))
      throw new BadRequestException('A BIN is 9 to 13 digits, numbers only');
    if (dto.tin != null && dto.tin.trim() && !/^\d{9,15}$/.test(dto.tin.trim()))
      throw new BadRequestException('A TIN is 9 to 15 digits, numbers only');
    if (
      dto.publicEmail != null && dto.publicEmail.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.publicEmail.trim())
    )
      throw new BadRequestException('That email address does not look right');

    let expiry: Date | null | undefined;
    if (dto.tradeLicenceExpiry !== undefined) {
      if (!dto.tradeLicenceExpiry) expiry = null;
      else {
        const d = new Date(dto.tradeLicenceExpiry);
        if (Number.isNaN(d.getTime()))
          throw new BadRequestException('That expiry date could not be read');
        expiry = d;
      }
    }

    const text = (v: string | null | undefined) =>
      v === undefined ? undefined : v?.trim() ? v.trim() : null;

    const updated = await this.prisma.db.companySetting.update({
      where: { id: before.id },
      data: {
        legalName: text(dto.legalName),
        tradeName: text(dto.tradeName),
        bin: text(dto.bin),
        tin: text(dto.tin),
        tradeLicenceNo: text(dto.tradeLicenceNo),
        tradeLicenceExpiry: expiry,
        vatCircle: text(dto.vatCircle),
        registeredAddress: text(dto.registeredAddress),
        operatingAddress: text(dto.operatingAddress),
        city: text(dto.city),
        postcode: text(dto.postcode),
        country: text(dto.country) ?? undefined,
        publicPhone: text(dto.publicPhone),
        publicEmail: text(dto.publicEmail),
        website: text(dto.website),
        logoUrl: text(dto.logoUrl),
        signatoryName: text(dto.signatoryName),
        signatoryDesignation: text(dto.signatoryDesignation),
        mapUrl: text(dto.mapUrl),
        whatsappPhone: text(dto.whatsappPhone),
        shopImageUrl: text(dto.shopImageUrl),
      },
    });

    /*  Only what actually changed is logged. "Somebody saved this form" is not
        an audit trail; "the BIN went from blank to 1234…" is. These fields end
        up on a government document, so the question "who typed that" has to
        have an answer.  */
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of Object.keys(dto) as (keyof CompanyWriteDto)[]) {
      const from = (before as Record<string, unknown>)[k];
      const to = (updated as Record<string, unknown>)[k];
      const same =
        from instanceof Date && to instanceof Date
          ? from.getTime() === to.getTime()
          : from === to;
      if (!same) changes[k] = { from, to };
    }
    if (Object.keys(changes).length) {
      await this.audit.record({
        entityType: 'CompanySetting',
        entityId: updated.id,
        action: 'UPDATE',
        actorName,
        changes,
      });
    }

    return updated;
  }
}
