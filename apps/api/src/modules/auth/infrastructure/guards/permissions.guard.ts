import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PermissionsService } from "../../application/permissions.service";
import { JwtPayload } from "../../application/jwt-payload";
import { PERMISSIONS_KEY } from "../decorators/require-permissions.decorator";

/**
 * Garde globale : applique `@RequirePermissions(...)` quand présent, en résolvant
 * les permissions effectives de l'utilisateur (union de ses rôles) côté serveur.
 * Passe si aucune permission n'est requise sur la route.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;
    if (!user || !(await this.permissions.hasAny(user.sub, required))) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Permission insuffisante pour cette action",
      });
    }
    return true;
  }
}
