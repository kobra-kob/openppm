import { Injectable } from "@nestjs/common";
import { Invitation, MembershipStatus, Role, RoleKey } from "@openppm/db";
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
    // Membres = comptes rattachés à l'org, soit par leur org d'origine (legacy),
    // soit par un membership ACTIF (multi-org). Rôles PAR org via le membership
    // s'il existe, sinon rôles globaux (repli transition).
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { organizationId },
          { memberships: { some: { organizationId, status: MembershipStatus.ACTIVE } } },
        ],
      },
      include: {
        userRoles: { include: { role: true } },
        memberships: {
          where: { organizationId },
          include: { roles: { include: { role: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return users.map((user) => {
      const membership = user.memberships[0];
      const roles = membership
        ? membership.roles.map((mr) => ({ key: mr.role.key, id: mr.roleId }))
        : user.userRoles.map((ur) => ({ key: ur.role.key, id: ur.roleId }));
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        roles: roles.map((r) => r.key).filter((key): key is RoleKey => key !== null),
        roleIds: roles.map((r) => r.id),
      };
    });
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

  async isOrgOwner(organizationId: string, userId: string): Promise<boolean> {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, ownerUserId: userId },
      select: { id: true },
    });
    return org !== null;
  }

  async removeMembership(organizationId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const membership = await tx.organizationMembership.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
        select: { id: true },
      });
      if (membership) {
        await tx.membershipRole.deleteMany({ where: { membershipId: membership.id } });
        await tx.organizationMembership.update({
          where: { id: membership.id },
          data: { status: MembershipStatus.REMOVED },
        });
      }
    });
  }

  async findAccountByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, deletedAt: true },
    });
  }

  async addExistingMember(
    organizationId: string,
    userId: string,
    roleId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Upsert : réactive un membership retiré, ou en crée un nouveau.
      const membership = await tx.organizationMembership.upsert({
        where: { userId_organizationId: { userId, organizationId } },
        create: { userId, organizationId, status: MembershipStatus.ACTIVE },
        update: { status: MembershipStatus.ACTIVE },
        select: { id: true },
      });
      await tx.membershipRole.createMany({
        data: [{ membershipId: membership.id, roleId }],
        skipDuplicates: true,
      });
    });
  }

  async userInOrganization(organizationId: string, userId: string): Promise<boolean> {
    // Appartenance = org d'origine (legacy) OU membership ACTIF (multi-tenant).
    const found = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        OR: [
          { organizationId },
          { memberships: { some: { organizationId, status: MembershipStatus.ACTIVE } } },
        ],
      },
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
    // Comptage par membership (rôle admin dans CETTE organisation).
    return this.prisma.organizationMembership.count({
      where: {
        organizationId,
        status: MembershipStatus.ACTIVE,
        userId: { not: excludeUserId },
        user: { deletedAt: null },
        roles: { some: { role: { key: RoleKey.admin } } },
      },
    });
  }

  /**
   * Fixe les rôles d'un membre dans une organisation : met à jour les rôles de
   * son membership (source de vérité multi-tenant) et synchronise `user_roles`
   * (repli legacy) dans une transaction.
   */
  async setUserRoles(userId: string, organizationId: string, roleIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const membership = await tx.organizationMembership.upsert({
        where: { userId_organizationId: { userId, organizationId } },
        create: { userId, organizationId, status: MembershipStatus.ACTIVE },
        update: {},
        select: { id: true },
      });
      await tx.membershipRole.deleteMany({ where: { membershipId: membership.id } });
      if (roleIds.length > 0) {
        await tx.membershipRole.createMany({
          data: roleIds.map((roleId) => ({ membershipId: membership.id, roleId })),
        });
      }
      // Synchronisation legacy (repli quand aucun membership) pour cohérence.
      await tx.userRole.deleteMany({ where: { userId } });
      if (roleIds.length > 0) {
        await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) });
      }
    });
  }
}
