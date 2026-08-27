import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { permKey } from "../domain/permissions";

interface CacheEntry {
  permissions: Set<string>;
  roleKeys: string[];
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

  /** Charge (ou relit depuis le cache) rôles + permissions effectifs. */
  private async load(userId: string): Promise<CacheEntry> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            key: true,
            rolePermissions: {
              select: { permission: { select: { action: true, subject: true } } },
            },
          },
        },
      },
    });
    const permissions = new Set<string>();
    const roleKeys: string[] = [];
    for (const { role } of rows) {
      if (role.key) {
        roleKeys.push(role.key);
      }
      for (const rp of role.rolePermissions) {
        permissions.add(permKey(rp.permission.subject, rp.permission.action));
      }
    }
    const entry: CacheEntry = {
      permissions,
      roleKeys: [...new Set(roleKeys)],
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    this.cache.set(userId, entry);
    return entry;
  }

  /** Ensemble des clés de permissions effectives de l'utilisateur. */
  async getEffectivePermissions(userId: string): Promise<Set<string>> {
    return (await this.load(userId)).permissions;
  }

  /**
   * Clés des rôles courants de l'utilisateur, lues en base (et non depuis le
   * jeton) : un rôle ajouté prend effet sans reconnexion, au plus après le TTL.
   */
  async getRoleKeys(userId: string): Promise<string[]> {
    return (await this.load(userId)).roleKeys;
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
