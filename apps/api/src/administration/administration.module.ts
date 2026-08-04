import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { AdministrationController } from './administration.controller';
import { RegistryService } from './registry.service';
import { AccessService } from './access.service';
import { AccessGuard } from './access.guard';
import { PeopleService } from './people.service';
import { CompanyService } from './company.service';
import { SystemService } from './system.service';
import { IntegrationsService } from './integrations.service';

/**
 * ADMINISTRATION — RADIAN_ADMINISTRATION_MODULE_ARCHITECTURE.md (30 Jul 2026)
 *
 * এই module-এর একটাই কাজ: "কে কী পারে" প্রশ্নের উত্তর **এক জায়গায়** রাখা।
 * আগে উত্তরটা তিন জায়গায় ছড়ানো ছিল — ৭৩টা @Roles, ৫টা ফাইলে হাতে লেখা if,
 * আর সাইডবারের ১১টা roles: array — আর কেউ মেলাত না।
 *
 * AccessService অন্য module-ও ব্যবহার করবে (§৭-এর ধাপ ২ ও ৩-এ পাহারা), তাই
 * export করা।
 */
@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [AdministrationController],
  providers: [
    RegistryService,
    AccessService,
    PeopleService,
    CompanyService,
    SystemService,
    IntegrationsService,
    AccessGuard,
    /*  §৭ ধাপ ২ — registered globally, and it BLOCKS NOTHING. It watches real
        traffic and writes down who it would have turned away, so the list can
        be emptied before anything is actually enforced. useExisting, not
        useClass: the controller reads the same instance's notes, and two
        instances would mean the screen reporting on an empty one.  */
    { provide: APP_GUARD, useExisting: AccessGuard },
  ],
  exports: [RegistryService, AccessService, AccessGuard, CompanyService, IntegrationsService],
})
export class AdministrationModule {}
