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
import { OrdersService } from './orders.service';
import { Roles } from '../auth/auth.guard';
import type {
  CreateOrderDto,
  EditOrderDto,
  AddPaymentDto,
  AddPhotoDto,
  AssignCourierDto,
  CancelOrderDto,
  ListOrderQuery,
} from './order.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly svc: OrdersService) {}

  @Get()
  list(@Query() q: ListOrderQuery) {
    return this.svc.list(q);
  }

  /*  ⚠️ DECLARED BEFORE `:id` OR IT NEVER RUNS. `/orders/cancel-rules` would
      otherwise be read as an order whose id is the word "cancel-rules" — the
      trap `product-detail.ts` warns about, one module over.  */
  @Get('cancel-rules')
  cancelRules() {
    return this.svc.getSalesSettings();
  }
  @Roles('OWNER', 'MANAGER')
  @Patch('cancel-rules')
  saveCancelRules(@Body() body: { beforeStartPct?: number; afterStartPct?: number }) {
    return this.svc.saveSalesSettings(body);
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
  create(@Body() dto: CreateOrderDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.create({ ...dto, actorName: dto.actorName ?? actor });
  }
  @Patch(':id')
  edit(@Param('id') id: string, @Body() dto: EditOrderDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.edit(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  /* status transitions */
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.confirm(id, actor ?? 'Admin');
  }
  @Post(':id/prepare')
  prepare(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.startPreparing(id, actor ?? 'Admin');
  }
  @Post(':id/out-for-delivery')
  out(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.outForDelivery(id, actor ?? 'Admin');
  }
  @Post(':id/delivered')
  delivered(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.delivered(id, actor ?? 'Admin');
  }
  @Post(':id/fail')
  fail(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.failDelivery(id, actor ?? 'Admin');
  }
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelOrderDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.cancel(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  /* payment + proof photo */
  @Post(':id/payments')
  addPayment(@Param('id') id: string, @Body() dto: AddPaymentDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.addPayment(id, { ...dto, actorName: dto.actorName ?? actor });
  }
  @Post(':id/courier')
  assignCourier(@Param('id') id: string, @Body() dto: AssignCourierDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.assignCourier(id, { ...dto, actorName: actor ?? dto.actorName });
  }

  @Post(':id/photos')
  addPhoto(@Param('id') id: string, @Body() dto: AddPhotoDto, @Headers('x-actor-name') actor?: string) {
    return this.svc.addPhoto(id, { ...dto, actorName: dto.actorName ?? actor });
  }

  @Roles('OWNER', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-actor-name') actor?: string) {
    return this.svc.remove(id, actor ?? 'Admin');
  }
}
