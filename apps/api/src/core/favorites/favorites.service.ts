import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type FavoriteEntityType = "project";

export interface FavoriteView {
  entityType: FavoriteEntityType;
  entityId: string;
  code: string;
  name: string;
}

/**
 * Favoris par utilisateur (polymorphes). Phase 1 : projets uniquement,
 * la vérification d'existence est scellée au tenant du demandeur.
 */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async add(
    userId: string,
    organizationId: string,
    entityType: FavoriteEntityType,
    entityId: string,
  ): Promise<void> {
    await this.assertEntityExists(organizationId, entityType, entityId);
    await this.prisma.favorite.upsert({
      where: { userId_entityType_entityId: { userId, entityType, entityId } },
      update: {},
      create: { userId, entityType, entityId },
    });
  }

  async remove(
    userId: string,
    entityType: FavoriteEntityType,
    entityId: string,
  ): Promise<void> {
    await this.prisma.favorite.deleteMany({
      where: { userId, entityType, entityId },
    });
  }

  /** Ids favoris d'un utilisateur pour un type — pour poser les drapeaux isFavorite. */
  async idsFor(userId: string, entityType: FavoriteEntityType): Promise<Set<string>> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId, entityType },
      select: { entityId: true },
    });
    return new Set(rows.map((row) => row.entityId));
  }

  /** Liste enrichie pour la sidebar (projets non supprimés uniquement). */
  async list(userId: string, organizationId: string): Promise<FavoriteView[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId, entityType: "project" },
      orderBy: { createdAt: "desc" },
    });
    if (rows.length === 0) {
      return [];
    }
    const projects = await this.prisma.project.findMany({
      where: {
        id: { in: rows.map((row) => row.entityId) },
        organizationId,
        deletedAt: null,
      },
      select: { id: true, code: true, name: true },
    });
    const byId = new Map(projects.map((project) => [project.id, project]));
    return rows.flatMap((row) => {
      const project = byId.get(row.entityId);
      return project
        ? [{ entityType: "project" as const, entityId: project.id, code: project.code, name: project.name }]
        : [];
    });
  }

  private async assertEntityExists(
    organizationId: string,
    entityType: FavoriteEntityType,
    entityId: string,
  ): Promise<void> {
    if (entityType === "project") {
      const found = await this.prisma.project.findFirst({
        where: { id: entityId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (found) {
        return;
      }
    }
    throw new NotFoundException({
      code: "FAVORITE_TARGET_NOT_FOUND",
      message: "Élément introuvable",
    });
  }
}
