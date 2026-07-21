import { Injectable } from "@nestjs/common";
import { Comment } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import {
  CommentRepository,
  CommentWithAuthor,
  CreateCommentInput,
  TaskCommentContext,
} from "../domain/comment.repository";

const AUTHOR_SELECT = {
  author: { select: { id: true, firstName: true, lastName: true } },
} as const;

@Injectable()
export class PrismaCommentRepository implements CommentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async loadTaskContext(
    organizationId: string,
    projectId: string,
    taskId: string,
  ): Promise<TaskCommentContext | null> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        projectId,
        organizationId,
        deletedAt: null,
        project: { deletedAt: null },
      },
      select: {
        id: true,
        title: true,
        createdById: true,
        assignees: { select: { userId: true } },
        project: {
          select: {
            id: true,
            name: true,
            managerId: true,
            members: {
              select: {
                userId: true,
                role: true,
                user: { select: { firstName: true, lastName: true, email: true } },
              },
            },
          },
        },
      },
    });
    if (!task) {
      return null;
    }
    const watcherIds = new Set<string>(task.assignees.map((a) => a.userId));
    watcherIds.add(task.createdById);
    return {
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.project.id,
      projectName: task.project.name,
      organizationId,
      managerId: task.project.managerId,
      members: task.project.members.map((member) => ({
        userId: member.userId,
        role: member.role,
        firstName: member.user.firstName,
        lastName: member.user.lastName,
        email: member.user.email,
      })),
      watcherIds: [...watcherIds],
    };
  }

  list(entityType: string, entityId: string): Promise<CommentWithAuthor[]> {
    return this.prisma.comment.findMany({
      where: { entityType, entityId },
      include: AUTHOR_SELECT,
      orderBy: { createdAt: "asc" },
    });
  }

  create(input: CreateCommentInput): Promise<CommentWithAuthor> {
    return this.prisma.comment.create({
      data: {
        organizationId: input.organizationId,
        entityType: input.entityType,
        entityId: input.entityId,
        authorId: input.authorId,
        body: input.body,
        mentions: input.mentions,
      },
      include: AUTHOR_SELECT,
    });
  }

  findById(id: string): Promise<Comment | null> {
    return this.prisma.comment.findUnique({ where: { id } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.comment.delete({ where: { id } });
  }
}
