import { BadRequestException, Body, Controller, Get, Injectable, Logger, Module, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/auth.guard';
import { IntegrationsService } from '../administration/integrations.service';
import { AdministrationModule } from '../administration/administration.module';
import { PrismaModule } from '../prisma/prisma.module';

/*
  "Continue with Google" on the login page (owner, 8 Sep 2026).

  The browser gets Google's ID token from Google's own button; nothing here
  ever sees a Google password. The token is checked with Google (tokeninfo),
  it must be for OUR client id and carry a verified email — and that is the
  sign-in. Owner's ruling: no phone number is asked for. A customer record
  with that email signs in as that customer; a new person simply signs in
  with the name and email Google vouched for, and the customer record is
  made later, the first time they order (checkout takes the phone then).

  The Client ID lives in Setup → Integrations → Google Sign-In. No Client ID,
  no button: the login page asks for the config first and draws nothing when
  it is empty.
*/

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
      this.log.log('google sign-in: existing customer');
      return { ok: true as const, customer: { name: found.name, phone: found.phone, email: found.email ?? g.email } };
    }
    this.log.log('google sign-in: new visitor, no record yet');
    return { ok: true as const, customer: { name: g.name || g.email.split('@')[0], phone: null, email: g.email } };
  }
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
}

@Module({
  imports: [PrismaModule, AdministrationModule],
  providers: [GoogleSignInService],
  controllers: [GoogleSignInController],
})
export class GoogleSignInModule {}
