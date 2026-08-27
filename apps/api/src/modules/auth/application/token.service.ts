import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { AUTH_REPOSITORY } from "../domain/auth.repository";
import type { AuthRepository, UserWithAccess } from "../domain/auth.repository";
import { JwtPayload } from "./jwt-payload";

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class TokenService {
  private readonly refreshTtlDays: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
  ) {
    this.refreshTtlDays = this.config.get<number>("REFRESH_TTL_DAYS") ?? 30;
  }

  hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  buildPayload(
    user: UserWithAccess,
    organizationId?: string,
  ): Omit<JwtPayload, "iat" | "exp"> {
    return {
      sub: user.id,
      email: user.email,
      // Org courante = organisation choisie (switch) sinon l'org d'origine.
      org: organizationId ?? user.organizationId,
      roles: user.userRoles
        .map((userRole) => userRole.role.key)
        .filter((key): key is NonNullable<typeof key> => key !== null),
      name: `${user.firstName} ${user.lastName}`,
    };
  }

  /**
   * Émet un couple access/refresh. `familyId` absent = nouvelle session
   * (login) ; présent = rotation au sein de la même famille (refresh).
   * `organizationId` permet d'émettre pour une org différente (switch tenant).
   */
  async issueTokens(
    user: UserWithAccess,
    context: RequestContext = {},
    familyId?: string,
    organizationId?: string,
  ): Promise<IssuedTokens> {
    const accessToken = await this.jwt.signAsync(this.buildPayload(user, organizationId));
    const refreshToken = randomBytes(48).toString("base64url");
    const refreshExpiresAt = new Date(
      Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000,
    );
    await this.repository.createRefreshToken({
      userId: user.id,
      tokenHash: this.hashToken(refreshToken),
      familyId: familyId ?? randomUUID(),
      expiresAt: refreshExpiresAt,
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return { accessToken, refreshToken, refreshExpiresAt };
  }
}
