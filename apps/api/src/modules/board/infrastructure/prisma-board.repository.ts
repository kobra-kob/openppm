import { Injectable } from "@nestjs/common";
import { BoardColumn, TaskStatus } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type { ProjectAccess } from "../../task/domain/task.repository";
import {
  BoardCard,
  BoardRepository,
  BoardWithColumns,
  ColumnSeed,
  MoveUpdate,
} from "../domain/board.repository";

@Injectable()
export class PrismaBoardRepository implements BoardRepository {
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

  findBoard(
    organizationId: string,
    projectId: string,
  ): Promise<BoardWithColumns | null> {
    return this.prisma.board.findFirst({
      where: { projectId, organizationId },
      include: { columns: { orderBy: { position: "asc" } } },
    });
  }

  createBoard(
    organizationId: string,
    projectId: string,
    name: string,
    columns: ColumnSeed[],
  ): Promise<BoardWithColumns> {
    return this.prisma.board.create({
      data: {
        organizationId,
        projectId,
        name,
        columns: {
          create: columns.map((column) => ({
            name: column.name,
            position: column.position,
            mapsToStatus: column.mapsToStatus ?? null,
          })),
        },
      },
      include: { columns: { orderBy: { position: "asc" } } },
    });
  }

  async listCards(projectId: string): Promise<BoardCard[]> {
    const tasks = await this.prisma.task.findMany({
      where: { projectId, deletedAt: null },
      include: {
        assignees: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        checklist: { select: { isDone: true } },
      },
      orderBy: [{ boardRank: "asc" }, { position: "asc" }, { createdAt: "asc" }],
    });
    return tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      parentId: task.parentId,
      boardColumnId: task.boardColumnId,
      boardRank: task.boardRank,
      position: task.position,
      assignees: task.assignees.map((assignee) => ({
        userId: assignee.userId,
        name: `${assignee.user.firstName} ${assignee.user.lastName}`,
      })),
      checklistDone: task.checklist.filter((item) => item.isDone).length,
      checklistTotal: task.checklist.length,
    }));
  }

  findColumn(boardId: string, columnId: string): Promise<BoardColumn | null> {
    return this.prisma.boardColumn.findFirst({ where: { id: columnId, boardId } });
  }

  countColumns(boardId: string): Promise<number> {
    return this.prisma.boardColumn.count({ where: { boardId } });
  }

  async nextColumnPosition(boardId: string): Promise<number> {
    const max = await this.prisma.boardColumn.aggregate({
      where: { boardId },
      _max: { position: true },
    });
    return (max._max.position ?? 0) + 1;
  }

  createColumn(
    boardId: string,
    input: { name: string; position: number; wipLimit?: number; mapsToStatus?: TaskStatus },
  ): Promise<BoardColumn> {
    return this.prisma.boardColumn.create({
      data: {
        boardId,
        name: input.name,
        position: input.position,
        wipLimit: input.wipLimit ?? null,
        mapsToStatus: input.mapsToStatus ?? null,
      },
    });
  }

  updateColumn(
    columnId: string,
    input: {
      name?: string;
      wipLimit?: number | null;
      mapsToStatus?: TaskStatus | null;
      position?: number;
    },
  ): Promise<BoardColumn> {
    return this.prisma.boardColumn.update({ where: { id: columnId }, data: input });
  }

  async deleteColumn(columnId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.task.updateMany({
        where: { boardColumnId: columnId },
        data: { boardColumnId: null },
      }),
      this.prisma.boardColumn.delete({ where: { id: columnId } }),
    ]);
  }

  async applyMove(updates: MoveUpdate[]): Promise<void> {
    await this.prisma.$transaction(
      updates.map((update) =>
        this.prisma.task.update({
          where: { id: update.taskId },
          data: {
            boardColumnId: update.boardColumnId,
            boardRank: update.boardRank,
            ...(update.status !== undefined ? { status: update.status } : {}),
            ...(update.completedAt !== undefined
              ? { completedAt: update.completedAt }
              : {}),
          },
        }),
      ),
    );
  }
}
