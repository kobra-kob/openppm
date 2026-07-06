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
import { ForgotPasswordDto } from "../application/dto/forgot-password.dto";
import { LoginDto } from "../application/dto/login.dto";
import { RefreshDto } from "../application/dto/refresh.dto";
import { RegisterDto } from "../application/dto/register.dto";
import { ResetPasswordDto } from "../application/dto/reset-password.dto";
import type { JwtPayload } from "../application/jwt-payload";
import type { RequestContext } from "../application/token.service";
import { CurrentUser } from "../infrastructure/decorators/current-user.decorator";
import { Public } from "../infrastructure/decorators/public.decorator";

export const REFRESH_COOKIE = "oppm_rt";

/** Réponse renvoyée au client (le refresh token part aussi en cookie httpOnly). */
interface AuthResponse {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
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
  @ApiOperation({ summary: "Connexion email / mot de passe" })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.login(dto, this.context(request));
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
  @ApiOperation({ summary: "Profil de l'utilisateur connecté" })
  me(@CurrentUser() payload: JwtPayload): Promise<PublicUser> {
    return this.auth.me(payload.sub);
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
