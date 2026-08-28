import { CanActivate, ExecutionContext, HttpException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import { SubscriptionAccessService } from "../application/subscription-access.service";
import { SUBSCRIPTION_EXEMPT_KEY } from "./subscription-exempt.decorator";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Garde globale : quand l'organisation est en **lecture seule** (essai expiré /
 * abonnement suspendu), toute écriture métier est refusée (402). Les lectures
 * passent toujours, ainsi que les routes exemptées (auth, billing) pour
 * permettre de réactiver l'abonnement et de gérer sa session.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: SubscriptionAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (READ_METHODS.has(request.method)) {
      return true;
    }
    const exempt = this.reflector.getAllAndOverride<boolean>(SUBSCRIPTION_EXEMPT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (exempt) {
      return true;
    }
    const user = request.user as JwtPayload | undefined;
    if (!user) {
      return true; // route publique : rien à évaluer
    }
    const level = await this.access.getAccessLevel(user.org);
    if (level === "read_only") {
      throw new HttpException(
        {
          code: "SUBSCRIPTION_INACTIVE",
          message:
            "Abonnement inactif (essai expiré ou suspendu) : accès en lecture seule. Réactivez l'abonnement pour modifier les données.",
        },
        402,
      );
    }
    return true;
  }
}
