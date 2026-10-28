import 'reflect-metadata';
import { APP_GUARD } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { TenantAuthGuard } from '@/common/guards/tenant-auth.guard';
import { ModuleAccessGuard } from '@/common/guards/module-access.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { IS_PUBLIC_ROUTE, SKIPS_TENANT_AUTH } from '@/common/decorators/auth.decorators';
import { REQUIRED_PERMISSIONS } from '@/common/decorators/access.decorators';
import { MODULES, NAVIGATION, PERMISSIONS, PERMISSION_KEYS, permissionModule } from '@/common/access/access-catalog';

import { AttendanceController } from '@/modules/attendance/attendance.controller';
import { AuthController } from '@/modules/auth/auth.controller';
import { BookkeepingController } from '@/modules/bookkeeping/bookkeeping.controller';
import { CrmController } from '@/modules/crm/crm.controller';
import { EmployeesController } from '@/modules/employees/employees.controller';
import { ExternalApiController } from '@/modules/external-api/external-api.controller';
import { HealthController } from '@/modules/health/health.controller';
import { GmailController } from '@/modules/gmail/gmail.controller';
import { LeaveController } from '@/modules/leave/leave.controller';
import { PayrollController } from '@/modules/payroll/payroll.controller';
import { SalaryController } from '@/modules/salary/salary.controller';
import { SuperAdminController } from '@/modules/super-admin/super-admin.controller';
import { TenantsController } from '@/modules/tenants/tenants.controller';
import { UsersController } from '@/modules/tenants/users.controller';
import { PermissionsController } from '@/modules/tenants/permissions.controller';
import { OnboardingController } from '@/modules/onboarding/onboarding.controller';
import { PublicOffersController } from '@/modules/onboarding/public-offers.controller';
import { PublicCandidateDocumentsController } from '@/modules/onboarding/public-candidate-documents.controller';
import { MailAccountsController } from '@/modules/mail/mail-accounts.controller';
import { EmailSequencesController } from '@/modules/email-sequences/email-sequences.controller';
import { PublicUnsubscribeController } from '@/modules/email-sequences/public-unsubscribe.controller';
import { PayrollPoliciesController } from '@/modules/payroll/policies/payroll-policies.controller';
import { PayrollAdjustmentsController } from '@/modules/payroll/payroll-adjustments.controller';
import { PerformanceLibraryController } from '@/modules/performance/performance-library.controller';
import { PerformanceTemplatesController } from '@/modules/performance/performance-templates.controller';
import { PerformanceWorkflowsController } from '@/modules/performance/performance-workflows.controller';
import { EmployeeRelationsController } from '@/modules/employees/employee-relations.controller';
import { PerformanceCyclesController } from '@/modules/performance/performance-cycles.controller';
import { PerformanceMyController } from '@/modules/performance/performance-my.controller';
import { DocumentsController } from '@/modules/documents/documents.controller';
import { OffboardingController } from '@/modules/offboarding/offboarding.controller';

const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';

/**
 * Structural guarantee that tenant routes cannot be created unprotected.
 *
 * Authentication is registered as a global guard, so a new controller is
 * protected by default. The risk is the reverse: a route opting out. These
 * tests pin the exact set of exemptions so widening it has to be deliberate.
 */

type ControllerClass = new (...args: never[]) => unknown;

const TENANT_CONTROLLERS: [string, ControllerClass][] = [
  ['AttendanceController', AttendanceController],
  ['AuthController', AuthController],
  ['BookkeepingController', BookkeepingController],
  ['CrmController', CrmController],
  ['EmployeesController', EmployeesController],
  ['ExternalApiController', ExternalApiController],
  ['HealthController', HealthController],
  ['GmailController', GmailController],
  ['LeaveController', LeaveController],
  ['PayrollController', PayrollController],
  ['SalaryController', SalaryController],
  ['TenantsController', TenantsController],
  ['UsersController', UsersController],
  ['PermissionsController', PermissionsController],
  ['OnboardingController', OnboardingController],
  ['PublicOffersController', PublicOffersController],
  ['PublicCandidateDocumentsController', PublicCandidateDocumentsController],
  ['MailAccountsController', MailAccountsController],
  ['EmailSequencesController', EmailSequencesController],
  ['PublicUnsubscribeController', PublicUnsubscribeController],
  ['PayrollPoliciesController', PayrollPoliciesController],
  ['PayrollAdjustmentsController', PayrollAdjustmentsController],
  ['PerformanceLibraryController', PerformanceLibraryController],
  ['PerformanceTemplatesController', PerformanceTemplatesController],
  ['PerformanceWorkflowsController', PerformanceWorkflowsController],
  ['EmployeeRelationsController', EmployeeRelationsController],
  ['PerformanceCyclesController', PerformanceCyclesController],
  ['PerformanceMyController', PerformanceMyController],
  ['DocumentsController', DocumentsController],
  ['OffboardingController', OffboardingController],
];

/**
 * Routes reachable without a session, with the reason each one is safe.
 * Anything returning tenant data must never appear here.
 */
const EXPECTED_PUBLIC_ROUTES = [
  'AuthController.register', // creates a global user, returns only that user
  'AuthController.registerTenant', // creates a workspace and signs in
  'AuthController.login', // issues the session
  'AuthController.getHost', // the base domain and the name of the workspace whose address this is
  'AuthController.subdomainAvailability', // whether a workspace address is free, for the sign-up form
  'HealthController.check', // liveness probe, no tenant data
  'GmailController.callback', // validates one-time OAuth state before storing the connection
  // A candidate's offer link: authorized by the 256-bit token emailed to them (stored only as a hash),
  // showing and answering only that one offer, only on its workspace's address and while HRMS is on.
  'PublicOffersController.view',
  'PublicOffersController.pdf',
  // A sequence email's unsubscribe link: authorized by that email's 256-bit token (stored only as a hash),
  // answering only on its workspace's address. GET shows a masked address and changes nothing; POST only unsubscribes.
  'PublicUnsubscribeController.view',
  'PublicUnsubscribeController.unsubscribe',
  'PublicOffersController.accept',
  'PublicOffersController.decline',
  // A candidate's document upload link: the same kind of emailed token, expiring after 30 days and replaced by
  // any newer link. It lists and takes uploads for that one candidate's requested documents, never returns a file.
  'PublicCandidateDocumentsController.view',
  'PublicCandidateDocumentsController.upload',
].sort();

function routesOf(name: string, controller: ControllerClass) {
  const prototype = controller.prototype as unknown as Record<string, unknown>;

  return Object.getOwnPropertyNames(prototype)
    .filter((method) => method !== 'constructor')
    .map((method) => ({ method, handler: prototype[method] }))
    .filter(
      (entry): entry is { method: string; handler: (...args: unknown[]) => unknown } =>
        typeof entry.handler === 'function' && Reflect.hasMetadata(PATH_METADATA, entry.handler),
    )
    .map(({ method, handler }) => ({
      name: `${name}.${method}`,
      handler,
      httpMethod: Reflect.getMetadata(METHOD_METADATA, handler) as number,
    }));
}

const allTenantRoutes = TENANT_CONTROLLERS.flatMap(([name, controller]) =>
  routesOf(name, controller),
);

describe('Tenant route guard coverage', () => {
  it('finds the tenant routes', () => {
    // A collapse here would make every other assertion vacuous.
    expect(allTenantRoutes.length).toBeGreaterThan(80);
  });

  it('registers the global guards in dependency order', () => {
    const providers = Reflect.getMetadata('providers', AppModule) ?? [];
    const globalGuards = providers
      .filter(
        (provider: { provide?: unknown; useClass?: unknown }) =>
          provider && provider.provide === APP_GUARD,
      )
      .map((provider: { useClass?: unknown }) => provider.useClass);

    // Authenticate, then check role permissions, then the workspace module
    // switch. Both checks read the session tenant TenantAuthGuard sets.
    expect(globalGuards).toEqual([TenantAuthGuard, PermissionsGuard, ModuleAccessGuard]);
  });

  it('requires a permission on every tenant route except self-service ones', () => {
    // Routes any signed-in member may call, with the reason each one is safe.
    const OPEN_TO_MEMBERS = [
      'AuthController.logout', // ends the caller's own session
      'AuthController.getMe', // the caller's own identity and access
      'AuthController.switchTenant', // re-checks membership before issuing a session
      'AuthController.changePassword', // the caller's own password
      'AuthController.revokeOtherSessions', // the caller's own sessions
      'TenantsController.getCurrent', // the name and code of the caller's workspace
      'TenantsController.sendWhatsApp', // refuses every request (not built yet)
      'TenantsController.sendEmail', // refuses every request (not built yet)
      // The caller's own mail account in the session's workspace; none takes a member or user id.
      'MailAccountsController.mine',
      'MailAccountsController.saveMine',
      'MailAccountsController.disconnectMine',
      'MailAccountsController.testSmtp', // rate-limited per member
      'MailAccountsController.testImap', // rate-limited per member
      'MailAccountsController.testEmail', // rate-limited per member; sends only through the caller's own account
    ];

    const unguarded = allTenantRoutes
      .filter((route) => Reflect.getMetadata(IS_PUBLIC_ROUTE, route.handler) !== true)
      .filter((route) => !OPEN_TO_MEMBERS.includes(route.name))
      .filter((route) => (Reflect.getMetadata(REQUIRED_PERMISSIONS, route.handler) ?? []).length === 0)
      .map((route) => route.name);

    expect(unguarded).toEqual([]);
  });

  it('only requires permissions that exist in the catalog', () => {
    const unknown = allTenantRoutes
      .flatMap((route) => (Reflect.getMetadata(REQUIRED_PERMISSIONS, route.handler) ?? []) as string[])
      .filter((key) => !(PERMISSION_KEYS as readonly string[]).includes(key));

    expect(unknown).toEqual([]);
  });

  it('enforces every catalog permission somewhere', () => {
    const onRoutes = new Set(
      allTenantRoutes.flatMap((route) => (Reflect.getMetadata(REQUIRED_PERMISSIONS, route.handler) ?? []) as string[]),
    );
    // Checked inside a handler because the action decides which permission applies.
    // sequences.logs.view: the sending log leaves out email bodies without it.
    const CHECKED_IN_HANDLER = ['outreach.create', 'outreach.update', 'leads.delete', 'leads.view_all', 'people.bank.update', 'sequences.logs.view'];
    // Pages whose data is computed in the browser or is sample data; the
    // permission decides only whether the sidebar shows them.
    const PAGE_ONLY = ['dashboard.view', 'marketing.view', 'analytics.view', 'payslips.view', 'reports.view', 'compliance.view', 'help.view'];

    const unenforced = PERMISSION_KEYS.filter(
      (key) => !onRoutes.has(key) && !CHECKED_IN_HANDLER.includes(key) && !PAGE_ONLY.includes(key),
    );
    expect(unenforced).toEqual([]);
    for (const key of PAGE_ONLY) {
      expect([key, PERMISSIONS.find((p) => p.key === key)?.nav]).toEqual([key, expect.any(String)]);
    }
  });

  it('keeps the permission catalog and the sidebar consistent', () => {
    const navIds = NAVIGATION.map((item) => item.id as string);
    const topLevel = NAVIGATION.filter((item) => item.parent === null).map((item) => item.id as string);
    const byId = new Map<string, (typeof NAVIGATION)[number]>(NAVIGATION.map((item) => [item.id, item]));
    const parents = new Set<string>(NAVIGATION.flatMap((item) => (item.parent ? [item.parent] : [])));

    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
    // Every permission names a real sidebar item (or none) and a real section.
    expect(PERMISSIONS.filter((p) => p.nav !== null && !navIds.includes(p.nav)).map((p) => p.key)).toEqual([]);
    expect(PERMISSIONS.filter((p) => !topLevel.includes(p.section)).map((p) => p.key)).toEqual([]);
    // Every sidebar item without children can be granted by some permission.
    const leaves = navIds.filter((id) => !parents.has(id));
    expect(leaves.filter((id) => !PERMISSIONS.some((p) => p.nav === id))).toEqual([]);
    // A business module is one top-level group named after it, and every item
    // in the group belongs to it, so switching the module off hides the group.
    for (const module of MODULES) {
      const groups = NAVIGATION.filter((item) => item.parent === null && item.module === module.code && parents.has(item.id));
      expect([module.code, groups.map((group) => group.label)]).toEqual([module.code, [module.name]]);
    }
    expect(NAVIGATION.filter((item) => item.parent && byId.get(item.parent)?.module !== item.module).map((item) => item.id)).toEqual([]);
    // A permission only reveals screens of the module that owns it.
    expect(
      PERMISSIONS.filter((p) => p.nav !== null && byId.get(p.nav)?.module !== permissionModule(p.key)).map((p) => p.key),
    ).toEqual([]);
  });

  it('puts every product area behind its business module switch, as the catalog says', () => {
    // ModuleAccessGuard refuses a route while a module owning one of its
    // permissions is off, so a controller's module comes only from the catalog.
    const modulesOf = (name: string, controller: ControllerClass) => [
      ...new Set(
        routesOf(name, controller).flatMap((route) =>
          ((Reflect.getMetadata(REQUIRED_PERMISSIONS, route.handler) ?? []) as string[]).map(permissionModule),
        ),
      ),
    ];

    expect(TENANT_CONTROLLERS.map(([name, controller]) => [name, modulesOf(name, controller)])).toEqual([
      ['AttendanceController', ['HRMS']],
      ['AuthController', [null]], // adding a member needs users.create, in no module
      ['BookkeepingController', ['FINANCE']],
      ['CrmController', ['CRM']],
      ['EmployeesController', ['HRMS']],
      ['ExternalApiController', ['HRMS']],
      ['HealthController', []],
      ['GmailController', ['CRM']],
      ['LeaveController', ['HRMS']],
      ['PayrollController', ['FINANCE']],
      ['SalaryController', ['FINANCE']],
      // Workspace administration stays reachable whatever modules are off.
      ['TenantsController', [null]],
      ['UsersController', [null]],
      ['PermissionsController', [null]],
      ['OnboardingController', ['HRMS']],
      // Public token routes carry no permission; the service refuses them while HRMS is off.
      ['PublicOffersController', []],
      ['PublicCandidateDocumentsController', []],
      // Mail accounts belong to the workspace, not to a business module.
      ['MailAccountsController', [null]],
      ['EmailSequencesController', ['CRM']],
      ['PublicUnsubscribeController', []],
      ['PayrollPoliciesController', ['FINANCE']],
      ['PayrollAdjustmentsController', ['FINANCE']],
      ['PerformanceLibraryController', ['HRMS']],
      ['PerformanceTemplatesController', ['HRMS']],
      ['PerformanceWorkflowsController', ['HRMS']],
      ['EmployeeRelationsController', ['HRMS']],
      ['PerformanceCyclesController', ['HRMS']],
      ['PerformanceMyController', ['HRMS']],
      // Document templates and letterheads belong to the organization, shared by HRMS and CRM.
      ['DocumentsController', [null]],
      ['OffboardingController', ['HRMS']],
    ]);
  });

  it('exempts exactly the expected routes from authentication', () => {
    const publicRoutes = allTenantRoutes
      .filter((route) => Reflect.getMetadata(IS_PUBLIC_ROUTE, route.handler) === true)
      .map((route) => route.name)
      .sort();

    // Adding a route here exposes it to the internet. Change deliberately.
    expect(publicRoutes).toEqual(EXPECTED_PUBLIC_ROUTES);
  });

  it('marks no tenant controller as skipping tenant authentication', () => {
    const skipping = TENANT_CONTROLLERS.filter(
      ([, controller]) => Reflect.getMetadata(SKIPS_TENANT_AUTH, controller) === true,
    ).map(([name]) => name);

    expect(skipping).toEqual([]);
  });

  it('marks the platform controller as using its own scheme', () => {
    // The platform control plane is guarded by SuperAdminAuthGuard instead,
    // which super-admin-guard-coverage.spec.ts verifies.
    expect(Reflect.getMetadata(SKIPS_TENANT_AUTH, SuperAdminController)).toBe(true);
  });

  it('exposes no public route that mutates state beyond sign-in and sign-up', () => {
    const POST = 1;
    const PUT = 2;
    const DELETE = 3;
    const PATCH = 4;

    const mutatingPublic = allTenantRoutes
      .filter(
        (route) =>
          Reflect.getMetadata(IS_PUBLIC_ROUTE, route.handler) === true &&
          [POST, PUT, DELETE, PATCH].includes(route.httpMethod) &&
          !EXPECTED_PUBLIC_ROUTES.includes(route.name),
      )
      .map((route) => route.name);

    expect(mutatingPublic).toEqual([]);
  });
});
