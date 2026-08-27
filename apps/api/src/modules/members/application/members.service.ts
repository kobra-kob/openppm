import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuditService } from "../../../core/audit/audit.service";
import { MailerService } from "../../../core/mailer/mailer.service";
import { PermissionsService } from "../../auth/application/permissions.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { MEMBERS_REPOSITORY } from "../domain/members.repository";
import type {
  MembersRepository,
  MemberSummary,
} from "../domain/members.repository";
import type { InviteMemberDto } from "./dto/invite-member.dto";

const INVITATION_TTL_DAYS = 7;

export interface PendingInvitationView {
  id: string;
  email: string;
  roleKey: string | null;
  roleName: string;
  invitedByName: string;
  expiresAt: Date;
  createdAt: Date;
}

@Injectable()
export class MembersService {
  constructor(
    @Inject(MEMBERS_REPOSITORY) private readonly repository: MembersRepository,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * Remplace les rôles d'un membre (rôles cumulables). Garantit qu'au moins un
   * administrateur subsiste dans l'organisation. Invalide le cache de permissions
   * du membre pour une prise en compte immédiate.
   */
  async setRoles(
    payload: JwtPayload,
    userId: string,
    roleIds: string[],
    context: RequestContext,
  ): Promise<MemberSummary> {
    if (!(await this.repository.userInOrganization(payload.org, userId))) {
      throw new NotFoundException({ code: "USER_NOT_IN_ORG", message: "Membre introuvable" });
    }
    const unique = [...new Set(roleIds)];
    const assignable = await this.repository.assignableRoleIds(payload.org);
    const invalid = unique.filter((id) => !assignable.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException({
        code: "ROLE_NOT_ASSIGNABLE",
        message: "Un ou plusieurs rôles ne sont pas attribuables dans cette organisation",
      });
    }
    // Filet de sécurité : ne jamais retirer le dernier administrateur.
    const adminRoleId = await this.repository.adminRoleId();
    if (!unique.includes(adminRoleId)) {
      const otherAdmins = await this.repository.countOrgAdmins(payload.org, userId);
      if (otherAdmins === 0) {
        throw new BadRequestException({
          code: "LAST_ADMIN",
          message: "Impossible de retirer le rôle Administrateur au dernier administrateur",
        });
      }
    }

    await this.repository.setUserRoles(userId, payload.org, unique);
    this.permissions.invalidate(userId);
    await this.audit.log({
      action: "member.roles_updated",
      entityType: "user",
      entityId: userId,
      organizationId: payload.org,
      userId: payload.sub,
      after: { roleIds: unique },
      ...context,
    });
    const members = await this.repository.listMembers(payload.org);
    return members.find((m) => m.id === userId)!;
  }

  listMembers(organizationId: string): Promise<MemberSummary[]> {
    return this.repository.listMembers(organizationId);
  }

  async listInvitations(organizationId: string): Promise<PendingInvitationView[]> {
    const invitations = await this.repository.listPendingInvitations(organizationId);
    return invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      roleKey: invitation.role.key,
      roleName: invitation.role.name,
      invitedByName: `${invitation.invitedBy.firstName} ${invitation.invitedBy.lastName}`,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    }));
  }

  async invite(
    organizationId: string,
    invitedById: string,
    dto: InviteMemberDto,
    context: RequestContext,
  ): Promise<PendingInvitationView> {
    if (await this.repository.emailHasAccount(dto.email)) {
      throw new ConflictException({
        code: "EMAIL_ALREADY_USED",
        message: "Un compte existe déjà avec cet email",
      });
    }
    if (await this.repository.hasPendingInvitation(organizationId, dto.email)) {
      throw new ConflictException({
        code: "INVITATION_ALREADY_PENDING",
        message: "Une invitation est déjà en attente pour cet email",
      });
    }
    const role = await this.repository.findRoleByKey(dto.roleKey);
    if (!role) {
      throw new NotFoundException({
        code: "ROLE_NOT_FOUND",
        message: "Rôle inconnu — exécuter le seed",
      });
    }

    const rawToken = randomBytes(32).toString("base64url");
    const invitation = await this.repository.createInvitation({
      organizationId,
      email: dto.email,
      roleId: role.id,
      tokenHash: createHash("sha256").update(rawToken).digest("hex"),
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
      invitedById,
    });

    const appUrl = this.config.get<string>("APP_URL") ?? "http://localhost:3000";
    await this.mailer.send({
      to: dto.email,
      subject: "OpenPPM — Vous êtes invité(e) à rejoindre un espace de travail",
      text: `Bonjour,\n\nVous êtes invité(e) à rejoindre un espace OpenPPM avec le rôle « ${role.name} ».\nCréez votre compte via ce lien (valable ${INVITATION_TTL_DAYS} jours) :\n${appUrl}/accept-invitation?token=${rawToken}\n\nSi vous n'attendiez pas cette invitation, ignorez cet email.`,
    });
    await this.audit.log({
      action: "member.invited",
      entityType: "invitation",
      entityId: invitation.id,
      organizationId,
      userId: invitedById,
      after: { email: dto.email, role: dto.roleKey },
      ...context,
    });

    const invitedBy = { firstName: "", lastName: "" };
    return {
      id: invitation.id,
      email: invitation.email,
      roleKey: role.key,
      roleName: role.name,
      invitedByName: `${invitedBy.firstName} ${invitedBy.lastName}`.trim(),
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }

  async revoke(
    organizationId: string,
    invitationId: string,
    revokedById: string,
    context: RequestContext,
  ): Promise<void> {
    const invitation = await this.repository.findPendingInvitationById(
      invitationId,
      organizationId,
    );
    if (!invitation) {
      throw new NotFoundException({
        code: "INVITATION_NOT_FOUND",
        message: "Invitation introuvable",
      });
    }
    await this.repository.deleteInvitation(invitation.id);
    await this.audit.log({
      action: "member.invitation_revoked",
      entityType: "invitation",
      entityId: invitation.id,
      organizationId,
      userId: revokedById,
      before: { email: invitation.email },
      ...context,
    });
  }
}
