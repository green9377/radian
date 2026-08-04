import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { NeedsPin, Roles, type AuthedRequest } from '../auth/auth.guard';
import { EmployeesService, type ViewerRole } from './employees.service';
import { AttendanceService } from './attendance.service';
import { PayrollService } from './payroll.service';
import { HrDemoService } from './hr-demo.service';
import type {
  AttendanceSaveDto,
  DocumentWriteDto,
  EmployeeListQuery,
  EmployeeRoleDto,
  EmployeeWriteDto,
  PayrollApproveDto,
  PayrollBuildDto,
  PayrollPatchDto,
} from './hr.dto';

/*
  Employee / HR — HTTP surface. RADIAN_HR_MODULE_ARCHITECTURE.md (28 Jul 2026).

  ⚠️ ROUTE ORDER: every static path (`stats`, `payable`, `roles`, `demo`,
  `attendance`, `payroll`, `trash`) MUST sit above the `:id` routes — the same
  Nest trap as /purchases, /products and /suppliers.

  Access: what a person is paid is money, so the whole module is MANAGER and up
  (kickoff §4.6). Two extra narrowings on top:
    · the personal columns (NID, date of birth, address, next of kin) come back
      null for anyone who is not the OWNER — enforced in the service (HR-R10),
      not in the UI, so hiding the field is not the same as not sending it.
    · approving a payroll run moves real money and is OWNER + PIN.
  The actor name written to the audit trail and the ledger comes from the
  session (ActorInterceptor), never from a field anybody typed.
*/
@Controller('hr')
@Roles('OWNER', 'MANAGER')
export class HrController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly attendance: AttendanceService,
    private readonly payroll: PayrollService,
    private readonly demo: HrDemoService,
  ) {}

  private role(req: AuthedRequest): ViewerRole {
    return (req.actor?.role as ViewerRole) ?? 'MANAGER';
  }
  private actor(req: AuthedRequest): string {
    return req.actor?.name ?? 'Admin';
  }

  /* ---------------- employees ---------------- */

  @Get('employees')
  list(@Req() req: AuthedRequest, @Query() q: EmployeeListQuery) {
    return this.employees.list(q, this.role(req));
  }

  @Get('employees/stats')
  stats() {
    return this.employees.stats();
  }

  /** HR-D06 — the ONLY list Finance is allowed to pay from */
  @Get('employees/payable')
  payable() {
    return this.employees.payable();
  }

  /* ---------------- job roles (HR-D10) ---------------- */

  @Get('roles')
  roles() {
    return this.employees.listRoles();
  }

  @Post('roles')
  createRole(@Req() req: AuthedRequest, @Body() dto: EmployeeRoleDto) {
    return this.employees.createRole({ ...dto, actorName: this.actor(req) });
  }

  @Patch('roles/:id')
  updateRole(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: EmployeeRoleDto) {
    return this.employees.updateRole(id, { ...dto, actorName: this.actor(req) });
  }

  @Delete('roles/:id')
  removeRole(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.employees.removeRole(id, this.actor(req));
  }

  /* ---------------- practice data ---------------- */

  @Get('demo')
  demoStatus() {
    return this.demo.status();
  }

  @Roles('OWNER')
  @Post('demo/seed')
  demoSeed() {
    return this.demo.seed();
  }

  @Roles('OWNER')
  @Post('demo/clear')
  demoClear() {
    return this.demo.clear();
  }

  @Get('employees/trash')
  trash() {
    return this.employees.trash();
  }

  @Post('employees')
  create(@Req() req: AuthedRequest, @Body() dto: EmployeeWriteDto) {
    return this.employees.create({ ...dto, actorName: this.actor(req) });
  }

  @Get('employees/:id')
  get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.employees.get(id, this.role(req));
  }

  @Get('employees/:id/timeline')
  timeline(@Param('id') id: string) {
    return this.employees.timeline(id);
  }

  @Get('employees/:id/ledger')
  ledger(@Param('id') id: string) {
    return this.employees.ledger(id);
  }

  @Get('employees/:id/payslips')
  payslips(@Param('id') id: string) {
    return this.employees.payslips(id);
  }

  @Get('employees/:id/attendance')
  employeeMonth(@Param('id') id: string, @Query('period') period?: string) {
    return this.attendance.monthFor(id, period ?? new Date().toISOString().slice(0, 7));
  }

  /* ---------------- documents (HR-D11) ----------------
     OWNER only (HR-R26). A MANAGER cannot see the NID number, so handing them
     the scan of the same card would make that rule decorative. Enforced in the
     service, not by hiding the tab. */

  @Get('employees/:id/documents')
  documents(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.employees.listDocuments(id, this.role(req));
  }

  /** the file itself — asked for one at a time, never in the list */
  @Get('employees/:id/documents/:docId')
  document(@Req() req: AuthedRequest, @Param('id') id: string, @Param('docId') docId: string) {
    return this.employees.getDocument(id, docId, this.role(req));
  }

  @Post('employees/:id/documents')
  addDocument(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: DocumentWriteDto) {
    return this.employees.addDocument(id, { ...dto, actorName: this.actor(req) }, this.role(req));
  }

  @Delete('employees/:id/documents/:docId')
  removeDocument(@Req() req: AuthedRequest, @Param('id') id: string, @Param('docId') docId: string) {
    return this.employees.removeDocument(id, docId, this.actor(req), this.role(req));
  }

  @Patch('employees/:id')
  update(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: EmployeeWriteDto) {
    return this.employees.update(id, { ...dto, actorName: this.actor(req) });
  }

  @Delete('employees/:id')
  remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.employees.remove(id, this.actor(req));
  }

  @Post('employees/:id/restore')
  restore(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.employees.restore(id, this.actor(req));
  }

  /* ---------------- attendance (HR-D04) ---------------- */

  @Get('attendance')
  sheet(@Query('date') date?: string) {
    return this.attendance.sheet(date);
  }

  @Post('attendance')
  saveSheet(@Req() req: AuthedRequest, @Body() dto: AttendanceSaveDto) {
    return this.attendance.save({ ...dto, actorName: this.actor(req) });
  }

  /* ---------------- payroll ---------------- */

  @Get('payroll')
  listPayroll() {
    return this.payroll.list();
  }

  @Post('payroll')
  buildPayroll(@Req() req: AuthedRequest, @Body() dto: PayrollBuildDto) {
    return this.payroll.build({ ...dto, actorName: this.actor(req) });
  }

  @Get('payroll/:id')
  getPayroll(@Param('id') id: string) {
    return this.payroll.get(id);
  }

  @Patch('payroll/:id')
  patchPayroll(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: PayrollPatchDto) {
    return this.payroll.patch(id, { ...dto, actorName: this.actor(req) });
  }

  @Delete('payroll/:id/lines/:employeeId')
  removePayrollLine(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.payroll.removeLine(id, employeeId, this.actor(req));
  }

  @Delete('payroll/:id')
  removePayroll(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.payroll.remove(id, this.actor(req));
  }

  /** the money moment — owner only, PIN re-confirmed (kickoff §4.7) */
  @Roles('OWNER')
  @NeedsPin()
  @Post('payroll/:id/approve')
  approvePayroll(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: PayrollApproveDto) {
    return this.payroll.approve(id, { ...dto, actorName: this.actor(req) });
  }
}
