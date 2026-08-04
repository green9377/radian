import { Module } from '@nestjs/common';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';

/*  SEO — what the search engines see, controlled from the panel.

    It owns SeoSetting and SeoRedirect. The meta fields themselves live on the
    Product, Category and Brand rows (SEO-D01) — this module writes to those
    columns and nothing else on them, which keeps one page's story in one row
    instead of scattered across a second table nobody remembers to join. */
@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [SeoController],
  providers: [SeoService],
  exports: [SeoService],
})
export class SeoModule {}
