import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ProjectRole, RoleKey } from "@openppm/db";
import type { Readable } from "node:stream";
import { AuditService } from "../../../core/audit/audit.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import type { ProjectAccess } from "../../task/domain/task.repository";
import { DOCUMENT_REPOSITORY } from "../domain/document.repository";
import type {
  DocumentRepository,
  DocumentWithUploader,
} from "../domain/document.repository";

const ORG_WIDE_ROLES: string[] = [RoleKey.admin, RoleKey.manager, RoleKey.pmo];
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

export interface DocumentView {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedByName: string;
  createdAt: Date;
}

export interface UploadedFileInput {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class DocumentsService {
  private readonly rootDir: string;

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly repository: DocumentRepository,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.rootDir = resolve(config.get<string>("FILES_DIR") ?? "./storage");
  }

  private toView(document: DocumentWithUploader): DocumentView {
    return {
      id: document.id,
      name: document.name,
      mimeType: document.mimeType,
      size: document.size,
      uploadedByName: `${document.uploadedBy.firstName} ${document.uploadedBy.lastName}`,
      createdAt: document.createdAt,
    };
  }

  async list(payload: JwtPayload, projectId: string): Promise<DocumentView[]> {
    await this.requireProject(payload, projectId);
    const documents = await this.repository.list(projectId);
    return documents.map((document) => this.toView(document));
  }

  async upload(
    payload: JwtPayload,
    projectId: string,
    file: UploadedFileInput | undefined,
    context: RequestContext,
  ): Promise<DocumentView> {
    const project = await this.requireProject(payload, projectId);
    this.assertCanWork(payload, project);
    if (!file || file.size === 0) {
      throw new BadRequestException({
        code: "FILE_REQUIRED",
        message: "Aucun fichier reçu",
      });
    }

    // Nom original UTF-8 (multer livre du latin1) puis chemin de stockage opaque
    const name = Buffer.from(file.originalname, "latin1").toString("utf8").slice(0, 255);
    const relativePath = join(
      payload.org,
      projectId,
      `${randomUUID()}${extname(name).slice(0, 12)}`,
    );
    const absolutePath = join(this.rootDir, relativePath);
    await mkdir(join(this.rootDir, payload.org, projectId), { recursive: true });
    await writeFile(absolutePath, file.buffer);

    const document = await this.repository.create({
      organizationId: payload.org,
      projectId,
      name,
      storagePath: relativePath,
      mimeType: file.mimetype || "application/octet-stream",
      size: file.size,
      uploadedById: payload.sub,
    });
    await this.audit.log({
      action: "document.uploaded",
      entityType: "document",
      entityId: document.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { name, size: file.size, projectId },
      ...context,
    });
    return this.toView(document);
  }

  async download(
    payload: JwtPayload,
    projectId: string,
    documentId: string,
  ): Promise<{ stream: Readable; name: string; mimeType: string; size: number }> {
    await this.requireProject(payload, projectId);
    const document = await this.repository.findById(projectId, documentId);
    if (!document) {
      throw this.documentNotFound();
    }
    return {
      stream: createReadStream(join(this.rootDir, document.storagePath)),
      name: document.name,
      mimeType: document.mimeType,
      size: document.size,
    };
  }

  async remove(
    payload: JwtPayload,
    projectId: string,
    documentId: string,
    context: RequestContext,
  ): Promise<void> {
    const project = await this.requireProject(payload, projectId);
    this.assertCanWork(payload, project);
    const document = await this.repository.findById(projectId, documentId);
    if (!document) {
      throw this.documentNotFound();
    }
    await this.repository.delete(document.id);
    await unlink(join(this.rootDir, document.storagePath)).catch(() => {
      // fichier déjà absent du disque : la suppression logique prime
    });
    await this.audit.log({
      action: "document.deleted",
      entityType: "document",
      entityId: document.id,
      organizationId: payload.org,
      userId: payload.sub,
      before: { name: document.name },
      ...context,
    });
  }

  private async requireProject(
    payload: JwtPayload,
    projectId: string,
  ): Promise<ProjectAccess> {
    const project = await this.repository.findProjectAccess(payload.org, projectId);
    if (!project) {
      throw new NotFoundException({
        code: "PROJECT_NOT_FOUND",
        message: "Projet introuvable",
      });
    }
    return project;
  }

  private assertCanWork(payload: JwtPayload, project: ProjectAccess): void {
    if (payload.roles.some((role) => ORG_WIDE_ROLES.includes(role))) {
      return;
    }
    const membership = project.members.find((member) => member.userId === payload.sub);
    if (membership && membership.role !== ProjectRole.observer) {
      return;
    }
    throw new ForbiddenException({
      code: "FORBIDDEN",
      message: "Droits insuffisants sur les documents de ce projet",
    });
  }

  private documentNotFound(): NotFoundException {
    return new NotFoundException({
      code: "DOCUMENT_NOT_FOUND",
      message: "Document introuvable",
    });
  }
}
