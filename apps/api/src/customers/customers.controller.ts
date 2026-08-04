import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CustomerStatus } from '@prisma/client';
import { Roles } from '../auth/auth.guard';
import { CustomersService } from './customers.service';
import type {
  CreateCustomerDto,
  UpdateCustomerDto,
  ListCustomerQuery,
  RecipientInput,
  UpdateRecipientDto,
} from './customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly svc: CustomersService) {}

  @Get()
  list(@Query() q: ListCustomerQuery) {
    return this.svc.list(q);
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }
  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.svc.timeline(id);
  }
  @Post()
  create(@Body() dto: CreateCustomerDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.update(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Post(':id/block')
  block(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.setStatus(id, CustomerStatus.BLOCKED, actor ?? 'Admin');
  }
  @Post(':id/unblock')
  unblock(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.setStatus(id, CustomerStatus.ACTIVE, actor ?? 'Admin');
  }
  @Roles('OWNER', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
  @Post(':id/restore')
  restore(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.restore(id, actor ?? 'Admin');
  }

  /* recipient book (customer-owned) */
  @Post(':id/recipients')
  addRecipient(@Param('id') id: string, @Body() dto: RecipientInput, @Headers('x-actor-name') actor?: string) {
    return this.svc.addRecipient(id, dto, actor ?? 'Admin');
  }
  @Patch(':id/recipients/:rid')
  updateRecipient(
    @Param('id') id: string,
    @Param('rid') rid: string,
    @Body() dto: UpdateRecipientDto,
    @Headers('x-actor-name') actor?: string,
  ) {
    return this.svc.updateRecipient(id, rid, dto, actor ?? 'Admin');
  }
  @Delete(':id/recipients/:rid')
  removeRecipient(@Param('id') id: string, @Param('rid') rid: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.removeRecipient(id, rid, actor ?? 'Admin');
  }
}
