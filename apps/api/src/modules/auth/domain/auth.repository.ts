import type {
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
}

export const AUTH_REPOSITORY = Symbol("AUTH_REPOSITORY");
