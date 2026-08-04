import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { LinkPlacement } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/*
  ═══════════════════════════════════════════════════════════════════════════
  Footer & the "More" panel — link columns, social profiles, payment badges.

  ONE TABLE FOR BOTH PLACEMENTS. The footer columns and the slide-out panel are
  the same thing seen twice: a titled list of places to go, several of whose
  entries appear in both. Kept apart, "Refund Policy" gets a new address in one
  and keeps the old one in the other, and nobody notices until a customer does.
  ═══════════════════════════════════════════════════════════════════════════
*/

@Injectable()
export class FooterService {
  constructor(private readonly prisma: PrismaService) {}

  groups(placement?: string) {
    return this.prisma.db.linkGroup.findMany({
      where: placement ? { placement: placement as LinkPlacement } : {},
      orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }],
      include: { links: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  createGroup(dto: { placement: LinkPlacement; title?: string; sortOrder?: number }) {
    return this.prisma.db.linkGroup.create({
      data: { placement: dto.placement, title: dto.title?.trim() || 'New column', sortOrder: dto.sortOrder ?? 0 },
    });
  }
  updateGroup(id: string, dto: { title?: string; sortOrder?: number; isActive?: boolean }) {
    return this.prisma.db.linkGroup.update({
      where: { id },
      data: { title: dto.title?.trim(), sortOrder: dto.sortOrder, isActive: dto.isActive },
    });
  }
  /** the links go with it — `onDelete: Cascade`, not an orphan list nobody sees */
  async removeGroup(id: string) {
    await this.prisma.db.linkGroup.delete({ where: { id } });
    return { ok: true };
  }

  createLink(dto: { groupId: string; label?: string; href?: string; sortOrder?: number }) {
    return this.prisma.db.navLink.create({
      data: {
        groupId: dto.groupId,
        label: dto.label?.trim() || 'New link',
        href: dto.href?.trim() || '/',
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }
  updateLink(id: string, dto: { label?: string; href?: string; sortOrder?: number; isActive?: boolean }) {
    return this.prisma.db.navLink.update({
      where: { id },
      data: { label: dto.label?.trim(), href: dto.href?.trim(), sortOrder: dto.sortOrder, isActive: dto.isActive },
    });
  }
  async removeLink(id: string) {
    await this.prisma.db.navLink.delete({ where: { id } });
    return { ok: true };
  }

  socials() {
    return this.prisma.db.socialLink.findMany({ orderBy: { sortOrder: 'asc' } });
  }
  createSocial(dto: { icon?: string; label?: string; url?: string; sortOrder?: number }) {
    return this.prisma.db.socialLink.create({
      data: {
        icon: dto.icon || 'globe',
        label: dto.label?.trim() || 'New profile',
        url: dto.url?.trim() || '',
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }
  updateSocial(id: string, dto: { icon?: string; label?: string; url?: string; sortOrder?: number; isActive?: boolean }) {
    return this.prisma.db.socialLink.update({
      where: { id },
      data: { icon: dto.icon, label: dto.label?.trim(), url: dto.url?.trim(), sortOrder: dto.sortOrder, isActive: dto.isActive },
    });
  }
  async removeSocial(id: string) {
    await this.prisma.db.socialLink.delete({ where: { id } });
    return { ok: true };
  }

  badges() {
    return this.prisma.db.paymentBadge.findMany({ orderBy: { sortOrder: 'asc' } });
  }
  createBadge(dto: { label?: string; imageUrl?: string | null; sortOrder?: number }) {
    return this.prisma.db.paymentBadge.create({
      data: { label: dto.label?.trim() || 'New method', imageUrl: dto.imageUrl || null, sortOrder: dto.sortOrder ?? 0 },
    });
  }
  updateBadge(id: string, dto: { label?: string; imageUrl?: string | null; sortOrder?: number; isActive?: boolean }) {
    return this.prisma.db.paymentBadge.update({
      where: { id },
      data: {
        label: dto.label?.trim(),
        imageUrl: dto.imageUrl === undefined ? undefined : dto.imageUrl || null,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
  }
  async removeBadge(id: string) {
    await this.prisma.db.paymentBadge.delete({ where: { id } });
    return { ok: true };
  }

  settings() {
    return this.prisma.db.storefrontSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });
  }
  saveSettings(dto: { footerTagline?: string; footerLegal?: string }) {
    const data = {
      footerTagline: dto.footerTagline === undefined ? undefined : dto.footerTagline.trim() || null,
      footerLegal: dto.footerLegal === undefined ? undefined : dto.footerLegal.trim() || null,
    };
    return this.prisma.db.storefrontSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...data },
      update: data,
    });
  }
}

@Controller('footer')
export class FooterController {
  constructor(private readonly svc: FooterService) {}

  @Get('groups') groups() { return this.svc.groups(); }
  @Post('groups') createGroup(@Body() dto: { placement: LinkPlacement; title?: string; sortOrder?: number }) { return this.svc.createGroup(dto); }
  @Patch('groups/:id') updateGroup(@Param('id') id: string, @Body() dto: { title?: string; sortOrder?: number; isActive?: boolean }) { return this.svc.updateGroup(id, dto); }
  @Delete('groups/:id') removeGroup(@Param('id') id: string) { return this.svc.removeGroup(id); }

  @Post('links') createLink(@Body() dto: { groupId: string; label?: string; href?: string; sortOrder?: number }) { return this.svc.createLink(dto); }
  @Patch('links/:id') updateLink(@Param('id') id: string, @Body() dto: { label?: string; href?: string; sortOrder?: number; isActive?: boolean }) { return this.svc.updateLink(id, dto); }
  @Delete('links/:id') removeLink(@Param('id') id: string) { return this.svc.removeLink(id); }

  @Get('socials') socials() { return this.svc.socials(); }
  @Post('socials') createSocial(@Body() dto: { icon?: string; label?: string; url?: string; sortOrder?: number }) { return this.svc.createSocial(dto); }
  @Patch('socials/:id') updateSocial(@Param('id') id: string, @Body() dto: { icon?: string; label?: string; url?: string; sortOrder?: number; isActive?: boolean }) { return this.svc.updateSocial(id, dto); }
  @Delete('socials/:id') removeSocial(@Param('id') id: string) { return this.svc.removeSocial(id); }

  @Get('badges') badges() { return this.svc.badges(); }
  @Post('badges') createBadge(@Body() dto: { label?: string; imageUrl?: string | null; sortOrder?: number }) { return this.svc.createBadge(dto); }
  @Patch('badges/:id') updateBadge(@Param('id') id: string, @Body() dto: { label?: string; imageUrl?: string | null; sortOrder?: number; isActive?: boolean }) { return this.svc.updateBadge(id, dto); }
  @Delete('badges/:id') removeBadge(@Param('id') id: string) { return this.svc.removeBadge(id); }

  @Get('settings') settings() { return this.svc.settings(); }
  @Patch('settings') saveSettings(@Body() dto: { footerTagline?: string; footerLegal?: string }) { return this.svc.saveSettings(dto); }
}

@Module({
  providers: [FooterService],
  controllers: [FooterController],
  exports: [FooterService],
})
export class FooterModule {}
