import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthResult, AuthService, PublicUser } from "../application/auth.service";
import { AcceptInvitationDto } from "../application/dto/accept-invitation.dto";
import { ChangePasswordDto } from "../application/dto/change-password.dto";
import { ForgotPasswordDto } from "../application/dto/forgot-password.dto";
import { LoginDto } from "../application/dto/login.dto";
import {
  DisableMfaDto,
  EnableMfaDto,
  VerifyMfaDto,
} from "../application/dto/mfa.dto";
import { RefreshDto } from "../application/dto/refresh.dto";
import { RegisterDto } from "../application/dto/register.dto";
import { ResetPasswordDto } from "../application/dto/reset-password.dto";
import { SwitchOrganizationDto } from "../application/dto/switch-organization.dto";
import { MfaService, MfaSetup } from "../application/mfa.service";
import { PermissionsService } from "../application/permissions.service";
import type { JwtPayload } from "../application/jwt-payload";
import type { RequestContext } from "../application/token.service";
import { CurrentUser } from "../infrastructure/decorators/current-user.decorator";
import { Public } from "../infrastructure/decorators/public.decorator";
import { SubscriptionAccessService } from "../../billing/application/subscription-access.service";
import { SubscriptionExempt } from "../../billing/infrastructure/subscription-exempt.decorator";

export const REFRESH_COOKIE = "oppm_rt";

/** Réponse renvoyée au client (le refresh token part aussi en cookie httpOnly). */
interface AuthResponse {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

/** Réponse de /auth/login quand le 2FA est actif : à résoudre via /auth/2fa/verify. */
interface MfaChallengeResponse {
  mfaRequired: true;
  mfaToken: string;
}

@ApiTags("auth")
@Controller("auth")
@SubscriptionExempt()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly config: ConfigService,
    private readonly permissions: PermissionsService,
    private readonly subscriptionAccess: SubscriptionAccessService,
  ) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post("register")
  @ApiOperation({ summary: "Créer une organisation et son premier compte (admin)" })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.register(dto, this.context(request));
    return this.respond(result, response);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Connexion email / mot de passe (renvoie un défi 2FA si la double authentification est active)",
  })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse | MfaChallengeResponse> {
    const outcome = await this.auth.login(dto, this.context(request));
    if (outcome.kind === "mfa_challenge") {
      return { mfaRequired: true, mfaToken: outcome.mfaToken };
    }
    return this.respond(outcome.result, response);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post("2fa/verify")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Second facteur du login : code TOTP ou code de récupération" })
  async verifyMfa(
    @Body() dto: VerifyMfaDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.completeMfaLogin(
      dto.mfaToken,
      dto.code,
      this.context(request),
    );
    return this.respond(result, response);
  }

  @Post("2fa/setup")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Initialiser le 2FA : secret TOTP + URI otpauth (QR code)" })
  setupMfa(@CurrentUser() payload: JwtPayload): Promise<MfaSetup> {
    return this.mfa.setup(payload.sub);
  }

  @Post("2fa/enable")
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Activer le 2FA avec un premier code valide ; renvoie les codes de récupération (une seule fois)",
  })
  enableMfa(
    @CurrentUser() payload: JwtPayload,
    @Body() dto: EnableMfaDto,
    @Req() request: Request,
  ): Promise<{ recoveryCodes: string[] }> {
    return this.mfa.enable(payload.sub, dto.code, this.context(request));
  }

  @Post("2fa/disable")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Désactiver le 2FA (mot de passe + code requis)" })
  async disableMfa(
    @CurrentUser() payload: JwtPayload,
    @Body() dto: DisableMfaDto,
    @Req() request: Request,
  ): Promise<void> {
    await this.mfa.disable(payload.sub, dto.password, dto.code, this.context(request));
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post("accept-invitation")
  @ApiOperation({ summary: "Créer son compte à partir d'une invitation reçue par email" })
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.acceptInvitation(dto, this.context(request));
    return this.respond(result, response);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotation du refresh token (cookie ou body)" })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const raw = dto.refreshToken ?? this.cookieToken(request) ?? "";
    const result = await this.auth.refresh(raw, this.context(request));
    return this.respond(result, response);
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Déconnexion : révoque la session (famille de tokens)" })
  async logout(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const raw = dto.refreshToken ?? this.cookieToken(request);
    await this.auth.logout(raw, this.context(request));
    response.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Profil de l'utilisateur connecté (rôles + permissions + organisations)" })
  async me(
    @CurrentUser() payload: JwtPayload,
  ): Promise<
    PublicUser & {
      permissions: string[];
      organizationId: string;
      organizations: Array<{ id: string; name: string; slug: string; isOwner: boolean }>;
      subscriptionActive: boolean;
    }
  > {
    const [user, permissions, organizations, accessLevel] = await Promise.all([
      this.auth.me(payload.sub),
      this.permissions.getEffectivePermissions(payload.sub, payload.org),
      this.auth.listOrganizations(payload.sub),
      this.subscriptionAccess.getAccessLevel(payload.org),
    ]);
    return {
      ...user,
      permissions: [...permissions].sort(),
      organizationId: payload.org,
      organizations,
      subscriptionActive: accessLevel === "full",
    };
  }

  @Post("switch-organization")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Changer d'organisation courante (ré-émet un jeton après vérification)" })
  async switchOrganization(
    @CurrentUser() payload: JwtPayload,
    @Body() dto: SwitchOrganizationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.switchOrganization(
      payload,
      dto.organizationId,
      this.context(request),
    );
    return this.respond(result, response);
  }

  @Post("change-password")
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Changer son mot de passe (toutes les sessions sont révoquées, une nouvelle est ouverte)",
  })
  async changePassword(
    @CurrentUser() payload: JwtPayload,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.changePassword(
      payload.sub,
      dto,
      this.context(request),
    );
    return this.respond(result, response);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post("forgot-password")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Demande de réinitialisation (réponse identique que l'email existe ou non)" })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<{ status: string }> {
    await this.auth.forgotPassword(dto, this.context(request));
    return { status: "accepted" };
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post("reset-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Réinitialisation du mot de passe via jeton email" })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.resetPassword(dto, this.context(request));
  }

  private respond(result: AuthResult, response: Response): AuthResponse {
    response.cookie(REFRESH_COOKIE, result.tokens.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get("NODE_ENV") === "production",
      path: "/api/v1/auth",
      expires: result.tokens.refreshExpiresAt,
    });
    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
    };
  }

  private cookieToken(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }

  private context(request: Request): RequestContext {
    return {
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    };
  }
}
