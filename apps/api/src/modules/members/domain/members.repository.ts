import type { Invitation, Role, RoleKey } from "@openppm/db";

export interface MemberSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  roles: RoleKey[];
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
  hasPendingInvitation(organizationId: string, email: string): Promise<boolean>;
  createInvitation(input: CreateInvitationInput): Promise<Invitation>;
  findPendingInvitationById(
    id: string,
    organizationId: string,
  ): Promise<Invitation | null>;
  deleteInvitation(id: string): Promise<void>;
}

export const MEMBERS_REPOSITORY = Symbol("MEMBERS_REPOSITORY");
