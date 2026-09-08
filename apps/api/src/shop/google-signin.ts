import { BadRequestException, Body, Controller, Get, Injectable, Logger, Module, Post } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/auth.guard';
import { IntegrationsService } from '../administration/integrations.service';
import { AdministrationModule } from '../administration/administration.module';
import { PrismaModule } from '../prisma/prisma.module';

/*
  "Continue with Google" on the login page (owner, 8 Sep 2026).

  The browser gets Google's ID token from Google's own button; nothing here
  ever sees a Google password. The token is checked with Google (tokeninfo),
  it must be for OUR client id and carry a verified email, and then:

    · a customer with that email  → signed in
    · nobody with that email      → the browser is handed a short-lived,
      signed TICKET and asks for a phone number once. The phone is the
      identity every order and message runs on, so an account cannot exist
      without one. `complete` turns ticket + phone into the customer.

  A phone that already belongs to a different email is refused — the person
  who owns that number signs in with the number (a code), which proves it.
  Linking an unproven phone to a stranger's account is exactly the door this
  must not open.

  The Client ID lives in Setup → Integrations → Google Sign-In. No Client ID,
  no button: the login page asks for the config first and draws nothing when
  it is empty.
*/

const TICKET_TTL_MS = 10 * 60_000;

@Injectable()
export class GoogleSignInService {
  private readonly log = new Logger('GoogleSignIn');

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  async clientId(): Promise<string | null> {
    try {
      const c = await this.integrations.credentials('SOCIAL', 'GOOGLE_SIGNIN');
      if (c?.isEnabled && c.clientId?.trim()) return c.clientId.trim();
    } catch {
      /* not configured */
    }
    return null;
  }

  /** Google's own answer for the token — audience and a verified email are checked here. */
  private async verify(credential: string): Promise<{ email: string; name: string; sub: string }> {
    const clientId = await this.clientId();
    if (!clientId) throw new BadRequestException('Google sign-in is not switched on');
    if (!credential || credential.length > 4096) throw new BadRequestException('No Google credential');

    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!res.ok) throw new BadRequestException('Google did not accept that sign-in. Please try again.');
    const j = (await res.json()) as {
      aud?: string; email?: string; email_verified?: string | boolean; name?: string; sub?: string; exp?: string;
    };
    if (j.aud !== clientId) throw new BadRequestException('That sign-in was not for this shop');
    if (!j.email || String(j.email_verified) !== 'true') throw new BadRequestException('Google has not verified that email');
    if (j.exp && Number(j.exp) * 1000 < Date.now()) throw new BadRequestException('That sign-in has expired. Please try again.');
    return { email: j.email.trim().toLowerCase(), name: (j.name ?? '').trim(), sub: j.sub ?? '' };
  }

  async signIn(credential: string) {
    const g = await this.verify(credential);
    const found = await this.prisma.db.customer.findFirst({
      where: { email: { equals: g.email, mode: 'insensitive' }, deletedAt: null },
      select: { name: true, phone: true, email: true, status: true },
    });
    if (found) {
      if (found.status === 'BLOCKED') throw new BadRequestException('This account is not able to sign in. Please contact us.');
      this.log.log(`google sign-in: existing customer`);
      return { ok: true as const, customer: { name: found.name, phone: found.phone, email: found.email ?? g.email } };
    }
    return { ok: false as const, needPhone: true as const, name: g.name, ticket: this.ticket(g.email, g.name) };
  }

  async complete(ticket: string, phoneRaw: string) {
    const t = this.readTicket(ticket);
    if (!t) throw new BadRequestException('That sign-in has expired. Please start again.');
    const phone = e164(phoneRaw);
    if (!phone) throw new BadRequestException('That does not look like a phone number');

    const byPhone = await this.prisma.db.customer.findFirst({
      where: { phone, deletedAt: null },
      select: { id: true, name: true, phone: true, email: true, status: true },
    });
    if (byPhone) {
      if (byPhone.status === 'BLOCKED') throw new BadRequestException('This account is not able to sign in. Please contact us.');
      if (byPhone.email?.trim() && byPhone.email.trim().toLowerCase() !== t.email) {
        throw new BadRequestException('This number already has an account. Log in with the number instead.');
      }
      const row = await this.prisma.db.customer.update({
        where: { id: byPhone.id },
        data: { email: t.email, ...(byPhone.name.trim() ? {} : { name: t.name || byPhone.name }) },
        select: { name: true, phone: true, email: true },
      });
      return { ok: true as const, customer: { name: row.name, phone: row.phone, email: row.email ?? t.email } };
    }

    const row = await this.prisma.db.customer.create({
      data: {
        name: t.name || t.email.split('@')[0],
        phone,
        email: t.email,
        country: phone.startsWith('+880') ? 'Bangladesh' : 'Abroad',
      },
      select: { name: true, phone: true, email: true },
    });
    this.log.log(`google sign-in: new customer`);
    return { ok: true as const, customer: { name: row.name, phone: row.phone, email: row.email ?? t.email } };
  }

  /* ---- the ticket: email + name + expiry, signed with the server's secret ---- */

  private secret(): string {
    const s = process.env.JWT_SECRET?.trim();
    if (!s || s === 'change_this_secret') throw new BadRequestException('Sign-in is not set up on this server');
    return s;
  }

  private ticket(email: string, name: string): string {
    const body = Buffer.from(JSON.stringify({ email, name, exp: Date.now() + TICKET_TTL_MS })).toString('base64url');
    const sig = createHmac('sha256', this.secret()).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  private readTicket(ticket: string): { email: string; name: string } | null {
    const [body, sig] = (ticket ?? '').split('.');
    if (!body || !sig) return null;
    const want = createHmac('sha256', this.secret()).update(body).digest('base64url');
    if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
    try {
      const t = JSON.parse(Buffer.from(body, 'base64url').toString()) as { email: string; name: string; exp: number };
      if (!t.email || t.exp < Date.now()) return null;
      return { email: t.email, name: t.name ?? '' };
    } catch {
      return null;
    }
  }
}

/** The same shape OtpService keeps: +<country><number>; a bare 01X is Bangladesh. */
function e164(raw: string): string | null {
  const s = (raw ?? '').trim().replace(/[\s\-()]/g, '');
  if (!s) return null;
  if (s.startsWith('+')) return /^\+\d{8,15}$/.test(s) ? s : null;
  const d = s.replace(/\D/g, '');
  if (/^01\d{9}$/.test(d)) return `+88${d}`;
  if (/^8801\d{9}$/.test(d)) return `+${d}`;
  return null;
}

@Controller('shop/auth')
export class GoogleSignInController {
  constructor(private readonly svc: GoogleSignInService) {}

  /** the login page asks whether to draw the button, and with which id */
  @Public()
  @Get('google')
  async config() {
    return { clientId: await this.svc.clientId() };
  }

  @Public()
  @Post('google')
  signIn(@Body() b: { credential?: string }) {
    return this.svc.signIn(b?.credential ?? '');
  }

  @Public()
  @Post('google/complete')
  complete(@Body() b: { ticket?: string; phone?: string }) {
    return this.svc.complete(b?.ticket ?? '', b?.phone ?? '');
  }
}

@Module({
  imports: [PrismaModule, AdministrationModule],
  providers: [GoogleSignInService],
  controllers: [GoogleSignInController],
})
export class GoogleSignInModule {}
