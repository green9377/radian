import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { ActorInterceptor } from './actor.interceptor';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';

/*  Access — login says who is at the keyboard, the PIN re-confirms it at the
    moment money moves (DEC-FIN-028). The future Roles & Permissions module will
    adopt these tables rather than replace them.

    The guard and the actor interceptor are registered GLOBALLY here, so a new
    controller is locked the day it is written — the safe default. Anything that
    genuinely has to stay open (login, setup, the health ping) says so out loud
    with @Public(). Nothing is protected by somebody remembering to add a
    decorator. */
@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    ActorInterceptor,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_INTERCEPTOR, useExisting: ActorInterceptor },
  ],
  exports: [AuthService, AuthGuard, ActorInterceptor],
})
export class AuthModule {}
