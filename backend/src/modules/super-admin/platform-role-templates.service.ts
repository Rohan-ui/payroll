import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { ADMIN_ROLE_CODE, PERMISSION_KEYS, groupPermissionCatalog, isPermissionKey } from '@/common/access/access-catalog';
import type { PlatformActor } from '@/modules/email/email.service';
import { recordPlatformAction } from './platform-activity';
import { CreateRoleTemplateDto, UpdateRoleTemplateDto } from './dto/platform-operations.dto';

const ADMIN_LOCKED = 'The Administrator role always holds every permission, so it cannot be edited or deleted.';

type Db = Pick<Prisma.TransactionClient, 'rndtechnosoft_permissions'>;

/**
 * Role templates: the platform-wide blueprints workspace roles are created
 * from. A template's grants are copied onto a workspace role when that role
 * is first created, so editing or deleting a template never changes the
 * access of a role a workspace already has. Grants are granular permission
 * keys from the one permission catalog.
 */
@Injectable()
export class PlatformRoleTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every template (the Administrator role first), the permission catalog, and how widely each is used. */
  async list() {
    const templates = await this.prisma.rndtechnosoft_role_templates.findMany({
      orderBy: [{ is_system_template: 'desc' }, { template_name: 'asc' }],
      include: {
        rndtechnosoft_role_template_permissions: {
          select: { rndtechnosoft_permissions: { select: { permission_code: true } } },
        },
      },
    });
    const codes = [ADMIN_ROLE_CODE, ...templates.map((t) => t.template_code)];
    const usage = await this.prisma.$queryRaw<{ role_code: string; workspaces: number; members: number }[]>`
      SELECT r.role_code,
             count(DISTINCT r.tenant_id)::int AS workspaces,
             count(DISTINCT mr.tenant_member_id) FILTER (WHERE m.membership_status = 'ACTIVE')::int AS members
      FROM rndtechnosoft_roles r
      LEFT JOIN rndtechnosoft_tenant_member_roles mr ON mr.tenant_id = r.tenant_id AND mr.role_id = r.id
      LEFT JOIN rndtechnosoft_tenant_members m ON m.tenant_id = mr.tenant_id AND m.id = mr.tenant_member_id
      WHERE r.role_code IN (${Prisma.join(codes)})
      GROUP BY r.role_code`;
    const used = new Map(usage.map((row) => [row.role_code, row]));
    const inUse = (code: string) => ({ workspaces: used.get(code)?.workspaces ?? 0, activeMembers: used.get(code)?.members ?? 0 });

    return {
      catalog: groupPermissionCatalog(),
      templates: [
        {
          code: ADMIN_ROLE_CODE,
          name: 'Administrator',
          description: "The workspace owner's role. It always holds every permission.",
          kind: 'OWNER' as const,
          editable: false,
          deletable: false,
          permissions: [...PERMISSION_KEYS],
          updatedAt: null,
          ...inUse(ADMIN_ROLE_CODE),
        },
        ...templates.map((t) => ({
          code: t.template_code,
          name: t.template_name,
          description: t.description,
          kind: t.is_system_template ? ('SYSTEM' as const) : ('CUSTOM' as const),
          editable: true,
          deletable: !t.is_system_template,
          permissions: t.rndtechnosoft_role_template_permissions
            .map((grant) => grant.rndtechnosoft_permissions.permission_code)
            .filter(isPermissionKey),
          updatedAt: t.updated_at,
          ...inUse(t.template_code),
        })),
      ],
    };
  }

  async create(input: CreateRoleTemplateDto, actor: PlatformActor) {
    if (input.code === ADMIN_ROLE_CODE) {
      throw new BadRequestException('ADMIN is the built-in Administrator role and cannot be used as a template code.');
    }
    const id = randomUUID();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.rndtechnosoft_role_templates.create({
          data: { id, template_code: input.code, template_name: input.name, description: input.description || null },
        });
        await tx.rndtechnosoft_role_template_permissions.createMany({
          data: (await this.permissionIds(tx, input.permissions)).map((permissionId) => ({
            id: randomUUID(),
            role_template_id: id,
            permission_id: permissionId,
          })),
        });
        await recordPlatformAction(tx, actor, {
          category: 'ROLE_TEMPLATE',
          action: 'ROLE_TEMPLATE_CREATED',
          description: `Created role template ${input.name} (${input.code})`,
          metadata: { templateCode: input.code, permissions: input.permissions },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A role template with the code ${input.code} already exists.`);
      }
      throw error;
    }
    return this.find(input.code);
  }

  async update(code: string, input: UpdateRoleTemplateDto, actor: PlatformActor) {
    const template = await this.findRow(code);
    const before = new Set(template.rndtechnosoft_role_template_permissions.map((g) => g.rndtechnosoft_permissions.permission_code));
    const after = new Set(input.permissions);

    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_role_templates.update({
        where: { id: template.id },
        data: { template_name: input.name, description: input.description || null, updated_at: new Date() },
      });
      await tx.rndtechnosoft_role_template_permissions.deleteMany({
        where: { role_template_id: template.id, rndtechnosoft_permissions: { permission_code: { notIn: input.permissions } } },
      });
      await tx.rndtechnosoft_role_template_permissions.createMany({
        data: (await this.permissionIds(tx, input.permissions)).map((permissionId) => ({
          id: randomUUID(),
          role_template_id: template.id,
          permission_id: permissionId,
        })),
        skipDuplicates: true,
      });
      await recordPlatformAction(tx, actor, {
        category: 'ROLE_TEMPLATE',
        action: 'ROLE_TEMPLATE_UPDATED',
        description: `Updated role template ${input.name} (${code})`,
        metadata: {
          templateCode: code,
          added: input.permissions.filter((key) => !before.has(key)),
          removed: [...before].filter((key) => !after.has(key)),
        },
      });
    });
    return this.find(code);
  }

  async remove(code: string, actor: PlatformActor) {
    const template = await this.findRow(code);
    if (template.is_system_template) {
      throw new BadRequestException('Built-in templates cannot be deleted. Change their permissions instead.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_role_templates.delete({ where: { id: template.id } });
      await recordPlatformAction(tx, actor, {
        category: 'ROLE_TEMPLATE',
        action: 'ROLE_TEMPLATE_DELETED',
        description: `Deleted role template ${template.template_name} (${code})`,
        metadata: { templateCode: code },
      });
    });
    return { code };
  }

  private async find(code: string) {
    const listed = (await this.list()).templates.find((t) => t.code === code);
    if (!listed) throw new NotFoundException('Role template not found.');
    return listed;
  }

  private async findRow(code: string) {
    if (code === ADMIN_ROLE_CODE) throw new BadRequestException(ADMIN_LOCKED);
    const template = await this.prisma.rndtechnosoft_role_templates.findUnique({
      where: { template_code: code },
      include: {
        rndtechnosoft_role_template_permissions: {
          select: { rndtechnosoft_permissions: { select: { permission_code: true } } },
        },
      },
    });
    if (!template) throw new NotFoundException('Role template not found.');
    return template;
  }

  private async permissionIds(db: Db, keys: string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const rows = await db.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: keys } }, select: { id: true } });
    if (rows.length !== keys.length) {
      throw new InternalServerErrorException('The permission catalog is not fully installed. Run the database migrations.');
    }
    return rows.map((row) => row.id);
  }
}
