import { Module } from '@nestjs/common';
import { HrController } from './hr.controller';
import { EmployeesService } from './employees.service';
import { AttendanceService } from './attendance.service';
import { PayrollService } from './payroll.service';
import { HrDemoService } from './hr-demo.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { FinanceModule } from '../finance/finance.module';

/*  Employee / HR — Master Data.

    HR owns the person, the day sheet and the payroll run. It does NOT own the
    ledger: approving a run calls FinanceService.postEntry() with one balanced,
    completed event (HR-R16). One-way dependency, the same shape as Suppliers →
    Finance — Finance never imports HR.

    EmployeesService is exported so Finance's staff-advance screen can resolve a
    real Employee instead of a typed name (HR-D06). */
@Module({
  imports: [PrismaModule, CommonModule, FinanceModule],
  controllers: [HrController],
  providers: [EmployeesService, AttendanceService, PayrollService, HrDemoService],
  exports: [EmployeesService, AttendanceService, PayrollService],
})
export class HrModule {}
