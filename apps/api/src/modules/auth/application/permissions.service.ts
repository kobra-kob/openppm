import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { permKey } from "../domain/permissions";

interface CacheEntry {
  permissions: Set<string>;
  expiresAt: number;
}

/** Durée de vie du cache des permissions effectives (ms). */
const CACHE_TTL_MS = 30_000;

/**
 * Résout les permissions effectives d'un utilisateur = union des permissions de
 * tous ses rôles (rôles cumulables). Résolution côté serveur à chaque requête,
 * avec un cache court : un changement de rôle est pris en compte sans
 * reconnexion (au plus après {@link CACHE_TTL_MS}).
 */
@Injectable()
export class PermissionsService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  /** Ensemble des clés de permissions effectives de l'utilisateur. */
  async getEffectivePermissions(userId: string): Promise<Set<string>> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.permissions;
    }
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            rolePermissions: {
              select: { permission: { select: { action: true, subject: true } } },
            },
          },
        },
      },
    });
    const permissions = new Set<string>();
    for (const { role } of rows) {
      for (const rp of role.rolePermissions) {
        permissions.add(permKey(rp.permission.subject, rp.permission.action));
      }
    }
    this.cache.set(userId, { permissions, expiresAt: Date.now() + CACHE_TTL_MS });
    return permissions;
  }

  /** Vrai si l'utilisateur possède AU MOINS une des permissions demandées. */
  async hasAny(userId: string, required: readonly string[]): Promise<boolean> {
    if (required.length === 0) {
      return true;
    }
    const permissions = await this.getEffectivePermissions(userId);
    return required.some((key) => permissions.has(key));
  }

  /** Invalide le cache d'un utilisateur (à appeler quand ses rôles changent). */
  invalidate(userId: string): void {
    this.cache.delete(userId);
  }
}
