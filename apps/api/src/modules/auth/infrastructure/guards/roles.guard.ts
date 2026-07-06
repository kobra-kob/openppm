import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RoleKey } from "@openppm/db";
import type { Request } from "express";
import { JwtPayload } from "../../application/jwt-payload";
import { ROLES_KEY } from "../decorators/roles.decorator";

/** Guard global : applique @Roles(...) quand présent. Passe sinon. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleKey[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;
    if (!user || !required.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Droits insuffisants pour cette action",
      });
    }
    return true;
  }
}
