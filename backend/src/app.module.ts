import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { LeaveModule } from './modules/leave/leave.module';
import { SalaryModule } from './modules/salary/salary.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { BookkeepingModule } from './modules/bookkeeping/bookkeeping.module';
import { ExternalApiModule } from './modules/external-api/external-api.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { CrmModule } from './modules/crm/crm.module';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { TenantAuthGuard } from './common/guards/tenant-auth.guard';
import { ModuleAccessGuard } from './common/guards/module-access.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AccessModule } from './common/access/access.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { EmailModule } from './modules/email/email.module';
import { GmailModule } from './modules/gmail/gmail.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AccessModule,
    AuditModule,
    TenancyModule,
    EmailModule,
    GmailModule,
    TenantsModule,
    AuthModule,
    EmployeesModule,
    AttendanceModule,
    LeaveModule,
    SalaryModule,
    PayrollModule,
    BookkeepingModule,
    ExternalApiModule,
    SuperAdminModule,
    CrmModule,
    HealthModule,
  ],
  providers: [
    {
      // Registered globally so every route is authenticated by default and a
      // new controller has to opt out deliberately rather than by omission.
      provide: APP_GUARD,
      useClass: TenantAuthGuard,
    },
    // Global guards run in registration order: authenticate the session, then
    // check the member's role permissions, then that the workspace has the
    // modules owning those permissions switched on. Both checks read the tenant
    // TenantAuthGuard sets and do nothing on routes without @RequirePermissions.
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ModuleAccessGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecurityHeadersMiddleware, TenantContextMiddleware).forRoutes('*');
  }
}
