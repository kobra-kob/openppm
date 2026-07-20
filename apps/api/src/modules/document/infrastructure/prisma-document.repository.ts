import { Injectable } from "@nestjs/common";
import { Document } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type { ProjectAccess } from "../../task/domain/task.repository";
import {
  CreateDocumentInput,
  DocumentRepository,
  DocumentWithUploader,
} from "../domain/document.repository";

const UPLOADER_INCLUDE = {
  uploadedBy: { select: { firstName: true, lastName: true } },
} as const;

@Injectable()
export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProjectAccess(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectAccess | null> {
    return this.prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        managerId: true,
        members: { select: { userId: true, role: true } },
      },
    });
  }

  list(projectId: string): Promise<DocumentWithUploader[]> {
    return this.prisma.document.findMany({
      where: { projectId },
      include: UPLOADER_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  findById(projectId: string, id: string): Promise<Document | null> {
    return this.prisma.document.findFirst({ where: { id, projectId } });
  }

  create(input: CreateDocumentInput): Promise<DocumentWithUploader> {
    return this.prisma.document.create({
      data: input,
      include: UPLOADER_INCLUDE,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.document.delete({ where: { id } });
  }
}
