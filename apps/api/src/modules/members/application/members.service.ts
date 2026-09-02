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
import { BillingSeatService } from "../../billing/application/billing-seat.service";
import { PermissionsService } from "../../auth/application/permissions.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { MEMBERS_REPOSITORY } from "../domain/members.repository";
import type {
  MembersRepository,
  MemberSummary,
} from "../domain/members.repository";
import type { AddExistingMemberDto } from "./dto/add-existing-member.dto";
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
    private readonly seats: BillingSeatService,
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

  /**
   * Ajoute un **compte existant** (par email) à l'organisation courante avec un
   * rôle : crée un membership actif. Rend le multi-org concret (un même compte
   * dans plusieurs organisations). Pour un email inconnu, passer par l'invitation.
   */
  async addExistingMember(
    organizationId: string,
    addedById: string,
    dto: AddExistingMemberDto,
    context: RequestContext,
  ): Promise<MemberSummary> {
    const role = await this.repository.findRoleByKey(dto.roleKey);
    if (!role) {
      throw new NotFoundException({ code: "ROLE_NOT_FOUND", message: "Rôle inconnu" });
    }
    const assignable = await this.repository.assignableRoleIds(organizationId);
    if (!assignable.has(role.id)) {
      throw new BadRequestException({
        code: "ROLE_NOT_ASSIGNABLE",
        message: "Ce rôle n'est pas attribuable dans cette organisation",
      });
    }
    const account = await this.repository.findAccountByEmail(dto.email);
    if (!account || account.deletedAt) {
      throw new NotFoundException({
        code: "ACCOUNT_NOT_FOUND",
        message:
          "Aucun compte OpenPPM avec cet email. Utilisez une invitation pour créer un nouveau compte.",
      });
    }
    if (await this.repository.userInOrganization(organizationId, account.id)) {
      throw new ConflictException({
        code: "MEMBER_ALREADY_EXISTS",
        message: "Ce compte est déjà membre de cette organisation",
      });
    }
    await this.repository.addExistingMember(organizationId, account.id, role.id);
    this.permissions.invalidate(account.id);
    // Le nombre de sièges facturés suit la composition de l'organisation.
    await this.seats.syncSeats(organizationId);
    await this.audit.log({
      action: "member.added_existing",
      entityType: "user",
      entityId: account.id,
      organizationId,
      userId: addedById,
      after: { email: dto.email, role: dto.roleKey },
      ...context,
    });
    const members = await this.repository.listMembers(organizationId);
    return members.find((m) => m.id === account.id)!;
  }

  /**
   * Retire un membre de l'organisation (membership REMOVED). Le compte global
   * n'est pas supprimé (il peut appartenir à d'autres organisations, §21). On ne
   * retire ni le propriétaire ni le dernier administrateur. Les sièges facturés
   * sont recalculés.
   */
  async removeMember(
    payload: JwtPayload,
    userId: string,
    context: RequestContext,
  ): Promise<void> {
    if (userId === payload.sub) {
      throw new BadRequestException({
        code: "CANNOT_REMOVE_SELF",
        message: "Vous ne pouvez pas vous retirer vous-même",
      });
    }
    if (!(await this.repository.userInOrganization(payload.org, userId))) {
      throw new NotFoundException({ code: "USER_NOT_IN_ORG", message: "Membre introuvable" });
    }
    if (await this.repository.isOrgOwner(payload.org, userId)) {
      throw new BadRequestException({
        code: "CANNOT_REMOVE_OWNER",
        message: "Le propriétaire de l'organisation ne peut pas être retiré",
      });
    }
    // Dernier administrateur : on ne le retire pas.
    const otherAdmins = await this.repository.countOrgAdmins(payload.org, userId);
    const adminRoleId = await this.repository.adminRoleId();
    const members = await this.repository.listMembers(payload.org);
    const target = members.find((m) => m.id === userId);
    const isAdmin = target?.roleIds.includes(adminRoleId) ?? false;
    if (isAdmin && otherAdmins === 0) {
      throw new BadRequestException({
        code: "LAST_ADMIN",
        message: "Impossible de retirer le dernier administrateur",
      });
    }

    await this.repository.removeMembership(payload.org, userId);
    this.permissions.invalidate(userId);
    await this.seats.syncSeats(payload.org);
    await this.audit.log({
      action: "member.removed",
      entityType: "user",
      entityId: userId,
      organizationId: payload.org,
      userId: payload.sub,
      before: { userId },
      ...context,
    });
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
