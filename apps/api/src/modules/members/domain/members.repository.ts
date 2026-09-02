import type { Invitation, Role, RoleKey } from "@openppm/db";

export interface MemberSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  /** Clés des rôles système (les rôles personnalisés n'ont pas de clé). */
  roles: RoleKey[];
  /** Identifiants de TOUS les rôles (système + personnalisés) — pour l'édition. */
  roleIds: string[];
}

export type InvitationWithRelations = Invitation & {
  role: Role;
  invitedBy: { firstName: string; lastName: string };
};

export interface CreateInvitationInput {
  organizationId: string;
  email: string;
  roleId: string;
  tokenHash: string;
  expiresAt: Date;
  invitedById: string;
}

export interface MembersRepository {
  listMembers(organizationId: string): Promise<MemberSummary[]>;
  listPendingInvitations(organizationId: string): Promise<InvitationWithRelations[]>;
  findRoleByKey(key: RoleKey): Promise<Role | null>;
  emailHasAccount(email: string): Promise<boolean>;
  /** Compte existant par email (pour l'ajout d'un membre déjà inscrit ailleurs). */
  findAccountByEmail(email: string): Promise<{ id: string; deletedAt: Date | null } | null>;
  /** Ajoute (ou réactive) un membership pour un compte existant, avec un rôle. */
  addExistingMember(organizationId: string, userId: string, roleId: string): Promise<void>;
  hasPendingInvitation(organizationId: string, email: string): Promise<boolean>;
  createInvitation(input: CreateInvitationInput): Promise<Invitation>;
  findPendingInvitationById(
    id: string,
    organizationId: string,
  ): Promise<Invitation | null>;
  deleteInvitation(id: string): Promise<void>;

  // ── Gestion des rôles d'un membre (multi-rôles) ──────────────────────
  /** Vrai si l'utilisateur appartient à l'organisation (non supprimé). */
  userInOrganization(organizationId: string, userId: string): Promise<boolean>;
  /** Ids des rôles attribuables dans l'org : rôles système + rôles perso actifs de l'org. */
  assignableRoleIds(organizationId: string): Promise<Set<string>>;
  /** Id du rôle système Administrateur. */
  adminRoleId(): Promise<string>;
  /** Nombre d'utilisateurs actifs de l'org ayant le rôle admin, hors utilisateur donné. */
  countOrgAdmins(organizationId: string, excludeUserId: string): Promise<number>;
  /** Remplace intégralement les rôles d'un utilisateur. */
  setUserRoles(userId: string, organizationId: string, roleIds: string[]): Promise<void>;
  /** Vrai si l'utilisateur est le propriétaire de l'organisation. */
  isOrgOwner(organizationId: string, userId: string): Promise<boolean>;
  /** Retire un membre de l'organisation (membership REMOVED + rôles nettoyés). */
  removeMembership(organizationId: string, userId: string): Promise<void>;
}

export const MEMBERS_REPOSITORY = Symbol("MEMBERS_REPOSITORY");
