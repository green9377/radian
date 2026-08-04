import { DeliveryAnalyticsService } from './delivery-analytics.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { Roles } from '../auth/auth.guard';
import type {
  AreaWriteDto,
  TypeWriteDto,
  MethodWriteDto,
  SlotWriteDto,
  RiderWriteDto,
  CourierWriteDto,
  AssignDto,
  AssignmentActionDto,
} from './delivery.dto';

/* Static paths above any ':id' (project rule). */
@Controller('delivery')
export class DeliveryController {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly analytics: DeliveryAnalyticsService,
  ) {}

  /*  The real performance figures. `/delivery/performance` in the panel has
      been drawing an invented "94 % on-time" from a fixture file; this is what
      replaces it. Static path, so it sits above any `:id` route.  */
  @Get('performance')
  performance(@Query('days') days?: string) {
    const n = Number(days);
    const span = Number.isFinite(n) && n > 0 ? Math.min(n, 730) : 30;
    const to = new Date();
    const from = new Date(to.getTime() - span * 24 * 3600 * 1000);
    return this.analytics.analytics(from, to);
  }

  @Get('board')
  board() {
    return this.delivery.board();
  }

  @Get('config')
  config() {
    return this.delivery.config();
  }

  @Get('slot-load')
  slotLoad(@Query('date') date: string) {
    return this.delivery.slotLoad(date ?? '');
  }

  /* ---- riders ---- */
  @Get('riders')
  riders() {
    return this.delivery.riders();
  }

  @Roles('OWNER', 'MANAGER')
  @Post('riders')
  createRider(@Body() dto: RiderWriteDto) {
    return this.delivery.createRider(dto);
  }

  @Roles('OWNER', 'MANAGER')
  @Patch('riders/:id')
  updateRider(@Param('id') id: string, @Body() dto: RiderWriteDto) {
    return this.delivery.updateRider(id, dto);
  }

  @Roles('OWNER', 'MANAGER')
  @Delete('riders/:id')
  removeRider(@Param('id') id: string) {
    return this.delivery.removeRider(id);
  }

  /* ---- couriers ---- */
  @Get('couriers')
  couriers() {
    return this.delivery.couriers();
  }

  @Roles('OWNER', 'MANAGER')
  @Post('couriers')
  createCourier(@Body() dto: CourierWriteDto) {
    return this.delivery.createCourier(dto);
  }

  @Roles('OWNER', 'MANAGER')
  @Patch('couriers/:id')
  updateCourier(@Param('id') id: string, @Body() dto: CourierWriteDto) {
    return this.delivery.updateCourier(id, dto);
  }

  @Roles('OWNER', 'MANAGER')
  @Delete('couriers/:id')
  removeCourier(@Param('id') id: string) {
    return this.delivery.removeCourier(id);
  }

  /* ---- areas (DEC-DLV-007) ---- */
  @Get('areas')
  areas() {
    return this.delivery.areas();
  }

  @Roles('OWNER', 'MANAGER')
  @Post('areas')
  createArea(@Body() dto: AreaWriteDto) {
    return this.delivery.createArea(dto);
  }

  @Roles('OWNER', 'MANAGER')
  @Patch('areas/:id')
  updateArea(@Param('id') id: string, @Body() dto: AreaWriteDto) {
    return this.delivery.updateArea(id, dto);
  }

  @Roles('OWNER', 'MANAGER')
  @Delete('areas/:id')
  removeArea(@Param('id') id: string) {
    return this.delivery.removeArea(id);
  }

  /* ---- types: the NAMES (DEC-DLV-008) ---- */
  @Get('types')
  types() {
    return this.delivery.types();
  }

  @Roles('OWNER', 'MANAGER')
  @Post('types')
  createType(@Body() dto: TypeWriteDto) {
    return this.delivery.createType(dto);
  }

  @Roles('OWNER', 'MANAGER')
  @Patch('types/:id')
  updateType(@Param('id') id: string, @Body() dto: TypeWriteDto) {
    return this.delivery.updateType(id, dto);
  }

  @Roles('OWNER', 'MANAGER')
  @Delete('types/:id')
  removeType(@Param('id') id: string) {
    return this.delivery.removeType(id);
  }

  /* ---- methods & slots ---- */
  @Get('methods')
  methods() {
    return this.delivery.methods();
  }

  @Roles('OWNER', 'MANAGER')
  @Post('methods')
  createMethod(@Body() dto: MethodWriteDto) {
    return this.delivery.createMethod(dto);
  }

  @Roles('OWNER', 'MANAGER')
  @Patch('methods/:id')
  updateMethod(@Param('id') id: string, @Body() dto: MethodWriteDto) {
    return this.delivery.updateMethod(id, dto);
  }

  @Roles('OWNER', 'MANAGER')
  @Delete('methods/:id')
  removeMethod(@Param('id') id: string) {
    return this.delivery.removeMethod(id);
  }

  @Roles('OWNER', 'MANAGER')
  @Post('methods/:id/slots')
  addSlot(@Param('id') id: string, @Body() dto: SlotWriteDto) {
    return this.delivery.addSlot(id, dto);
  }

  @Roles('OWNER', 'MANAGER')
  @Patch('slots/:slotId')
  updateSlot(@Param('slotId') slotId: string, @Body() dto: SlotWriteDto) {
    return this.delivery.updateSlot(slotId, dto);
  }

  @Roles('OWNER', 'MANAGER')
  @Delete('slots/:slotId')
  removeSlot(@Param('slotId') slotId: string) {
    return this.delivery.removeSlot(slotId);
  }

  /* ---- assignments ---- */
  @Post('assignments')
  assign(@Body() dto: AssignDto) {
    return this.delivery.assign(dto);
  }

  @Post('assignments/:id/out')
  out(@Param('id') id: string, @Body() dto: AssignmentActionDto) {
    return this.delivery.assignmentAction(id, 'out', dto ?? {});
  }

  @Post('assignments/:id/delivered')
  delivered(@Param('id') id: string, @Body() dto: AssignmentActionDto) {
    return this.delivery.assignmentAction(id, 'delivered', dto ?? {});
  }

  @Post('assignments/:id/fail')
  fail(@Param('id') id: string, @Body() dto: AssignmentActionDto) {
    return this.delivery.assignmentAction(id, 'fail', dto ?? {});
  }

  @Post('assignments/:id/cancel')
  cancel(@Param('id') id: string, @Body() dto: AssignmentActionDto) {
    return this.delivery.assignmentAction(id, 'cancel', dto ?? {});
  }

  @Get('orders/:orderId/assignments')
  orderAssignments(@Param('orderId') orderId: string) {
    return this.delivery.orderAssignments(orderId);
  }
}
