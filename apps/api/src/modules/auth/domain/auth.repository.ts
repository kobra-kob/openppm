import type {
  Invitation,
  Organization,
  PasswordReset,
  RefreshToken,
  Role,
  User,
} from "@openppm/db";

export type UserWithAccess = User & {
  organization: Organization;
  userRoles: Array<{ role: Role }>;
};

export interface CreateOrganizationWithOwnerInput {
  organizationName: string;
  slug: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  locale?: string;
}

export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  ip?: string;
  userAgent?: string;
}

export interface CreatePasswordResetInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface AcceptInvitationInput {
  invitationId: string;
  organizationId: string;
  roleId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  locale?: string;
}

/**
 * Port de persistance du module auth (Repository Pattern) :
 * l'application ne connaît que cette interface, Prisma reste
 * confiné dans l'implémentation d'infrastructure.
 */
export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserWithAccess | null>;
  findUserById(id: string): Promise<UserWithAccess | null>;
  isSlugTaken(slug: string): Promise<boolean>;
  createOrganizationWithOwner(
    input: CreateOrganizationWithOwnerInput,
  ): Promise<UserWithAccess>;

  registerFailedLogin(
    userId: string,
    failedLoginCount: number,
    lockedUntil: Date | null,
  ): Promise<void>;
  registerSuccessfulLogin(userId: string): Promise<void>;

  createRefreshToken(input: CreateRefreshTokenInput): Promise<RefreshToken>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | null>;
  /** Révoque le token seulement s'il est encore actif ; false si déjà révoqué (course). */
  revokeRefreshTokenIfActive(id: string): Promise<boolean>;
  revokeFamily(familyId: string): Promise<void>;
  revokeAllUserTokens(userId: string): Promise<void>;

  createPasswordReset(input: CreatePasswordResetInput): Promise<PasswordReset>;
  findActivePasswordResetByHash(tokenHash: string): Promise<PasswordReset | null>;
  /** Marque le reset utilisé + change le mot de passe, en transaction. */
  consumePasswordReset(
    resetId: string,
    userId: string,
    passwordHash: string,
  ): Promise<void>;

  findActiveInvitationByHash(tokenHash: string): Promise<Invitation | null>;
  /** Crée le compte dans l'organisation avec le rôle de l'invitation et la
   *  marque acceptée, en transaction. */
  acceptInvitation(input: AcceptInvitationInput): Promise<UserWithAccess>;

  /** Enregistre le secret TOTP en attente de confirmation (mfa_enabled reste false). */
  setMfaSecret(userId: string, secret: string): Promise<void>;
  /** Active le 2FA avec les hashes des codes de récupération. */
  enableMfa(userId: string, hashedRecoveryCodes: string[]): Promise<void>;
  /** Désactive le 2FA (secret et codes effacés). */
  disableMfa(userId: string): Promise<void>;
  /** Remplace les codes de récupération restants (consommation d'un code). */
  setRecoveryCodes(userId: string, hashedRecoveryCodes: string[]): Promise<void>;
}

export const AUTH_REPOSITORY = Symbol("AUTH_REPOSITORY");
