import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { AuditService } from "../../../core/audit/audit.service";
import { AUTH_REPOSITORY } from "../domain/auth.repository";
import {
  buildOtpauthUri,
  generateTotpSecret,
  verifyTotp,
} from "../domain/totp";
import type { AuthRepository, UserWithAccess } from "../domain/auth.repository";
import type { RequestContext } from "./token.service";

const RECOVERY_CODE_COUNT = 8;
const MFA_TOKEN_TTL_SECONDS = 300;
const TOTP_ISSUER = "OpenPPM";

export interface MfaSetup {
  secret: string;
  otpauthUrl: string;
}

/** Payload du jeton intermédiaire émis entre mot de passe et code TOTP. */
export interface MfaChallengePayload {
  sub: string;
  scope: "mfa";
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

@Injectable()
export class MfaService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  /** Génère le secret TOTP en attente ; le 2FA reste inactif jusqu'à `enable`. */
  async setup(userId: string): Promise<MfaSetup> {
    const user = await this.requireUser(userId);
    if (user.mfaEnabled) {
      throw new ConflictException({
        code: "MFA_ALREADY_ENABLED",
        message: "La double authentification est déjà active",
      });
    }
    const secret = generateTotpSecret();
    await this.repository.setMfaSecret(userId, secret);
    return {
      secret,
      otpauthUrl: buildOtpauthUri(user.email, TOTP_ISSUER, secret),
    };
  }

  /** Confirme le setup avec un premier code valide et remet les codes de récupération (affichés une seule fois). */
  async enable(
    userId: string,
    code: string,
    context: RequestContext,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.requireUser(userId);
    if (user.mfaEnabled) {
      throw new ConflictException({
        code: "MFA_ALREADY_ENABLED",
        message: "La double authentification est déjà active",
      });
    }
    if (!user.mfaSecret) {
      throw new BadRequestException({
        code: "MFA_SETUP_REQUIRED",
        message: "Initialiser d'abord le 2FA via /auth/2fa/setup",
      });
    }
    if (!verifyTotp(user.mfaSecret, code)) {
      throw new BadRequestException({
        code: "INVALID_MFA_CODE",
        message: "Code de vérification invalide",
      });
    }
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      randomBytes(5).toString("hex"),
    );
    await this.repository.enableMfa(userId, recoveryCodes.map(hashRecoveryCode));
    await this.audit.log({
      action: "auth.mfa.enabled",
      entityType: "user",
      entityId: userId,
      organizationId: user.organizationId,
      userId,
      ...context,
    });
    return { recoveryCodes };
  }

  async disable(
    userId: string,
    password: string,
    code: string,
    context: RequestContext,
  ): Promise<void> {
    const user = await this.requireUser(userId);
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException({
        code: "MFA_NOT_ENABLED",
        message: "La double authentification n'est pas active",
      });
    }
    const passwordOk = await argon2
      .verify(user.passwordHash, password)
      .catch(() => false);
    if (!passwordOk || !verifyTotp(user.mfaSecret, code)) {
      throw new UnauthorizedException({
        code: "INVALID_MFA_CODE",
        message: "Mot de passe ou code invalide",
      });
    }
    await this.repository.disableMfa(userId);
    await this.audit.log({
      action: "auth.mfa.disabled",
      entityType: "user",
      entityId: userId,
      organizationId: user.organizationId,
      userId,
      ...context,
    });
  }

  /** Émet le jeton de défi renvoyé par /auth/login quand le 2FA est actif. */
  issueChallengeToken(userId: string): Promise<string> {
    const payload: MfaChallengePayload = { sub: userId, scope: "mfa" };
    return this.jwt.signAsync(payload, { expiresIn: MFA_TOKEN_TTL_SECONDS });
  }

  /**
   * Valide le second facteur (code TOTP ou code de récupération, consommé)
   * et rend l'utilisateur prêt pour l'émission de session.
   */
  async validateChallenge(
    mfaToken: string,
    code: string,
    context: RequestContext,
  ): Promise<UserWithAccess> {
    let payload: MfaChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<MfaChallengePayload>(mfaToken);
    } catch {
      throw new UnauthorizedException({
        code: "MFA_CHALLENGE_EXPIRED",
        message: "Défi expiré, reconnectez-vous",
      });
    }
    if (payload.scope !== "mfa") {
      throw new UnauthorizedException({
        code: "MFA_CHALLENGE_EXPIRED",
        message: "Défi invalide, reconnectez-vous",
      });
    }
    const user = await this.requireUser(payload.sub);
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException({
        code: "MFA_NOT_ENABLED",
        message: "La double authentification n'est pas active",
      });
    }

    if (verifyTotp(user.mfaSecret, code)) {
      return user;
    }
    if (await this.consumeRecoveryCode(user, code, context)) {
      return user;
    }

    await this.audit.log({
      action: "auth.mfa.failed",
      entityType: "user",
      entityId: user.id,
      organizationId: user.organizationId,
      ...context,
    });
    throw new UnauthorizedException({
      code: "INVALID_MFA_CODE",
      message: "Code de vérification invalide",
    });
  }

  private async consumeRecoveryCode(
    user: UserWithAccess,
    code: string,
    context: RequestContext,
  ): Promise<boolean> {
    const stored = Array.isArray(user.mfaRecoveryCodes)
      ? (user.mfaRecoveryCodes as string[])
      : [];
    const hash = hashRecoveryCode(code);
    if (!stored.includes(hash)) {
      return false;
    }
    await this.repository.setRecoveryCodes(
      user.id,
      stored.filter((entry) => entry !== hash),
    );
    await this.audit.log({
      action: "auth.mfa.recovery_code_used",
      entityType: "user",
      entityId: user.id,
      organizationId: user.organizationId,
      userId: user.id,
      after: { remaining: stored.length - 1 },
      ...context,
    });
    return true;
  }

  private async requireUser(userId: string): Promise<UserWithAccess> {
    const user = await this.repository.findUserById(userId);
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Session invalide",
      });
    }
    return user;
  }
}
