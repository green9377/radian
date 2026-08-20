import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * A database constraint is never a server crash.
 *
 * Owner, 20 Aug 2026: adding a colour that had been removed earlier answered
 * "Internal server error" — a red box with nothing to act on. The cause was a
 * unique constraint (the soft-deleted row still held the name), which reached the
 * client as a raw 500 because nothing translated Prisma's error codes.
 *
 * Each service should still catch the cases it can explain properly (see
 * revive-buried.ts). This filter is the floor beneath them: whatever slips
 * through comes out as a 400/404/409 in words, and the technical detail stays in
 * the server log where it belongs.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Prisma');

  catch(err: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const target = Array.isArray(err.meta?.target)
      ? (err.meta.target as string[]).join(', ')
      : String(err.meta?.target ?? '');

    let status = HttpStatus.BAD_REQUEST;
    let message: string;

    switch (err.code) {
      case 'P2002':
        status = HttpStatus.CONFLICT;
        message = target
          ? `Something with the same ${target} already exists. It may be a row that was removed earlier — rename this one, or restore the old row.`
          : 'Something with the same name already exists.';
        break;
      case 'P2025':
        status = HttpStatus.NOT_FOUND;
        message = 'That record no longer exists — the screen may be out of date. Reload and try again.';
        break;
      case 'P2003':
        message = 'Another record still points at this one, so it cannot be changed or removed yet.';
        break;
      case 'P2011':
        message = `A required value is missing${target ? `: ${target}` : ''}.`;
        break;
      default:
        message = 'The database refused that change. Nothing was saved.';
    }

    this.logger.error(`${err.code} ${target} — ${err.message.split('\n').pop()?.trim() ?? ''}`);
    res.status(status).json({ statusCode: status, message, code: err.code });
  }
}
