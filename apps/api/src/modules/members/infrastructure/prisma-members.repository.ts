import { Injectable } from "@nestjs/common";
import { Invitation, Role, RoleKey } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import {
  CreateInvitationInput,
  InvitationWithRelations,
  MembersRepository,
  MemberSummary,
} from "../domain/members.repository";

@Injectable()
export class PrismaMembersRepository implements MembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listMembers(organizationId: string): Promise<MemberSummary[]> {
    const users = await this.prisma.user.findMany({
      where: { organizationId, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
      orderBy: { createdAt: "asc" },
    });
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      roles: user.userRoles
        .map((userRole) => userRole.role.key)
        .filter((key): key is RoleKey => key !== null),
      roleIds: user.userRoles.map((userRole) => userRole.roleId),
    }));
  }

  listPendingInvitations(organizationId: string): Promise<InvitationWithRelations[]> {
    return this.prisma.invitation.findMany({
      where: {
        organizationId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        role: true,
        invitedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  findRoleByKey(key: RoleKey): Promise<Role | null> {
    return this.prisma.role.findUnique({ where: { key } });
  }

  async emailHasAccount(email: string): Promise<boolean> {
    const found = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return found !== null;
  }

  async hasPendingInvitation(
    organizationId: string,
    email: string,
  ): Promise<boolean> {
    const found = await this.prisma.invitation.findFirst({
      where: {
        organizationId,
        email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    return found !== null;
  }

  createInvitation(input: CreateInvitationInput): Promise<Invitation> {
    return this.prisma.invitation.create({ data: input });
  }

  findPendingInvitationById(
    id: string,
    organizationId: string,
  ): Promise<Invitation | null> {
    return this.prisma.invitation.findFirst({
      where: { id, organizationId, acceptedAt: null },
    });
  }

  async deleteInvitation(id: string): Promise<void> {
    await this.prisma.invitation.delete({ where: { id } });
  }

  async userInOrganization(organizationId: string, userId: string): Promise<boolean> {
    const found = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null },
      select: { id: true },
    });
    return found !== null;
  }

  async assignableRoleIds(organizationId: string): Promise<Set<string>> {
    const roles = await this.prisma.role.findMany({
      // Rôles système (organizationId null) OU rôles perso de l'org, actifs.
      where: { active: true, OR: [{ organizationId: null }, { organizationId }] },
      select: { id: true },
    });
    return new Set(roles.map((r) => r.id));
  }

  async adminRoleId(): Promise<string> {
    const role = await this.prisma.role.findUniqueOrThrow({
      where: { key: RoleKey.admin },
      select: { id: true },
    });
    return role.id;
  }

  async countOrgAdmins(organizationId: string, excludeUserId: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        organizationId,
        deletedAt: null,
        id: { not: excludeUserId },
        userRoles: { some: { role: { key: RoleKey.admin } } },
      },
    });
  }

  async setUserRoles(userId: string, roleIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId } }),
      this.prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId, roleId })),
      }),
    ]);
  }
}
