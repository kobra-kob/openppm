import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { AuditService } from "../../../core/audit/audit.service";
import { MailerService } from "../../../core/mailer/mailer.service";
import { BillingSeatService } from "../../billing/application/billing-seat.service";
import { AUTH_REPOSITORY } from "../domain/auth.repository";
import type { AuthRepository, UserWithAccess } from "../domain/auth.repository";
import { computeLockedUntil } from "../domain/lockout.policy";
import { passwordPolicyErrors } from "../domain/password.policy";
import { slugify } from "../domain/slug";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { MfaService } from "./mfa.service";
import { IssuedTokens, RequestContext, TokenService } from "./token.service";

const PASSWORD_RESET_TTL_MINUTES = 60;

export interface AuthResult {
  user: PublicUser;
  tokens: IssuedTokens;
}

/** Résultat de /auth/login : session directe, ou défi 2FA à résoudre. */
export type LoginOutcome =
  | { kind: "session"; result: AuthResult }
  | { kind: "mfa_challenge"; mfaToken: string };

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  locale: string;
  mfaEnabled: boolean;
  roles: string[];
  organization: { id: string; name: string; slug: string };
}

@Injectable()
export class AuthService {
  /** Hash factice vérifié quand l'email est inconnu, pour limiter
   *  l'énumération de comptes par mesure du temps de réponse. */
  private readonly dummyHash: Promise<string> = argon2.hash(
    randomBytes(16).toString("hex"),
  );

  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly mfa: MfaService,
    private readonly seats: BillingSeatService,
  ) {}

  toPublicUser(user: UserWithAccess): PublicUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      locale: user.locale,
      mfaEnabled: user.mfaEnabled,
      roles: user.userRoles
        .map((userRole) => userRole.role.key)
        .filter((key): key is NonNullable<typeof key> => key !== null),
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
      },
    };
  }

  async register(dto: RegisterDto, context: RequestContext): Promise<AuthResult> {
    const policyErrors = passwordPolicyErrors(dto.password);
    if (policyErrors.length > 0) {
      throw new BadRequestException({
        code: "PASSWORD_POLICY",
        message: "Le mot de passe ne respecte pas la politique de sécurité",
        errors: policyErrors,
      });
    }
    const existing = await this.repository.findUserByEmail(dto.email);
    if (existing) {
      throw new ConflictException({
        code: "EMAIL_ALREADY_USED",
        message: "Un compte existe déjà avec cet email",
      });
    }
    const slug = await this.availableSlug(dto.organizationName);
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const user = await this.repository.createOrganizationWithOwner({
      organizationName: dto.organizationName,
      slug,
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      locale: dto.locale,
    });
    await this.audit.log({
      action: "auth.register",
      entityType: "user",
      entityId: user.id,
      organizationId: user.organizationId,
      userId: user.id,
      after: { email: user.email, organization: slug },
      ...context,
    });
    return { user: this.toPublicUser(user), tokens: await this.tokens.issueTokens(user, context) };
  }

  async login(dto: LoginDto, context: RequestContext): Promise<LoginOutcome> {
    const user = await this.repository.findUserByEmail(dto.email);
    if (!user || user.deletedAt) {
      await argon2.verify(await this.dummyHash, dto.password).catch(() => false);
      throw this.invalidCredentials();
    }
    if (!user.isActive) {
      throw new ForbiddenException({
        code: "ACCOUNT_DISABLED",
        message: "Compte désactivé",
      });
    }
    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      await this.audit.log({
        action: "auth.login.locked",
        entityType: "user",
        entityId: user.id,
        organizationId: user.organizationId,
        ...context,
      });
      throw new HttpException(
        {
          code: "ACCOUNT_LOCKED",
          message: "Compte temporairement verrouillé après trop d'échecs",
          retryAfterSeconds: Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000),
        },
        HttpStatus.LOCKED,
      );
    }

    const passwordOk = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
    if (!passwordOk) {
      const failedLoginCount = user.failedLoginCount + 1;
      const lockedUntil = computeLockedUntil(failedLoginCount, now);
      await this.repository.registerFailedLogin(user.id, failedLoginCount, lockedUntil);
      await this.audit.log({
        action: "auth.login.failed",
        entityType: "user",
        entityId: user.id,
        organizationId: user.organizationId,
        after: { failedLoginCount, locked: lockedUntil !== null },
        ...context,
      });
      throw this.invalidCredentials();
    }

    if (user.mfaEnabled) {
      // Le mot de passe est bon : compteur d'échecs remis à zéro, mais la
      // session n'est émise qu'après validation du second facteur.
      await this.repository.registerFailedLogin(user.id, 0, null);
      await this.audit.log({
        action: "auth.login.mfa_challenge",
        entityType: "user",
        entityId: user.id,
        organizationId: user.organizationId,
        ...context,
      });
      return {
        kind: "mfa_challenge",
        mfaToken: await this.mfa.issueChallengeToken(user.id),
      };
    }

    await this.repository.registerSuccessfulLogin(user.id);
    await this.audit.log({
      action: "auth.login.success",
      entityType: "user",
      entityId: user.id,
      organizationId: user.organizationId,
      userId: user.id,
      ...context,
    });
    return {
      kind: "session",
      result: {
        user: this.toPublicUser(user),
        tokens: await this.tokens.issueTokens(user, context),
      },
    };
  }

  /** Second facteur du login : code TOTP ou code de récupération. */
  async completeMfaLogin(
    mfaToken: string,
    code: string,
    context: RequestContext,
  ): Promise<AuthResult> {
    const user = await this.mfa.validateChallenge(mfaToken, code, context);
    await this.repository.registerSuccessfulLogin(user.id);
    await this.audit.log({
      action: "auth.login.success",
      entityType: "user",
      entityId: user.id,
      organizationId: user.organizationId,
      userId: user.id,
      after: { mfa: true },
      ...context,
    });
    return {
      user: this.toPublicUser(user),
      tokens: await this.tokens.issueTokens(user, context),
    };
  }

  /** Création de compte via invitation : rejoint l'organisation avec le rôle pré-assigné. */
  async acceptInvitation(
    dto: AcceptInvitationDto,
    context: RequestContext,
  ): Promise<AuthResult> {
    const policyErrors = passwordPolicyErrors(dto.password);
    if (policyErrors.length > 0) {
      throw new BadRequestException({
        code: "PASSWORD_POLICY",
        message: "Le mot de passe ne respecte pas la politique de sécurité",
        errors: policyErrors,
      });
    }
    const invitation = await this.repository.findActiveInvitationByHash(
      this.tokens.hashToken(dto.token),
    );
    if (!invitation) {
      throw new BadRequestException({
        code: "INVALID_INVITATION",
        message: "Invitation invalide, expirée ou déjà utilisée",
      });
    }
    if (await this.repository.findUserByEmail(invitation.email)) {
      throw new ConflictException({
        code: "EMAIL_ALREADY_USED",
        message: "Un compte existe déjà avec cet email",
      });
    }
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const user = await this.repository.acceptInvitation({
      invitationId: invitation.id,
      organizationId: invitation.organizationId,
      roleId: invitation.roleId,
      email: invitation.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      locale: dto.locale,
    });
    // Nouveau membre → recalcule les sièges facturés de l'organisation.
    await this.seats.syncSeats(invitation.organizationId);
    await this.audit.log({
      action: "auth.invitation_accepted",
      entityType: "user",
      entityId: user.id,
      organizationId: user.organizationId,
      userId: user.id,
      after: { email: user.email, invitationId: invitation.id },
      ...context,
    });
    return {
      user: this.toPublicUser(user),
      tokens: await this.tokens.issueTokens(user, context),
    };
  }

  /** Organisations accessibles au compte (sélecteur de tenant). */
  listOrganizations(userId: string) {
    return this.repository.listUserOrganizations(userId);
  }

  /**
   * Change l'organisation courante : ré-émet un jeton pour l'org cible, après
   * vérification d'un membership ACTIF. Le front ne peut jamais imposer l'org.
   * Une tentative sur une org non membre est refusée et auditée.
   */
  async switchOrganization(
    payload: { sub: string; org: string },
    organizationId: string,
    context: RequestContext,
  ): Promise<AuthResult> {
    const orgs = await this.repository.listUserOrganizations(payload.sub);
    const target = orgs.find((o) => o.id === organizationId);
    if (!target) {
      await this.audit.log({
        action: "security.cross_tenant_access_attempt",
        entityType: "organization",
        entityId: organizationId,
        organizationId: payload.org,
        userId: payload.sub,
        after: { attemptedOrganizationId: organizationId },
        ...context,
      });
      throw new ForbiddenException({
        code: "NOT_A_MEMBER",
        message: "Vous n'appartenez pas à cette organisation",
      });
    }
    const user = await this.repository.findUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Compte introuvable" });
    }
    const tokens = await this.tokens.issueTokens(user, context, undefined, organizationId);
    await this.audit.log({
      action: "auth.organization_switched",
      entityType: "organization",
      entityId: organizationId,
      organizationId,
      userId: payload.sub,
      after: { organizationId },
      ...context,
    });
    return {
      user: {
        ...this.toPublicUser(user),
        organization: { id: target.id, name: target.name, slug: target.slug },
      },
      tokens,
    };
  }

  async refresh(rawToken: string, context: RequestContext): Promise<AuthResult> {
    const stored = await this.repository.findRefreshTokenByHash(
      this.tokens.hashToken(rawToken),
    );
    if (!stored) {
      throw this.invalidRefresh();
    }
    if (stored.revokedAt) {
      // Réutilisation d'un token déjà consommé : vol probable — on révoque
      // toute la famille issue du même login.
      await this.repository.revokeFamily(stored.familyId);
      await this.audit.log({
        action: "auth.refresh.reuse_detected",
        entityType: "refresh_token",
        entityId: stored.id,
        userId: stored.userId,
        ...context,
      });
      throw this.invalidRefresh();
    }
    if (stored.expiresAt <= new Date()) {
      throw this.invalidRefresh();
    }
    const rotated = await this.repository.revokeRefreshTokenIfActive(stored.id);
    if (!rotated) {
      await this.repository.revokeFamily(stored.familyId);
      throw this.invalidRefresh();
    }
    const user = await this.repository.findUserById(stored.userId);
    if (!user || !user.isActive || user.deletedAt) {
      throw this.invalidRefresh();
    }
    return {
      user: this.toPublicUser(user),
      // Préserve l'organisation courante à travers la rotation du refresh.
      tokens: await this.tokens.issueTokens(
        user,
        context,
        stored.familyId,
        stored.organizationId ?? undefined,
      ),
    };
  }

  async logout(rawToken: string | undefined, context: RequestContext): Promise<void> {
    if (!rawToken) {
      return;
    }
    const stored = await this.repository.findRefreshTokenByHash(
      this.tokens.hashToken(rawToken),
    );
    if (!stored) {
      return;
    }
    await this.repository.revokeFamily(stored.familyId);
    await this.audit.log({
      action: "auth.logout",
      entityType: "user",
      entityId: stored.userId,
      userId: stored.userId,
      ...context,
    });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.repository.findUserById(userId);
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Session invalide" });
    }
    return this.toPublicUser(user);
  }

  /** Modification de son identité (prénom / nom) depuis la page Compte. */
  async updateProfile(
    userId: string,
    dto: { firstName: string; lastName: string },
    context: RequestContext,
  ): Promise<PublicUser> {
    const user = await this.repository.findUserById(userId);
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Session invalide",
      });
    }
    const updated = await this.repository.updateProfile(userId, {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
    });
    await this.audit.log({
      action: "auth.profile.updated",
      entityType: "user",
      entityId: userId,
      organizationId: user.organizationId,
      userId,
      before: { firstName: user.firstName, lastName: user.lastName },
      after: { firstName: updated.firstName, lastName: updated.lastName },
      ...context,
    });
    return this.toPublicUser(updated);
  }

  /**
   * Changement de mot de passe depuis le compte : vérifie l'actuel, applique
   * la politique, révoque toutes les sessions et rouvre une session fraîche.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    context: RequestContext,
  ): Promise<AuthResult> {
    const user = await this.repository.findUserById(userId);
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Session invalide",
      });
    }
    const currentOk = await argon2
      .verify(user.passwordHash, dto.currentPassword)
      .catch(() => false);
    if (!currentOk) {
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "Mot de passe actuel incorrect",
      });
    }
    const policyErrors = passwordPolicyErrors(dto.newPassword);
    if (policyErrors.length > 0) {
      throw new BadRequestException({
        code: "PASSWORD_POLICY",
        message: "Le mot de passe ne respecte pas la politique de sécurité",
        errors: policyErrors,
      });
    }
    const passwordHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
    await this.repository.changePassword(user.id, passwordHash);
    await this.audit.log({
      action: "auth.password.changed",
      entityType: "user",
      entityId: user.id,
      organizationId: user.organizationId,
      userId: user.id,
      ...context,
    });
    return {
      user: this.toPublicUser(user),
      tokens: await this.tokens.issueTokens(user, context),
    };
  }

  /** Répond toujours pareil, que l'email existe ou non (anti-énumération). */
  async forgotPassword(dto: ForgotPasswordDto, context: RequestContext): Promise<void> {
    const user = await this.repository.findUserByEmail(dto.email);
    if (!user || !user.isActive || user.deletedAt) {
      return;
    }
    const rawToken = randomBytes(32).toString("base64url");
    await this.repository.createPasswordReset({
      userId: user.id,
      tokenHash: createHash("sha256").update(rawToken).digest("hex"),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
    });
    const appUrl = this.config.get<string>("APP_URL") ?? "http://localhost:3000";
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
    await this.mailer.send({
      to: user.email,
      subject: "OpenPPM — Réinitialisation de votre mot de passe",
      text: `Bonjour ${user.firstName},\n\nPour réinitialiser votre mot de passe, ouvrez ce lien (valable ${PASSWORD_RESET_TTL_MINUTES} minutes) :\n${resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
    });
    await this.audit.log({
      action: "auth.password.reset_requested",
      entityType: "user",
      entityId: user.id,
      organizationId: user.organizationId,
      ...context,
    });
  }

  async resetPassword(dto: ResetPasswordDto, context: RequestContext): Promise<void> {
    const policyErrors = passwordPolicyErrors(dto.password);
    if (policyErrors.length > 0) {
      throw new BadRequestException({
        code: "PASSWORD_POLICY",
        message: "Le mot de passe ne respecte pas la politique de sécurité",
        errors: policyErrors,
      });
    }
    const reset = await this.repository.findActivePasswordResetByHash(
      createHash("sha256").update(dto.token).digest("hex"),
    );
    if (!reset) {
      throw new BadRequestException({
        code: "INVALID_RESET_TOKEN",
        message: "Lien de réinitialisation invalide ou expiré",
      });
    }
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    await this.repository.consumePasswordReset(reset.id, reset.userId, passwordHash);
    await this.audit.log({
      action: "auth.password.reset",
      entityType: "user",
      entityId: reset.userId,
      userId: reset.userId,
      ...context,
    });
  }

  private async availableSlug(organizationName: string): Promise<string> {
    const base = slugify(organizationName);
    if (!(await this.repository.isSlugTaken(base))) {
      return base;
    }
    for (let suffix = 2; suffix <= 50; suffix += 1) {
      const candidate = `${base.slice(0, 60 - `-${suffix}`.length)}-${suffix}`;
      if (!(await this.repository.isSlugTaken(candidate))) {
        return candidate;
      }
    }
    throw new ConflictException({
      code: "SLUG_UNAVAILABLE",
      message: "Impossible de générer un identifiant unique pour cette organisation",
    });
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: "INVALID_CREDENTIALS",
      message: "Identifiants invalides",
    });
  }

  private invalidRefresh(): UnauthorizedException {
    return new UnauthorizedException({
      code: "INVALID_REFRESH_TOKEN",
      message: "Session expirée, reconnectez-vous",
    });
  }
}
