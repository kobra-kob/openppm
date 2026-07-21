import type { Comment } from "@openppm/db";

export interface CommentAuthor {
  id: string;
  firstName: string;
  lastName: string;
}

export type CommentWithAuthor = Comment & { author: CommentAuthor };

/** Contexte d'une tâche pour commenter : accès projet + cibles de notification. */
export interface TaskCommentContext {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  organizationId: string;
  managerId: string | null;
  members: Array<{ userId: string; role: string; firstName: string; lastName: string; email: string }>;
  /** Assignés + créateur de la tâche : destinataires par défaut d'un commentaire. */
  watcherIds: string[];
}

export interface CreateCommentInput {
  organizationId: string;
  entityType: string;
  entityId: string;
  authorId: string;
  body: string;
  mentions: string[];
}

export interface CommentRepository {
  /** Charge le contexte de commentaire d'une tâche (null si projet/tâche introuvable dans l'org). */
  loadTaskContext(
    organizationId: string,
    projectId: string,
    taskId: string,
  ): Promise<TaskCommentContext | null>;
  list(entityType: string, entityId: string): Promise<CommentWithAuthor[]>;
  create(input: CreateCommentInput): Promise<CommentWithAuthor>;
  findById(id: string): Promise<Comment | null>;
  delete(id: string): Promise<void>;
}

export const COMMENT_REPOSITORY = Symbol("COMMENT_REPOSITORY");
