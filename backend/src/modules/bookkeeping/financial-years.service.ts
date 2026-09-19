import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { randomUUID } from 'crypto';
import { CreateFinancialYearDto } from './bookkeeping.types';

@Injectable()
export class FinancialYearsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the Indian Financial Year (April 1 to March 31) for any business date.
   * Auto-provisions the FY record for the tenant if it doesn't already exist.
   */
  async ensureFinancialYear(tenantId: string, refDate: Date | string = new Date()) {
    const targetDate = typeof refDate === 'string' ? new Date(refDate) : refDate;
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth(); // 0-indexed: 0 = Jan, 3 = April

    let startYear: number;
    let endYear: number;

    if (month >= 3) {
      // April to December: current year to next year
      startYear = year;
      endYear = year + 1;
    } else {
      // January to March: previous year to current year
      startYear = year - 1;
      endYear = year;
    }

    const startDate = new Date(Date.UTC(startYear, 3, 1)); // April 1
    const endDate = new Date(Date.UTC(endYear, 2, 31));   // March 31
    const fyCode = `FY-${startYear}-${String(endYear).slice(-2)}`;
    const fyName = `Financial Year ${startYear}-${endYear}`;
    const ayCode = `AY-${endYear}-${String(endYear + 1).slice(-2)}`;

    // Check if exists
    let fy = await this.prisma.rndtechnosoft_financial_years.findFirst({
      where: {
        tenant_id: tenantId,
        financial_year_code: fyCode,
      },
    });

    if (!fy) {
      // Deactivate current flag on other financial years
      await this.prisma.rndtechnosoft_financial_years.updateMany({
        where: { tenant_id: tenantId, is_current: true },
        data: { is_current: false },
      });

      fy = await this.prisma.rndtechnosoft_financial_years.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          financial_year_code: fyCode,
          financial_year_name: fyName,
          start_date: startDate,
          end_date: endDate,
          assessment_year: ayCode,
          is_current: true,
          is_closed: false,
          notes: 'Auto-provisioned financial year for payroll bookkeeping',
        },
      });
    }

    return fy;
  }

  async createFinancialYear(tenantId: string, dto: CreateFinancialYearDto) {
    const existing = await this.prisma.rndtechnosoft_financial_years.findFirst({
      where: {
        tenant_id: tenantId,
        financial_year_code: dto.financialYearCode,
      },
    });

    if (existing) {
      throw new BadRequestException(`Financial Year '${dto.financialYearCode}' already exists`);
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    return this.prisma.rndtechnosoft_financial_years.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        financial_year_code: dto.financialYearCode,
        financial_year_name: dto.financialYearName,
        start_date: startDate,
        end_date: endDate,
        assessment_year: dto.assessmentYear || null,
        is_current: false,
        is_closed: false,
        notes: dto.notes || null,
      },
    });
  }

  async listFinancialYears(tenantId: string) {
    return this.prisma.rndtechnosoft_financial_years.findMany({
      where: { tenant_id: tenantId },
      orderBy: { start_date: 'desc' },
      include: {
        _count: {
          select: {
            rndtechnosoft_payroll_periods: true,
            rndtechnosoft_bookkeeping_entries: true,
          },
        },
      },
    });
  }

  async getCurrentFinancialYear(tenantId: string) {
    let current = await this.prisma.rndtechnosoft_financial_years.findFirst({
      where: { tenant_id: tenantId, is_current: true },
    });

    if (!current) {
      current = await this.ensureFinancialYear(tenantId);
    }

    return current;
  }

  async getFinancialYearById(tenantId: string, id: string) {
    const fy = await this.prisma.rndtechnosoft_financial_years.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        _count: {
          select: {
            rndtechnosoft_payroll_periods: true,
            rndtechnosoft_bookkeeping_entries: true,
          },
        },
      },
    });

    if (!fy) {
      throw new NotFoundException('Financial Year not found');
    }

    return fy;
  }

  async closeFinancialYear(tenantId: string, id: string, memberId?: string) {
    const fy = await this.getFinancialYearById(tenantId, id);
    if (fy.is_closed) {
      throw new BadRequestException('Financial Year is already closed');
    }

    return this.prisma.rndtechnosoft_financial_years.update({
      where: { id },
      data: {
        is_closed: true,
        is_current: false,
        closed_at: new Date(),
        closed_by_tenant_member_id: memberId || null,
      },
    });
  }
}
