import 'reflect-metadata';
import { GUARDS_METADATA, PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { SuperAdminController } from '@/modules/super-admin/super-admin.controller';
import { SuperAdminAuthGuard } from '@/modules/super-admin/auth/super-admin-auth.guard';
import {
  IS_PLATFORM_PUBLIC,
  ALLOWS_MFA_PENDING,
} from '@/modules/super-admin/auth/super-admin.decorators';

/**
 * Structural guarantee for the platform control plane.
 *
 * The platform API can read and modify every tenant on the system. A route
 * added without the guard would be reachable by anyone on the internet, which
 * is exactly the state this portal was built to fix. These tests fail the
 * build if that protection is ever dropped or quietly widened.
 */

interface RouteInfo {
  name: string;
  handler: (...args: unknown[]) => unknown;
  httpMethod: string;
  path: string;
}

/** Every request-handling method declared on the controller. */
function collectRoutes(controller: new (...args: never[]) => unknown): RouteInfo[] {
  const prototype = controller.prototype;

  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => ({ name, handler: prototype[name] }))
    .filter(
      (entry): entry is { name: string; handler: (...args: unknown[]) => unknown } =>
        typeof entry.handler === 'function' &&
        Reflect.hasMetadata(PATH_METADATA, entry.handler),
    )
    .map(({ name, handler }) => ({
      name,
      handler,
      httpMethod: RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number],
      path: String(Reflect.getMetadata(PATH_METADATA, handler)),
    }));
}

const routes = collectRoutes(SuperAdminController);

/** Routes intentionally reachable without a session. */
const EXPECTED_PUBLIC_ROUTES = ['login'];

/** Routes reachable with a password-only session, mid two-factor challenge. */
const EXPECTED_MFA_PENDING_ROUTES = ['completeMfaChallenge'];

describe('SuperAdminController guard coverage', () => {
  it('declares at least one route', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it('applies SuperAdminAuthGuard to the whole controller', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, SuperAdminController) ?? [];
    expect(guards).toContain(SuperAdminAuthGuard);
  });

  it('leaves no route unguarded', () => {
    const controllerGuards = Reflect.getMetadata(GUARDS_METADATA, SuperAdminController) ?? [];
    const guardedAtControllerLevel = controllerGuards.includes(SuperAdminAuthGuard);

    const unguarded = routes.filter((route) => {
      if (guardedAtControllerLevel) return false;
      const routeGuards = Reflect.getMetadata(GUARDS_METADATA, route.handler) ?? [];
      return !routeGuards.includes(SuperAdminAuthGuard);
    });

    expect(unguarded.map((route) => route.name)).toEqual([]);
  });

  it('marks exactly the expected routes as public', () => {
    const publicRoutes = routes
      .filter((route) => Reflect.getMetadata(IS_PLATFORM_PUBLIC, route.handler) === true)
      .map((route) => route.name)
      .sort();

    // Widening this set exposes tenant data, so it must be a deliberate edit.
    expect(publicRoutes).toEqual([...EXPECTED_PUBLIC_ROUTES].sort());
  });

  it('marks exactly the expected routes as reachable mid two-factor challenge', () => {
    const pendingRoutes = routes
      .filter((route) => Reflect.getMetadata(ALLOWS_MFA_PENDING, route.handler) === true)
      .map((route) => route.name)
      .sort();

    expect(pendingRoutes).toEqual([...EXPECTED_MFA_PENDING_ROUTES].sort());
  });

  it('never marks a route both public and pending-allowed', () => {
    const both = routes.filter(
      (route) =>
        Reflect.getMetadata(IS_PLATFORM_PUBLIC, route.handler) === true &&
        Reflect.getMetadata(ALLOWS_MFA_PENDING, route.handler) === true,
    );

    expect(both.map((route) => route.name)).toEqual([]);
  });

  it('exposes no route that mutates state without authentication', () => {
    const mutatingPublicRoutes = routes.filter(
      (route) =>
        Reflect.getMetadata(IS_PLATFORM_PUBLIC, route.handler) === true &&
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.httpMethod) &&
        !EXPECTED_PUBLIC_ROUTES.includes(route.name),
    );

    expect(mutatingPublicRoutes.map((route) => route.name)).toEqual([]);
  });
});
