/* Employee / HR module DTOs — RADIAN_HR_MODULE_ARCHITECTURE.md (28 Jul 2026) */

export type PayTypeName = 'MONTHLY' | 'DAILY' | 'HOURLY';
export type EmployeeStatusName = 'ACTIVE' | 'INACTIVE';
export type AttendanceStatusName = 'PRESENT' | 'HALF_DAY' | 'LEAVE' | 'ABSENT';

export interface EmployeeListQuery {
  search?: string;
  status?: EmployeeStatusName | 'ALL';
  payType?: PayTypeName;
  roleId?: string;
}

/** HR-D10 — job roles are an admin-managed master, not free text */
export interface EmployeeRoleDto {
  name?: string;
  note?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  actorName?: string;
}

/** HR-D11 — one employee, many documents. Data URL, same as every image here. */
export interface DocumentWriteDto {
  title?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  dataUrl?: string;
  note?: string | null;
  actorName?: string;
}

export interface EmployeeWriteDto {
  name?: string;
  phone?: string | null;
  altPhone?: string | null;
  nid?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  photoUrl?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  roleId?: string | null;
  joinedOn?: string;
  leftOn?: string | null;
  status?: EmployeeStatusName;
  payType?: PayTypeName;
  ratePaisa?: number;
  /** HR-D12 — what a full day means for this person (8, 12, whatever) */
  dutyHoursPerDay?: number;
  /** HR-D13 — usual shift, "09:00" / "21:00". Empty = no fixed hours. */
  shiftStart?: string | null;
  shiftEnd?: string | null;
  /** HR-D01 — optional login account. null unlinks. */
  appUserId?: string | null;
  note?: string | null;
  actorName?: string;
}

/** one row of the day sheet (HR-D04) */
export interface AttendanceMarkDto {
  employeeId: string;
  status?: AttendanceStatusName;
  isPaidLeave?: boolean;
  /** HR-D13 — when they came in and left, "09:05" / "18:30" */
  inTime?: string | null;
  outTime?: string | null;
  /** whole minutes — 7.5 hours arrives as 450 (HOURLY staff only) */
  minutes?: number;
  note?: string | null;
}

export interface AttendanceSaveDto {
  /** yyyy-mm-dd */
  onDate?: string;
  rows?: AttendanceMarkDto[];
  actorName?: string;
}

export interface PayrollBuildDto {
  /** "2026-07" */
  period?: string;
  /** leave empty for the whole month; a festival batch can narrow it */
  periodStart?: string;
  periodEnd?: string;
  /** empty = every ACTIVE employee with a rate */
  employeeIds?: string[];
  note?: string | null;
  actorName?: string;
}

export interface PayrollLinePatch {
  employeeId: string;
  daysWorked?: number;
  absentDays?: number;
  minutesWorked?: number;
  basePaisa?: number;
  extraPaisa?: number;
  extraNote?: string | null;
  deductionPaisa?: number;
  deductionNote?: string | null;
  advanceRecoveredPaisa?: number;
}

export interface PayrollPatchDto {
  note?: string | null;
  lines?: PayrollLinePatch[];
  actorName?: string;
}

export interface PayrollApproveDto {
  /** money account the net pay leaves from */
  paidFromId?: string;
  paidOn?: string;
  actorName?: string;
}
