import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service';

/** routes that may be reached without signing in (login, setup, status) */
export const PUBLIC = 'radian:public';
export const Public = () => SetMetadata(PUBLIC, true);

/** money actions — the open session must be re-confirmed with the 4-digit PIN */
export const NEEDS_PIN = 'radian:needsPin';
export const NeedsPin = () => SetMetadata(NEEDS_PIN, true);

/*  Who may reach this route at all.

    Three roles, and the split is about MONEY, not seniority:
      STAFF   — runs the shop: orders, POS, stock, assembly, delivery, returns.
                Never sees what anything cost us, what we earn, or what we owe.
      MANAGER — the above plus buying (purchases, suppliers) and the whole
                Finance module EXCEPT the owner's own decisions.
      OWNER   — everything, including capital, profit sharing, opening
                balances, manual journals, closing a month, and who has access.

    A route with no @Roles() is open to anybody signed in. */
export const ROLES = 'radian:roles';
export type AppRoleName = 'OWNER' | 'MANAGER' | 'STAFF';
export const Roles = (...roles: AppRoleName[]) => SetMetadata(ROLES, roles);

export interface AuthedRequest extends Request {
  actor?: { id: string; name: string; role: string };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = (req.headers['x-radian-token'] as string | undefined)?.trim();
    const user = await this.auth.userForToken(token);
    if (!user) throw new UnauthorizedException('Please sign in again');

    // the ledger records THIS name — never one typed into a form
    req.actor = { id: user.id, name: user.name, role: user.role };

    const roles = this.reflector.getAllAndOverride<AppRoleName[]>(ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles?.length && !roles.includes(user.role as AppRoleName))
      throw new ForbiddenException('This part is not open to your account');

    const needsPin = this.reflector.getAllAndOverride<boolean>(NEEDS_PIN, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (needsPin) {
      const pin = (req.headers['x-radian-pin'] as string | undefined)?.trim();
      const ok = await this.auth.checkPin(user.id, pin);
      if (!ok) throw new ForbiddenException('PIN required — confirm it is really you');
    }
    return true;
  }
}
