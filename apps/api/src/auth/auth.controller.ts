import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { AuthService, type LoginDto, type SetupDto, type UserWriteDto } from './auth.service';
import { Public, type AuthedRequest } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /* ---- open to everyone: the door itself ---- */

  @Public()
  @Get('status')
  status() {
    return this.auth.status();
  }

  @Public()
  @Post('setup')
  setup(@Body() dto: SetupDto) {
    return this.auth.setup(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('logout')
  logout(@Headers('x-radian-token') token?: string) {
    return this.auth.logout(token);
  }

  /* ---- signed in ---- */

  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.auth.me(req.actor!.id);
  }

  /*  Anyone may change their OWN password and PIN — and must be able to, since
      the owner hands out the first one. Proving the current password first
      stops a walk-up at an unlocked screen from silently taking the account. */
  @Patch('me')
  changeOwn(
    @Req() req: AuthedRequest,
    @Body() dto: { currentPassword?: string; password?: string; pin?: string },
  ) {
    return this.auth.changeOwn(req.actor!.id, dto);
  }

  /** used by the PIN box before a money action, so the screen can warn early */
  @Post('verify-pin')
  async verifyPin(@Req() req: AuthedRequest, @Body() dto: { pin?: string }) {
    const ok = await this.auth.checkPin(req.actor!.id, dto.pin);
    return { ok };
  }

  /* ---- users (owner only) ---- */

  private ownerOnly(req: AuthedRequest) {
    if (req.actor?.role !== 'OWNER')
      throw new ForbiddenException('Only an owner can manage who has access');
  }

  @Get('users')
  users(@Req() req: AuthedRequest) {
    this.ownerOnly(req);
    return this.auth.users();
  }

  @Post('users')
  createUser(@Req() req: AuthedRequest, @Body() dto: UserWriteDto) {
    this.ownerOnly(req);
    return this.auth.createUser(dto);
  }

  @Patch('users/:id')
  updateUser(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: UserWriteDto) {
    this.ownerOnly(req);
    return this.auth.updateUser(id, dto);
  }

  @Delete('users/:id')
  removeUser(@Req() req: AuthedRequest, @Param('id') id: string) {
    this.ownerOnly(req);
    return this.auth.removeUser(id);
  }
}
