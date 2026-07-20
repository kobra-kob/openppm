import type { Document } from "@openppm/db";
import type { ProjectAccess } from "../../task/domain/task.repository";

export type DocumentWithUploader = Document & {
  uploadedBy: { firstName: string; lastName: string };
};

export interface CreateDocumentInput {
  organizationId: string;
  projectId: string;
  name: string;
  storagePath: string;
  mimeType: string;
  size: number;
  uploadedById: string;
}

export interface DocumentRepository {
  findProjectAccess(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectAccess | null>;
  list(projectId: string): Promise<DocumentWithUploader[]>;
  findById(projectId: string, id: string): Promise<Document | null>;
  create(input: CreateDocumentInput): Promise<DocumentWithUploader>;
  delete(id: string): Promise<void>;
}

export const DOCUMENT_REPOSITORY = Symbol("DOCUMENT_REPOSITORY");
