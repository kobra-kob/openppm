import { Injectable } from "@nestjs/common";
import { MembershipStatus } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { permKey } from "../domain/permissions";

interface CacheEntry {
  permissions: Set<string>;
  roleKeys: string[];
  expiresAt: number;
}

/** Durée de vie du cache des permissions effectives (ms). */
const CACHE_TTL_MS = 30_000;

/** Forme d'un rôle chargé avec ses permissions. */
type RoleWithPerms = {
  key: string | null;
  rolePermissions: Array<{ permission: { subject: string; action: string } }>;
};

/**
 * Résout les **rôles et permissions effectifs d'un utilisateur dans le contexte
 * d'une organisation** (SaaS multi-tenant). Source de vérité : les rôles de son
 * `OrganizationMembership` actif pour cette org. Repli sur les rôles globaux
 * (`user_roles`) uniquement lorsqu'aucun membership n'existe encore (transition).
 * Résolution côté serveur à chaque requête, cache court (clé `userId:org`) ; un
 * changement de rôle est pris en compte sans reconnexion.
 */
@Injectable()
export class PermissionsService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  private key(userId: string, organizationId: string): string {
    return `${userId}:${organizationId}`;
  }

  private async loadRoles(userId: string, organizationId: string): Promise<RoleWithPerms[]> {
    const roleSelect = {
      key: true,
      rolePermissions: {
        select: { permission: { select: { action: true, subject: true } } },
      },
    } as const;

    const membership = await this.prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: {
        status: true,
        roles: { select: { role: { select: roleSelect } } },
      },
    });

    if (membership) {
      // Membre suspendu / retiré : aucun droit dans cette organisation.
      if (membership.status !== MembershipStatus.ACTIVE) {
        return [];
      }
      return membership.roles.map((r) => r.role);
    }

    // Transition : pas encore de membership → rôles globaux hérités.
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: roleSelect } },
    });
    return rows.map((r) => r.role);
  }

  /** Charge (ou relit depuis le cache) rôles + permissions effectifs pour l'org. */
  private async load(userId: string, organizationId: string): Promise<CacheEntry> {
    const cacheKey = this.key(userId, organizationId);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }
    const roles = await this.loadRoles(userId, organizationId);
    const permissions = new Set<string>();
    const roleKeys: string[] = [];
    for (const role of roles) {
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
    this.cache.set(cacheKey, entry);
    return entry;
  }

  /** Ensemble des clés de permissions effectives de l'utilisateur dans l'org. */
  async getEffectivePermissions(userId: string, organizationId: string): Promise<Set<string>> {
    return (await this.load(userId, organizationId)).permissions;
  }

  /**
   * Clés des rôles courants de l'utilisateur dans l'org, lues en base (et non
   * depuis le jeton) : un rôle ajouté/retiré prend effet sans reconnexion.
   */
  async getRoleKeys(userId: string, organizationId: string): Promise<string[]> {
    return (await this.load(userId, organizationId)).roleKeys;
  }

  /** Vrai si l'utilisateur possède AU MOINS une des permissions demandées. */
  async hasAny(
    userId: string,
    organizationId: string,
    required: readonly string[],
  ): Promise<boolean> {
    if (required.length === 0) {
      return true;
    }
    const permissions = await this.getEffectivePermissions(userId, organizationId);
    return required.some((k) => permissions.has(k));
  }

  /** Invalide le cache d'un utilisateur (toutes ses organisations). */
  invalidate(userId: string): void {
    const prefix = `${userId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}
