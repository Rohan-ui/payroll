import 'reflect-metadata';
import { INestApplication, ValidationPipe, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { SuperAdminController } from '@/modules/super-admin/super-admin.controller';
import { IS_PLATFORM_PUBLIC } from '@/modules/super-admin/auth/super-admin.decorators';
import { hashPassword } from '@/common/security/password.util';
import { IP_LOGIN_RULE } from '@/common/security/login-throttle.service';

const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';

const API_PREFIX = '/api/v1';
const TEST_EMAIL = `authz-suite-${Date.now()}@voogyo.test`;
const TEST_PASSWORD = 'Suite-Password-With-Length-1';

interface PlatformRoute {
  name: string;
  httpMethod: 'get' | 'post' | 'put' | 'patch' | 'delete';
  url: string;
  isPublic: boolean;
}

/** Enumerates the platform routes straight from the controller metadata. */
function platformRoutes(): PlatformRoute[] {
  const prototype = SuperAdminController.prototype as unknown as Record<string, unknown>;

  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => ({ name, handler: prototype[name] }))
    .filter(
      (entry): entry is { name: string; handler: (...args: unknown[]) => unknown } =>
        typeof entry.handler === 'function' && Reflect.hasMetadata(PATH_METADATA, entry.handler),
    )
    .map(({ name, handler }) => {
      const rawPath = Reflect.getMetadata(PATH_METADATA, handler);
      // A route can declare several paths; the first is enough to prove the guard.
      const path = Array.isArray(rawPath) ? rawPath[0] : rawPath;
      const verb = RequestMethod[
        Reflect.getMetadata(METHOD_METADATA, handler) as number
      ].toLowerCase() as PlatformRoute['httpMethod'];

      return {
        name,
        httpMethod: verb,
        url: `${API_PREFIX}/super-admin/${String(path).replace(
          /:[A-Za-z]+/g,
          '00000000-0000-4000-8000-000000000000',
        )}`.replace(/\/+$/, ''),
        isPublic: Reflect.getMetadata(IS_PLATFORM_PUBLIC, handler) === true,
      };
    });
}

describe('Platform control-plane authorization', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testAdminId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    const expressApp = moduleRef.createNestApplication<NestExpressApplication>();
    // Mirror the production bootstrap so the tests exercise the real pipeline.
    // Requests come from loopback, so they arrive as if through the reverse proxy.
    expressApp.set('trust proxy', 'loopback');
    app = expressApp;
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    testAdminId = randomUUID();
    await prisma.rndtechnosoft_super_admins.create({
      data: {
        id: testAdminId,
        email: TEST_EMAIL,
        password_hash: await hashPassword(TEST_PASSWORD),
        password_algorithm: 'SCRYPT',
        display_name: 'Authorization Suite',
        role: 'SUPER_ADMIN',
        is_active: true,
      },
    });
  });

  afterAll(async () => {
    if (prisma && testAdminId) {
      await prisma.rndtechnosoft_super_admin_sessions.deleteMany({
        where: { super_admin_id: testAdminId },
      });
      await prisma.rndtechnosoft_super_admins.deleteMany({ where: { id: testAdminId } });
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
    }
    await app?.close();
  });

  beforeEach(async () => {
    // Failed-login tests would otherwise throttle the ones that follow.
    await prisma.rndtechnosoft_login_throttle.deleteMany({});
  });

  describe('anonymous access', () => {
    const routes = platformRoutes().filter((route) => !route.isPublic);

    it('enumerates the guarded routes', () => {
      expect(routes.length).toBeGreaterThan(15);
    });

    it.each(routes.map((route) => [`${route.httpMethod.toUpperCase()} ${route.url}`, route]))(
      'refuses %s without a session',
      async (_label, route) => {
        const response = await request(app.getHttpServer())
          [(route as PlatformRoute).httpMethod]((route as PlatformRoute).url)
          .send({});

        expect(response.status).toBe(401);
      },
    );
  });

  describe('session forgery', () => {
    it('ignores a client-supplied super admin id header', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/super-admin/tenants`)
        .set('x-super-admin-id', testAdminId);

      expect(response.status).toBe(401);
    });

    it('rejects a token that is not in the session store', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/super-admin/tenants`)
        .set('Authorization', `Bearer ${randomBytes(32).toString('base64url')}`);

      expect(response.status).toBe(401);
    });

    it('rejects a revoked session', async () => {
      const login = await request(app.getHttpServer())
        .post(`${API_PREFIX}/super-admin/auth/login`)
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      const token: string = login.body.data.token;

      const before = await request(app.getHttpServer())
        .get(`${API_PREFIX}/super-admin/tenants`)
        .set('Authorization', `Bearer ${token}`);
      expect(before.status).toBe(200);

      await prisma.rndtechnosoft_super_admin_sessions.updateMany({
        where: { token_hash: createHash('sha256').update(token).digest('hex') },
        data: { revoked_at: new Date() },
      });

      const after = await request(app.getHttpServer())
        .get(`${API_PREFIX}/super-admin/tenants`)
        .set('Authorization', `Bearer ${token}`);
      expect(after.status).toBe(401);
    });

    it('rejects an expired session', async () => {
      // Built directly rather than by backdating a live session: the database
      // enforces expires_at > created_at, so both timestamps move together.
      const token = randomBytes(32).toString('base64url');
      const issuedAt = new Date(Date.now() - 9 * 3_600_000);
      const expiredAt = new Date(Date.now() - 3_600_000);

      await prisma.rndtechnosoft_super_admin_sessions.create({
        data: {
          id: randomUUID(),
          super_admin_id: testAdminId,
          token_hash: createHash('sha256').update(token).digest('hex'),
          created_at: issuedAt,
          last_used_at: issuedAt,
          expires_at: expiredAt,
        },
      });

      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/super-admin/tenants`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    it('refuses to store a session that expires before it was issued', async () => {
      // The database is the last line of defence for this invariant.
      const now = new Date();

      await expect(
        prisma.rndtechnosoft_super_admin_sessions.create({
          data: {
            id: randomUUID(),
            super_admin_id: testAdminId,
            token_hash: createHash('sha256').update(randomUUID()).digest('hex'),
            created_at: now,
            expires_at: new Date(now.getTime() - 1000),
          },
        }),
      ).rejects.toThrow();
    });

    it('rejects a session whose account was deactivated', async () => {
      const login = await request(app.getHttpServer())
        .post(`${API_PREFIX}/super-admin/auth/login`)
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      const token: string = login.body.data.token;

      await prisma.rndtechnosoft_super_admins.update({
        where: { id: testAdminId },
        data: { is_active: false },
      });

      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/super-admin/tenants`)
        .set('Authorization', `Bearer ${token}`);

      await prisma.rndtechnosoft_super_admins.update({
        where: { id: testAdminId },
        data: { is_active: true },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('credential handling', () => {
    it('gives the same answer for an unknown address and a wrong password', async () => {
      const unknown = await request(app.getHttpServer())
        .post(`${API_PREFIX}/super-admin/auth/login`)
        .send({ email: `absent-${randomUUID()}@voogyo.test`, password: 'whatever-password' });

      const wrong = await request(app.getHttpServer())
        .post(`${API_PREFIX}/super-admin/auth/login`)
        .send({ email: TEST_EMAIL, password: 'definitely-not-the-password' });

      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      // Differing text would let an attacker enumerate valid addresses.
      expect(unknown.body.message).toBe(wrong.body.message);
    });

    it('never returns the password hash or session digest', async () => {
      const login = await request(app.getHttpServer())
        .post(`${API_PREFIX}/super-admin/auth/login`)
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      const serialized = JSON.stringify(login.body);
      expect(serialized).not.toContain('password_hash');
      expect(serialized).not.toContain('token_hash');
      expect(serialized).not.toContain('scrypt$');
    });

    it('blocks repeated failures from one address', async () => {
      const email = `stuffing-${randomUUID()}@voogyo.test`;
      let sawTooManyRequests = false;

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const response = await request(app.getHttpServer())
          .post(`${API_PREFIX}/super-admin/auth/login`)
          .send({ email, password: `guess-${attempt}` });

        if (response.status === 429) {
          sawTooManyRequests = true;
          expect(response.headers['retry-after']).toBeDefined();
          break;
        }
      }

      expect(sawTooManyRequests).toBe(true);
    });

    // Behind the proxy the header reads "<whatever the caller sent>, <real address>".
    const throughProxy = (forged: string, real: string) => ({ 'X-Forwarded-For': `${forged}, ${real}` });

    it('counts failures against the real address, whatever the caller writes in X-Forwarded-For', async () => {
      let sawTooManyRequests = false;

      // A new email each time, so only the address rule can trip.
      for (let attempt = 0; attempt <= IP_LOGIN_RULE.limit; attempt += 1) {
        const response = await request(app.getHttpServer())
          .post(`${API_PREFIX}/super-admin/auth/login`)
          .set(throughProxy(`203.0.113.${attempt + 1}`, '198.51.100.7'))
          .send({ email: `spray-${randomUUID()}@voogyo.test`, password: `guess-${attempt}` });

        if (response.status === 429) {
          sawTooManyRequests = true;
          break;
        }
      }

      expect(sawTooManyRequests).toBe(true);
    });

    it('records the real address on the session, not the one the caller wrote', async () => {
      const login = await request(app.getHttpServer())
        .post(`${API_PREFIX}/super-admin/auth/login`)
        .set(throughProxy('203.0.113.50', '198.51.100.8'))
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
      expect(login.status).toBe(200);

      const session = await prisma.rndtechnosoft_super_admin_sessions.findFirst({
        where: { super_admin_id: testAdminId },
        orderBy: { created_at: 'desc' },
        select: { issued_ip_address: true },
      });
      expect(session?.issued_ip_address).toBe('198.51.100.8');
    });
  });
});
