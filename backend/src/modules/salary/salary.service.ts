import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { DecimalMath } from '@/common/utils/decimal-math.util';
import { randomUUID } from 'crypto';

export interface CreateSalaryComponentInput {
  componentCode: string;
  componentName: string;
  componentCategory: 'EARNING' | 'DEDUCTION' | 'STATUTORY';
  calculationType: 'FIXED' | 'PERCENTAGE' | 'FORMULA' | 'SYSTEM_CALCULATED';
  isTaxable?: boolean;
  isRecurring?: boolean;
  isVariable?: boolean;
  displayOrder?: number;
}

export interface CreateSalaryStructureInput {
  structureCode: string;
  structureName: string;
  payFrequency?: string;
  effectiveFrom: string;
  components: {
    salaryComponentId: string;
    defaultAmount?: string | number;
    defaultPercentage?: string | number;
    percentageBaseComponentId?: string;
    isMandatory?: boolean;
    displayOrder?: number;
  }[];
}

export interface AssignSalaryInput {
  employeeId: string;
  salaryStructureId: string;
  annualCtc?: string | number;
  monthlyGrossTarget?: string | number;
  currencyCode?: string;
  effectiveFrom: string;
  changeReason?: string;
  componentValues?: {
    salaryComponentId: string;
    amount?: string | number;
    percentage?: string | number;
  }[];
}

@Injectable()
export class SalaryService {
  constructor(private readonly prisma: PrismaService) {}

  async listComponents(tenantId: string) {
    return this.prisma.rndtechnosoft_salary_components.findMany({
      where: { tenant_id: tenantId, component_status: 'ACTIVE' },
      orderBy: { display_order: 'asc' },
    });
  }

  async createComponent(tenantId: string, input: CreateSalaryComponentInput) {
    const existing = await this.prisma.rndtechnosoft_salary_components.findFirst({
      where: { tenant_id: tenantId, component_code: input.componentCode.toUpperCase() },
    });

    if (existing) {
      throw new ConflictException(`Salary component code '${input.componentCode}' already exists`);
    }

    return this.prisma.rndtechnosoft_salary_components.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        component_code: input.componentCode.toUpperCase(),
        component_name: input.componentName,
        component_category: input.componentCategory,
        calculation_type: input.calculationType,
        is_taxable: input.isTaxable ?? true,
        is_recurring: input.isRecurring ?? true,
        is_variable: input.isVariable ?? false,
        display_order: input.displayOrder || 100,
        component_status: 'ACTIVE',
      },
    });
  }

  async listStructures(tenantId: string) {
    return this.prisma.rndtechnosoft_salary_structures.findMany({
      where: { tenant_id: tenantId, structure_status: 'ACTIVE' },
      include: {
        rndtechnosoft_salary_structure_components: {
          include: {
            rndtechnosoft_salary_components_rndtechnosoft_salary_structure_components_tenant_id_salary_component_idTorndtechnosoft_salary_components: true,
          },
        },
      },
    });
  }

  async createStructure(tenantId: string, input: CreateSalaryStructureInput) {
    const existing = await this.prisma.rndtechnosoft_salary_structures.findFirst({
      where: { tenant_id: tenantId, salary_structure_code: input.structureCode.toUpperCase() },
    });

    if (existing) {
      throw new ConflictException(`Structure code '${input.structureCode}' already exists`);
    }

    const structureId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const structure = await tx.rndtechnosoft_salary_structures.create({
        data: {
          id: structureId,
          tenant_id: tenantId,
          salary_structure_code: input.structureCode.toUpperCase(),
          salary_structure_name: input.structureName,
          pay_frequency: input.payFrequency || 'MONTHLY',
          effective_from: new Date(input.effectiveFrom),
          structure_status: 'ACTIVE',
        },
      });

      for (const comp of input.components) {
        await tx.rndtechnosoft_salary_structure_components.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            salary_structure_id: structureId,
            salary_component_id: comp.salaryComponentId,
            default_amount: comp.defaultAmount !== undefined ? DecimalMath.toDecimal(comp.defaultAmount) : null,
            default_percentage: comp.defaultPercentage !== undefined ? DecimalMath.toDecimal(comp.defaultPercentage) : null,
            percentage_base_component_id: comp.percentageBaseComponentId || null,
            is_mandatory: comp.isMandatory ?? true,
            display_order: comp.displayOrder || 100,
          },
        });
      }

      return structure;
    });
  }

  async assignSalary(tenantId: string, input: AssignSalaryInput) {
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({
      where: { id: input.employeeId, tenant_id: tenantId },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found in tenant');
    }

    const structure = await this.prisma.rndtechnosoft_salary_structures.findFirst({
      where: { id: input.salaryStructureId, tenant_id: tenantId },
    });

    if (!structure) {
      throw new NotFoundException('Salary structure not found');
    }

    const effectiveFrom = new Date(input.effectiveFrom);
    const assignmentId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      // Close previous current assignment if one exists
      await tx.rndtechnosoft_employee_salary_assignments.updateMany({
        where: {
          tenant_id: tenantId,
          employee_id: input.employeeId,
          effective_to: null,
        },
        data: {
          effective_to: effectiveFrom,
        },
      });

      const assignment = await tx.rndtechnosoft_employee_salary_assignments.create({
        data: {
          id: assignmentId,
          tenant_id: tenantId,
          employee_id: input.employeeId,
          salary_structure_id: input.salaryStructureId,
          annual_ctc: input.annualCtc !== undefined ? DecimalMath.toDecimal(input.annualCtc) : null,
          monthly_gross_target: input.monthlyGrossTarget !== undefined ? DecimalMath.toDecimal(input.monthlyGrossTarget) : null,
          currency_code: input.currencyCode || 'INR',
          effective_from: effectiveFrom,
          assignment_status: 'ACTIVE',
          change_reason: input.changeReason || 'Initial structure assignment',
        },
      });

      if (input.componentValues && input.componentValues.length > 0) {
        for (const val of input.componentValues) {
          await tx.rndtechnosoft_employee_salary_component_values.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              employee_salary_assignment_id: assignmentId,
              salary_component_id: val.salaryComponentId,
              amount: val.amount !== undefined ? DecimalMath.toDecimal(val.amount) : null,
              percentage: val.percentage !== undefined ? DecimalMath.toDecimal(val.percentage) : null,
              effective_from: effectiveFrom,
            },
          });
        }
      }

      return assignment;
    });
  }

  async getEmployeeSalary(tenantId: string, employeeId: string) {
    return this.prisma.rndtechnosoft_employee_salary_assignments.findFirst({
      where: {
        tenant_id: tenantId,
        employee_id: employeeId,
        effective_to: null,
      },
      include: {
        rndtechnosoft_salary_structures: true,
        rndtechnosoft_employee_salary_component_values: {
          include: {
            rndtechnosoft_salary_components: true,
          },
        },
      },
    });
  }
}
