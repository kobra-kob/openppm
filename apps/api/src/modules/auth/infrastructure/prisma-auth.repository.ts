import { Injectable } from "@nestjs/common";
import {
  Invitation,
  MembershipStatus,
  PasswordReset,
  Prisma,
  RefreshToken,
  RoleKey,
  SubscriptionStatus,
} from "@openppm/db";

/** Durée de l'essai gratuit à la création d'une organisation (jours). */
const TRIAL_DAYS = 14;
import { PrismaService } from "../../../core/prisma/prisma.service";
import {
  AcceptInvitationInput,
  AuthRepository,
  CreateOrganizationWithOwnerInput,
  CreatePasswordResetInput,
  CreateRefreshTokenInput,
  UserWithAccess,
} from "../domain/auth.repository";

const USER_INCLUDE = {
  organization: true,
  userRoles: { include: { role: true } },
} as const;

@Injectable()
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string): Promise<UserWithAccess | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: USER_INCLUDE,
    });
  }

  findUserById(id: string): Promise<UserWithAccess | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: USER_INCLUDE,
    });
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    const found = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    return found !== null;
  }

  async listUserOrganizations(userId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE, organization: { deletedAt: null } },
      select: {
        isOwner: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { organization: { name: "asc" } },
    });
    return memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      isOwner: m.isOwner,
    }));
  }

  async findActiveMembership(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { status: true, isOwner: true },
    });
    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      return null;
    }
    return { isOwner: membership.isOwner };
  }

  createOrganizationWithOwner(
    input: CreateOrganizationWithOwnerInput,
  ): Promise<UserWithAccess> {
    return this.prisma.$transaction(async (tx) => {
      const adminRole = await tx.role.findUnique({
        where: { key: RoleKey.admin },
      });
      if (!adminRole) {
        throw new Error(
          "Rôles système absents — exécuter le seed : pnpm db:seed",
        );
      }
      const organization = await tx.organization.create({
        data: { name: input.organizationName, slug: input.slug },
      });
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: input.email,
          passwordHash: input.passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          locale: input.locale ?? "fr",
          userRoles: { create: { roleId: adminRole.id } },
        },
        include: USER_INCLUDE,
      });
      // Multi-tenant : le créateur devient membre owner (rôles par organisation).
      await tx.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          status: MembershipStatus.ACTIVE,
          isOwner: true,
          roles: { create: { roleId: adminRole.id } },
        },
      });
      await tx.organization.update({
        where: { id: organization.id },
        data: { ownerUserId: user.id },
      });
      // SaaS : essai gratuit de 14 jours à la création (accès complet).
      const now = new Date();
      await tx.subscription.create({
        data: {
          organizationId: organization.id,
          planKey: "STANDARD",
          status: SubscriptionStatus.TRIALING,
          quantity: 1,
          unitAmount: 2000,
          currency: "eur",
          trialStart: now,
          trialEnd: new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
        },
      });
      return user;
    });
  }

  async registerFailedLogin(
    userId: string,
    failedLoginCount: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount, lockedUntil },
    });
  }

  async registerSuccessfulLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  }

  createRefreshToken(input: CreateRefreshTokenInput): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId ?? null,
        tokenHash: input.tokenHash,
        familyId: input.familyId,
        expiresAt: input.expiresAt,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 255) ?? null,
      },
    });
  }

  findRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  async revokeRefreshTokenIfActive(id: string): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count === 1;
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  createPasswordReset(input: CreatePasswordResetInput): Promise<PasswordReset> {
    return this.prisma.passwordReset.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
  }

  findActivePasswordResetByHash(tokenHash: string): Promise<PasswordReset | null> {
    return this.prisma.passwordReset.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });
  }

  async changePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  findActiveInvitationByHash(tokenHash: string): Promise<Invitation | null> {
    return this.prisma.invitation.findFirst({
      where: { tokenHash, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
  }

  acceptInvitation(input: AcceptInvitationInput): Promise<UserWithAccess> {
    return this.prisma.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: input.invitationId },
        data: { acceptedAt: new Date() },
      });
      const user = await tx.user.create({
        data: {
          organizationId: input.organizationId,
          email: input.email,
          passwordHash: input.passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          locale: input.locale ?? "fr",
          userRoles: { create: { roleId: input.roleId } },
        },
        include: USER_INCLUDE,
      });
      // Multi-tenant : membre actif de l'organisation invitante (rôle par org).
      await tx.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: input.organizationId,
          status: MembershipStatus.ACTIVE,
          roles: { create: { roleId: input.roleId } },
        },
      });
      return user;
    });
  }

  async setMfaSecret(userId: string, secret: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret, mfaEnabled: false, mfaRecoveryCodes: Prisma.JsonNull },
    });
  }

  async enableMfa(userId: string, hashedRecoveryCodes: string[]): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaRecoveryCodes: hashedRecoveryCodes },
    });
  }

  async disableMfa(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: Prisma.JsonNull },
    });
  }

  async setRecoveryCodes(userId: string, hashedRecoveryCodes: string[]): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaRecoveryCodes: hashedRecoveryCodes },
    });
  }

  async consumePasswordReset(
    resetId: string,
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.passwordReset.update({
        where: { id: resetId },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}
