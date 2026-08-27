import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { PermissionsService } from "../../application/permissions.service";
import { JwtPayload } from "../../application/jwt-payload";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

/** Guard global : toute route exige un Bearer JWT sauf si @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : undefined;
    if (!token) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Jeton d'accès requis",
      });
    }
    let payload: JwtPayload & { scope?: string };
    try {
      payload = await this.jwt.verifyAsync<JwtPayload & { scope?: string }>(token);
    } catch {
      throw new UnauthorizedException({
        code: "TOKEN_EXPIRED",
        message: "Jeton d'accès invalide ou expiré",
      });
    }
    // Un jeton de défi 2FA (scope "mfa") ne donne accès à aucune ressource.
    if (payload.scope) {
      throw new UnauthorizedException({
        code: "TOKEN_EXPIRED",
        message: "Jeton d'accès invalide ou expiré",
      });
    }
    // Rôles relus en base : un rôle attribué ou retiré prend effet sans
    // reconnexion (le jeton, lui, fige les rôles émis à la connexion).
    try {
      const roleKeys = await this.permissions.getRoleKeys(payload.sub);
      if (roleKeys.length > 0) {
        payload.roles = roleKeys;
      }
    } catch {
      // En cas d'échec de lecture, on conserve les rôles du jeton (dégradé).
    }

    request.user = payload;
    return true;
  }
}
