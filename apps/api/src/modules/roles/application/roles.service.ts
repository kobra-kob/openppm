import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { RoleKey } from "@openppm/db";
import { AuditService } from "../../../core/audit/audit.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { permKey } from "../../auth/domain/permissions";
import type { CreateRoleDto, UpdateRoleDto } from "./dto/role.dtos";

export interface PermissionView {
  key: string;
  subject: string;
  action: string;
}

export interface RoleView {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  active: boolean;
  permissionKeys: string[];
  userCount: number;
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Catalogue de permissions (pour l'éditeur de rôles). */
  async listPermissions(): Promise<PermissionView[]> {
    const rows = await this.prisma.permission.findMany({
      orderBy: [{ subject: "asc" }, { action: "asc" }],
    });
    return rows.map((p) => ({ key: permKey(p.subject, p.action), subject: p.subject, action: p.action }));
  }

  /** Rôles visibles pour l'org : rôles système (globaux) + rôles propres à l'org. */
  async list(payload: JwtPayload): Promise<RoleView[]> {
    const roles = await this.prisma.role.findMany({
      where: { OR: [{ organizationId: null }, { organizationId: payload.org }] },
      include: {
        rolePermissions: { select: { permission: { select: { action: true, subject: true } } } },
        _count: { select: { userRoles: true } },
      },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    return roles.map((r) => this.toView(r));
  }

  async listUsers(
    payload: JwtPayload,
    roleId: string,
  ): Promise<Array<{ id: string; name: string; email: string }>> {
    await this.requireRole(payload, roleId);
    const rows = await this.prisma.userRole.findMany({
      where: { roleId, user: { organizationId: payload.org, deletedAt: null } },
      select: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { user: { firstName: "asc" } },
    });
    return rows.map(({ user }) => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email,
    }));
  }

  async create(payload: JwtPayload, dto: CreateRoleDto, context: RequestContext): Promise<RoleView> {
    const permissionIds = await this.resolvePermissionIds(dto.permissionKeys);
    // Nom unique dans l'organisation
    const existing = await this.prisma.role.findFirst({
      where: { organizationId: payload.org, name: dto.name },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({ code: "ROLE_NAME_TAKEN", message: "Un rôle porte déjà ce nom" });
    }
    const role = await this.prisma.role.create({
      data: {
        organizationId: payload.org,
        name: dto.name,
        description: dto.description ?? null,
        isSystem: false,
        rolePermissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
      include: {
        rolePermissions: { select: { permission: { select: { action: true, subject: true } } } },
        _count: { select: { userRoles: true } },
      },
    });
    await this.audit.log({
      action: "role.created",
      entityType: "role",
      entityId: role.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { name: dto.name, permissions: dto.permissionKeys.length },
      ...context,
    });
    return this.toView(role);
  }

  async update(
    payload: JwtPayload,
    roleId: string,
    dto: UpdateRoleDto,
    context: RequestContext,
  ): Promise<RoleView> {
    const role = await this.requireRole(payload, roleId);
    // Le rôle administrateur est immuable (il détient toujours toutes les permissions).
    if (role.key === RoleKey.admin) {
      throw new ForbiddenException({
        code: "ROLE_IMMUTABLE",
        message: "Le rôle Administrateur ne peut pas être modifié",
      });
    }
    // Un rôle système ne peut être ni renommé, ni désactivé (mais ses permissions
    // et sa description restent ajustables).
    if (role.isSystem && (dto.name !== undefined || dto.active === false)) {
      throw new BadRequestException({
        code: "SYSTEM_ROLE_RESTRICTED",
        message: "Un rôle système ne peut être ni renommé ni désactivé",
      });
    }

    const permissionIds =
      dto.permissionKeys !== undefined ? await this.resolvePermissionIds(dto.permissionKeys) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id: roleId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });
      if (permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId } });
        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
          });
        }
      }
    });
    await this.audit.log({
      action: "role.updated",
      entityType: "role",
      entityId: roleId,
      organizationId: payload.org,
      userId: payload.sub,
      after: JSON.parse(JSON.stringify(dto)),
      ...context,
    });
    return this.getView(payload, roleId);
  }

  async remove(payload: JwtPayload, roleId: string, context: RequestContext): Promise<void> {
    const role = await this.requireRole(payload, roleId);
    if (role.isSystem) {
      throw new BadRequestException({
        code: "SYSTEM_ROLE_RESTRICTED",
        message: "Un rôle système ne peut pas être supprimé",
      });
    }
    const users = await this.prisma.userRole.count({ where: { roleId } });
    if (users > 0) {
      throw new ConflictException({
        code: "ROLE_IN_USE",
        message: "Ce rôle est encore attribué à des utilisateurs",
      });
    }
    await this.prisma.role.delete({ where: { id: roleId } });
    await this.audit.log({
      action: "role.deleted",
      entityType: "role",
      entityId: roleId,
      organizationId: payload.org,
      userId: payload.sub,
      before: { name: role.name },
      ...context,
    });
  }

  // ── Aides privées ────────────────────────────────────────────────────

  private async requireRole(payload: JwtPayload, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, OR: [{ organizationId: null }, { organizationId: payload.org }] },
    });
    if (!role) {
      throw new NotFoundException({ code: "ROLE_NOT_FOUND", message: "Rôle introuvable" });
    }
    return role;
  }

  private async getView(payload: JwtPayload, roleId: string): Promise<RoleView> {
    const role = await this.prisma.role.findFirstOrThrow({
      where: { id: roleId },
      include: {
        rolePermissions: { select: { permission: { select: { action: true, subject: true } } } },
        _count: { select: { userRoles: true } },
      },
    });
    return this.toView(role);
  }

  /** Résout des clés de permissions en identifiants, en rejetant les inconnues. */
  private async resolvePermissionIds(keys: string[]): Promise<string[]> {
    const unique = [...new Set(keys)];
    const permissions = await this.prisma.permission.findMany({
      select: { id: true, action: true, subject: true },
    });
    const byKey = new Map(permissions.map((p) => [permKey(p.subject, p.action), p.id]));
    const ids: string[] = [];
    for (const key of unique) {
      const id = byKey.get(key);
      if (!id) {
        throw new BadRequestException({
          code: "PERMISSION_UNKNOWN",
          message: `Permission inconnue : ${key}`,
        });
      }
      ids.push(id);
    }
    return ids;
  }

  private toView(role: {
    id: string;
    key: RoleKey | null;
    name: string;
    description: string | null;
    isSystem: boolean;
    active: boolean;
    rolePermissions: Array<{ permission: { action: string; subject: string } }>;
    _count: { userRoles: number };
  }): RoleView {
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      active: role.active,
      permissionKeys: role.rolePermissions
        .map((rp) => permKey(rp.permission.subject, rp.permission.action))
        .sort(),
      userCount: role._count.userRoles,
    };
  }
}
