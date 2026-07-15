import { Injectable } from "@nestjs/common";
import type { ProjectStatus, TaskStatus } from "@openppm/db";
import { PrismaService } from "../../core/prisma/prisma.service";
import type { JwtPayload } from "../auth/application/jwt-payload";

/**
 * Recherche globale (service de requêtes CQRS lecture). Recherche
 * insensible à la casse par sous-chaîne ; l'index FULLTEXT/Meilisearch
 * viendra avec la phase Enterprise.
 */
export interface SearchResults {
  projects: Array<{
    id: string;
    code: string;
    name: string;
    status: ProjectStatus;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    project: { id: string; name: string; code: string };
  }>;
}

const LIMIT_PER_TYPE = 8;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async global(payload: JwtPayload, query: string): Promise<SearchResults> {
    const [projects, tasks] = await Promise.all([
      this.prisma.project.findMany({
        where: {
          organizationId: payload.org,
          deletedAt: null,
          OR: [
            { name: { contains: query } },
            { code: { contains: query } },
            { description: { contains: query } },
          ],
        },
        select: { id: true, code: true, name: true, status: true },
        orderBy: { updatedAt: "desc" },
        take: LIMIT_PER_TYPE,
      }),
      this.prisma.task.findMany({
        where: {
          organizationId: payload.org,
          deletedAt: null,
          project: { deletedAt: null },
          OR: [
            { title: { contains: query } },
            { description: { contains: query } },
          ],
        },
        select: {
          id: true,
          title: true,
          status: true,
          project: { select: { id: true, name: true, code: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: LIMIT_PER_TYPE,
      }),
    ]);
    return { projects, tasks };
  }
}
