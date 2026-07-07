import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { JwtPayload } from "../../application/jwt-payload";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

/** Guard global : toute route exige un Bearer JWT sauf si @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
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
    request.user = payload;
    return true;
  }
}
