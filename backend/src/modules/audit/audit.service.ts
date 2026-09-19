import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

export interface LogAuditParams {
  tenantId?: string;
  actorUserId?: string;
  actorTenantMemberId?: string;
  actionCode: string;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: LogAuditParams): Promise<void> {
    try {
      await this.prisma.rndtechnosoft_audit_logs.create({
        data: {
          id: randomUUID(),
          tenant_id: params.tenantId || null,
          actor_user_id: params.actorUserId || null,
          actor_tenant_member_id: params.actorTenantMemberId || null,
          action_code: params.actionCode,
          entity_type: params.entityType,
          entity_id: params.entityId || null,
          old_values: params.oldValues ? (params.oldValues as Prisma.InputJsonValue) : Prisma.DbNull,
          new_values: params.newValues ? (params.newValues as Prisma.InputJsonValue) : Prisma.DbNull,
          metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : Prisma.DbNull,
          ip_address: params.ipAddress || null,
          user_agent: params.userAgent || null,
        },
      });
    } catch (error) {
      // Audit log failures should not crash the main transaction unless required, but log alert
      this.logger.error(`Failed to write audit log for action: ${params.actionCode}`, error);
    }
  }
}
