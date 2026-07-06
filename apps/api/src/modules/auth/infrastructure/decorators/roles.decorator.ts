import { SetMetadata } from "@nestjs/common";
import type { RoleKey } from "@openppm/db";

export const ROLES_KEY = "roles";

/** Restreint une route aux rôles donnés (clés des rôles système). */
export const Roles = (...roles: RoleKey[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
