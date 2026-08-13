import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "../../domain/permissions";

export const PERMISSIONS_KEY = "required_permissions";

/**
 * Restreint une route aux utilisateurs possédant AU MOINS une des permissions
 * données (via l'un de leurs rôles). Le contrôle final est toujours côté back.
 */
export const RequirePermissions = (
  ...permissions: PermissionKey[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);
