import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ProjectRole, RoleKey } from "@openppm/db";
import { AuditService } from "../../../core/audit/audit.service";
import {
  CreateNotificationInput,
  NotificationsService,
} from "../../../core/notifications/notifications.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { COMMENT_REPOSITORY } from "../domain/comment.repository";
import type {
  CommentRepository,
  CommentWithAuthor,
  TaskCommentContext,
} from "../domain/comment.repository";
import type { CreateCommentDto } from "./dto/comment.dtos";

const ORG_WIDE_ROLES: string[] = [RoleKey.admin, RoleKey.manager, RoleKey.pmo];
const ENTITY_TYPE = "task";
/** Extrait des 140 premiers caractères du corps pour le payload de notification. */
const EXCERPT_LENGTH = 140;

export interface CommentView {
  id: string;
  body: string;
  mentions: string[];
  author: { id: string; name: string };
  createdAt: Date;
  editable: boolean;
}

@Injectable()
export class CommentsService {
  constructor(
    @Inject(COMMENT_REPOSITORY) private readonly repository: CommentRepository,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private toView(comment: CommentWithAuthor, currentUserId: string): CommentView {
    return {
      id: comment.id,
      body: comment.body,
      mentions: Array.isArray(comment.mentions) ? (comment.mentions as string[]) : [],
      author: {
        id: comment.author.id,
        name: `${comment.author.firstName} ${comment.author.lastName}`,
      },
      createdAt: comment.createdAt,
      editable: comment.authorId === currentUserId,
    };
  }

  async list(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
  ): Promise<CommentView[]> {
    await this.requireContext(payload, projectId, taskId);
    const comments = await this.repository.list(ENTITY_TYPE, taskId);
    return comments.map((comment) => this.toView(comment, payload.sub));
  }

  async create(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    dto: CreateCommentDto,
    context: RequestContext,
  ): Promise<CommentView> {
    const ctx = await this.requireContext(payload, projectId, taskId);
    this.assertCanWork(payload, ctx);

    // Seules les mentions correspondant à des membres du projet sont retenues
    const memberIds = new Set(ctx.members.map((member) => member.userId));
    const mentions = [...new Set(dto.mentions)].filter((id) => memberIds.has(id));

    const comment = await this.repository.create({
      organizationId: payload.org,
      entityType: ENTITY_TYPE,
      entityId: taskId,
      authorId: payload.sub,
      body: dto.body,
      mentions,
    });
    await this.audit.log({
      action: "task.comment_added",
      entityType: "task",
      entityId: taskId,
      organizationId: payload.org,
      userId: payload.sub,
      after: { commentId: comment.id },
      ...context,
    });

    await this.dispatchNotifications(payload, ctx, dto.body, mentions);
    return this.toView(comment, payload.sub);
  }

  async delete(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    commentId: string,
    context: RequestContext,
  ): Promise<void> {
    const ctx = await this.requireContext(payload, projectId, taskId);
    const comment = await this.repository.findById(commentId);
    if (!comment || comment.entityId !== taskId) {
      throw new NotFoundException({
        code: "COMMENT_NOT_FOUND",
        message: "Commentaire introuvable",
      });
    }
    // L'auteur, ou un responsable du projet, peut supprimer
    if (comment.authorId !== payload.sub) {
      this.assertCanManage(payload, ctx);
    }
    await this.repository.delete(commentId);
    await this.audit.log({
      action: "task.comment_deleted",
      entityType: "task",
      entityId: taskId,
      organizationId: payload.org,
      userId: payload.sub,
      before: { commentId, authorId: comment.authorId },
      ...context,
    });
  }

  // ── Notifications ────────────────────────────────────────────────────

  private async dispatchNotifications(
    payload: JwtPayload,
    ctx: TaskCommentContext,
    body: string,
    mentions: string[],
  ): Promise<void> {
    const authorName = payload.name;
    const excerpt = body.length > EXCERPT_LENGTH ? `${body.slice(0, EXCERPT_LENGTH)}…` : body;
    const membersById = new Map(ctx.members.map((member) => [member.userId, member]));
    const mentionSet = new Set(mentions);

    const inputs: CreateNotificationInput[] = [];
    const notified = new Set<string>([payload.sub]); // jamais l'auteur

    // 1) Mentions (prioritaires sur le simple commentaire)
    for (const userId of mentions) {
      if (notified.has(userId)) continue;
      const member = membersById.get(userId);
      inputs.push({
        organizationId: ctx.organizationId,
        userId,
        type: "task.mention",
        payload: {
          taskId: ctx.taskId,
          taskTitle: ctx.taskTitle,
          projectId: ctx.projectId,
          authorName,
          excerpt,
        },
        email: member
          ? {
              to: member.email,
              subject: `${authorName} vous a mentionné sur « ${ctx.taskTitle} »`,
              text: `${authorName} : ${excerpt}`,
            }
          : undefined,
      });
      notified.add(userId);
    }

    // 2) Watchers de la tâche (assignés + créateur), hors mentionnés déjà notifiés
    for (const userId of ctx.watcherIds) {
      if (notified.has(userId) || mentionSet.has(userId)) continue;
      inputs.push({
        organizationId: ctx.organizationId,
        userId,
        type: "task.comment",
        payload: {
          taskId: ctx.taskId,
          taskTitle: ctx.taskTitle,
          projectId: ctx.projectId,
          authorName,
          excerpt,
        },
      });
      notified.add(userId);
    }

    await this.notifications.notifyMany(inputs);
  }

  // ── Permissions ──────────────────────────────────────────────────────

  private async requireContext(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
  ): Promise<TaskCommentContext> {
    const ctx = await this.repository.loadTaskContext(payload.org, projectId, taskId);
    if (!ctx) {
      throw new NotFoundException({
        code: "TASK_NOT_FOUND",
        message: "Tâche introuvable",
      });
    }
    return ctx;
  }

  private assertCanWork(payload: JwtPayload, ctx: TaskCommentContext): void {
    if (payload.roles.some((role) => ORG_WIDE_ROLES.includes(role))) {
      return;
    }
    const membership = ctx.members.find((member) => member.userId === payload.sub);
    if (membership && membership.role !== ProjectRole.observer) {
      return;
    }
    throw new ForbiddenException({
      code: "FORBIDDEN",
      message: "Droits insuffisants pour commenter cette tâche",
    });
  }

  private assertCanManage(payload: JwtPayload, ctx: TaskCommentContext): void {
    if (payload.roles.some((role) => ORG_WIDE_ROLES.includes(role))) {
      return;
    }
    if (ctx.managerId === payload.sub) {
      return;
    }
    const membership = ctx.members.find((member) => member.userId === payload.sub);
    if (membership?.role === ProjectRole.manager) {
      return;
    }
    throw new ForbiddenException({
      code: "FORBIDDEN",
      message: "Seul l'auteur ou un responsable peut supprimer ce commentaire",
    });
  }
}
