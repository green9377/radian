import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthedRequest } from './auth.guard';

/*  The ledger and the audit trail must record WHO, not what somebody typed.

    Two channels carried a claimed name and both were trivially forgeable:
      · `actorName` in the request body        — Finance, Orders, POS, Returns…
      · the `x-actor-name` header              — Assembly, Customers, Items…
    Both are now overwritten with the signed-in user, so a staff member cannot
    write the owner's name against a refund or a stock adjustment. Runs after
    AuthGuard, so req.actor is set.

    Registered globally (AuthModule), which means a module added next month
    inherits a truthful audit trail without anyone remembering to wire it. */
@Injectable()
export class ActorInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (req.actor) {
      if (req.body && typeof req.body === 'object') {
        (req.body as Record<string, unknown>).actorName = req.actor.name;
      }
      req.headers['x-actor-name'] = req.actor.name;
    }
    return next.handle();
  }
}
