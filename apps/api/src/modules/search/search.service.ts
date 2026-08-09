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
  demands: Array<{
    id: string;
    reference: string;
    title: string;
    /** Projet issu de la conversion, si la demande a déjà été convertie. */
    projectId: string | null;
  }>;
}

const LIMIT_PER_TYPE = 8;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async global(payload: JwtPayload, query: string): Promise<SearchResults> {
    const [projects, tasks, demands] = await Promise.all([
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
      this.prisma.demand.findMany({
        where: {
          organizationId: payload.org,
          deletedAt: null,
          OR: [
            { title: { contains: query } },
            { reference: { contains: query } },
            { description: { contains: query } },
          ],
        },
        select: {
          id: true,
          reference: true,
          title: true,
          project: { select: { id: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: LIMIT_PER_TYPE,
      }),
    ]);
    return {
      projects,
      tasks,
      demands: demands.map((demand) => ({
        id: demand.id,
        reference: demand.reference,
        title: demand.title,
        projectId: demand.project?.id ?? null,
      })),
    };
  }
}
