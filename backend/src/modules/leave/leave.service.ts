import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { DecimalMath } from '@/common/utils/decimal-math.util';
import { randomUUID } from 'crypto';

export interface CreateLeaveTypeInput {
  code: string;
  name: string;
  isPaid?: boolean;
  allowsHalfDay?: boolean;
}

export interface SubmitLeaveRequestInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  requestedDays: number | string;
  reason?: string;
}

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

  async listLeaveTypes(tenantId: string) {
    return this.prisma.rndtechnosoft_leave_types.findMany({
      where: { tenant_id: tenantId, leave_type_status: 'ACTIVE' },
      orderBy: { leave_type_code: 'asc' },
    });
  }

  async createLeaveType(tenantId: string, input: CreateLeaveTypeInput) {
    return this.prisma.rndtechnosoft_leave_types.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        leave_type_code: input.code.toUpperCase(),
        leave_type_name: input.name,
        is_paid: input.isPaid ?? true,
        allows_half_day: input.allowsHalfDay ?? true,
        leave_type_status: 'ACTIVE',
      },
    });
  }

  async submitLeaveRequest(tenantId: string, input: SubmitLeaveRequestInput) {
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({
      where: { id: input.employeeId, tenant_id: tenantId },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const leaveType = await this.prisma.rndtechnosoft_leave_types.findFirst({
      where: { id: input.leaveTypeId, tenant_id: tenantId },
    });

    if (!leaveType) {
      throw new NotFoundException('Leave type not found');
    }

    const daysDecimal = DecimalMath.toDecimal(input.requestedDays);
    if (daysDecimal.isZero() || daysDecimal.isNegative()) {
      throw new BadRequestException('Requested leave days must be positive');
    }

    const requestNumber = `LV-${Date.now().toString().slice(-6)}`;
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    if (endDate < startDate) {
      throw new BadRequestException('End date cannot be earlier than start date');
    }

    const requestId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.rndtechnosoft_leave_requests.create({
        data: {
          id: requestId,
          tenant_id: tenantId,
          employee_id: input.employeeId,
          leave_type_id: input.leaveTypeId,
          request_number: requestNumber,
          start_date: startDate,
          end_date: endDate,
          requested_days: daysDecimal,
          reason: input.reason || null,
          request_status: 'PENDING',
          submitted_at: new Date(),
        },
      });

      return request;
    });
  }

  async approveLeaveRequest(tenantId: string, requestId: string, approverTenantMemberId: string) {
    const request = await this.prisma.rndtechnosoft_leave_requests.findFirst({
      where: { id: requestId, tenant_id: tenantId },
    });

    if (!request) {
      throw new NotFoundException('Leave request not found');
    }

    if (request.request_status !== 'PENDING') {
      throw new BadRequestException(`Cannot approve request with status '${request.request_status}'`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.rndtechnosoft_leave_requests.update({
        // Composite [tenant_id, id] key: the database refuses a write against
        // another tenant's record even if the id is guessed.
        where: { tenant_id_id: { tenant_id: tenantId, id: requestId } },
        data: {
          request_status: 'APPROVED',
          final_decision_at: new Date(),
        },
      });

      // Write deduction ledger entry to leave_balance_transactions
      await tx.rndtechnosoft_leave_balance_transactions.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          employee_id: request.employee_id,
          leave_type_id: request.leave_type_id,
          transaction_date: new Date(),
          transaction_type: 'USAGE',
          quantity_days: DecimalMath.mul(request.requested_days, -1), // negative for debit
          reference_type: 'LEAVE_REQUEST',
          reference_id: request.id,
          description: `Leave request ${request.request_number} approved`,
        },
      });

      return updated;
    });
  }

  async getLeaveBalances(tenantId: string, employeeId: string) {
    return this.prisma.rndtechnosoft_leave_balance_summaries.findMany({
      where: { tenant_id: tenantId, employee_id: employeeId },
      include: {
        rndtechnosoft_leave_types: true,
      },
    });
  }
}
