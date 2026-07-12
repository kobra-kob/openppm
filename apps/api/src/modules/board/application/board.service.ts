import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { BoardColumn, ProjectRole, RoleKey, TaskStatus } from "@openppm/db";
import { AuditService } from "../../../core/audit/audit.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import type { ProjectAccess } from "../../task/domain/task.repository";
import { BOARD_REPOSITORY } from "../domain/board.repository";
import type {
  BoardCard,
  BoardRepository,
  BoardWithColumns,
} from "../domain/board.repository";
import type {
  CreateColumnDto,
  MoveCardDto,
  UpdateColumnDto,
} from "./dto/board.dtos";

const ORG_WIDE_ROLES: string[] = [RoleKey.admin, RoleKey.manager, RoleKey.pmo];

/** Colonnes par défaut du board (renommables ensuite). */
const DEFAULT_COLUMNS = [
  { name: "À faire", position: 1, mapsToStatus: TaskStatus.todo },
  { name: "En cours", position: 2, mapsToStatus: TaskStatus.in_progress },
  { name: "Terminé", position: 3, mapsToStatus: TaskStatus.done },
];

export interface BoardColumnView {
  id: string;
  name: string;
  position: number;
  wipLimit: number | null;
  mapsToStatus: TaskStatus | null;
  cards: BoardCard[];
}

export interface BoardView {
  id: string;
  name: string;
  columns: BoardColumnView[];
}

@Injectable()
export class BoardService {
  constructor(
    @Inject(BOARD_REPOSITORY) private readonly repository: BoardRepository,
    private readonly audit: AuditService,
  ) {}

  async getBoard(payload: JwtPayload, projectId: string): Promise<BoardView> {
    await this.requireProject(payload, projectId);
    const board = await this.ensureBoard(payload.org, projectId);
    const cards = await this.repository.listCards(projectId);
    return this.assemble(board, cards);
  }

  async addColumn(
    payload: JwtPayload,
    projectId: string,
    dto: CreateColumnDto,
    context: RequestContext,
  ): Promise<BoardView> {
    const project = await this.requireProject(payload, projectId);
    this.assertCanManage(payload, project);
    const board = await this.ensureBoard(payload.org, projectId);
    const position = await this.repository.nextColumnPosition(board.id);
    const column = await this.repository.createColumn(board.id, {
      name: dto.name,
      position,
      wipLimit: dto.wipLimit,
      mapsToStatus: dto.mapsToStatus,
    });
    await this.audit.log({
      action: "board.column_added",
      entityType: "board",
      entityId: board.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { name: column.name },
      ...context,
    });
    return this.getBoard(payload, projectId);
  }

  async updateColumn(
    payload: JwtPayload,
    projectId: string,
    columnId: string,
    dto: UpdateColumnDto,
    context: RequestContext,
  ): Promise<BoardView> {
    const project = await this.requireProject(payload, projectId);
    this.assertCanManage(payload, project);
    const board = await this.ensureBoard(payload.org, projectId);
    const column = await this.requireColumn(board, columnId);
    await this.repository.updateColumn(columnId, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.wipLimit !== undefined ? { wipLimit: dto.wipLimit } : {}),
      ...(dto.mapsToStatus !== undefined ? { mapsToStatus: dto.mapsToStatus } : {}),
      ...(dto.position !== undefined ? { position: dto.position } : {}),
    });
    await this.audit.log({
      action: "board.column_updated",
      entityType: "board",
      entityId: board.id,
      organizationId: payload.org,
      userId: payload.sub,
      before: { name: column.name, wipLimit: column.wipLimit },
      after: JSON.parse(JSON.stringify(dto)),
      ...context,
    });
    return this.getBoard(payload, projectId);
  }

  async deleteColumn(
    payload: JwtPayload,
    projectId: string,
    columnId: string,
    context: RequestContext,
  ): Promise<BoardView> {
    const project = await this.requireProject(payload, projectId);
    this.assertCanManage(payload, project);
    const board = await this.ensureBoard(payload.org, projectId);
    const column = await this.requireColumn(board, columnId);
    if ((await this.repository.countColumns(board.id)) <= 1) {
      throw new BadRequestException({
        code: "LAST_COLUMN",
        message: "Impossible de supprimer la dernière colonne",
      });
    }
    await this.repository.deleteColumn(columnId);
    await this.audit.log({
      action: "board.column_deleted",
      entityType: "board",
      entityId: board.id,
      organizationId: payload.org,
      userId: payload.sub,
      before: { name: column.name },
      ...context,
    });
    return this.getBoard(payload, projectId);
  }

  /**
   * Déplace une carte : colonne cible + position. Les rangs de la colonne
   * cible sont matérialisés ; le statut suit mapsToStatus le cas échéant.
   */
  async move(
    payload: JwtPayload,
    projectId: string,
    dto: MoveCardDto,
    context: RequestContext,
  ): Promise<BoardView> {
    const project = await this.requireProject(payload, projectId);
    this.assertCanWork(payload, project);
    const board = await this.ensureBoard(payload.org, projectId);
    const column = await this.requireColumn(board, dto.columnId);

    const cards = await this.repository.listCards(projectId);
    const moved = cards.find((card) => card.id === dto.taskId);
    if (!moved) {
      throw new NotFoundException({
        code: "TASK_NOT_FOUND",
        message: "Tâche introuvable",
      });
    }

    const view = this.assemble(board, cards);
    const target = view.columns.find((entry) => entry.id === dto.columnId)!;
    const ordered = target.cards.filter((card) => card.id !== dto.taskId);
    const index = Math.min(Math.max(dto.position, 0), ordered.length);
    ordered.splice(index, 0, moved);

    const statusChanges =
      column.mapsToStatus && column.mapsToStatus !== moved.status
        ? {
            status: column.mapsToStatus,
            completedAt: column.mapsToStatus === TaskStatus.done ? new Date() : null,
          }
        : {};

    await this.repository.applyMove(
      ordered.map((card, rank) => ({
        taskId: card.id,
        boardColumnId: dto.columnId,
        boardRank: rank + 1,
        ...(card.id === dto.taskId ? statusChanges : {}),
      })),
    );
    await this.audit.log({
      action: "board.card_moved",
      entityType: "task",
      entityId: dto.taskId,
      organizationId: payload.org,
      userId: payload.sub,
      after: {
        column: column.name,
        position: index + 1,
        ...(statusChanges.status ? { status: statusChanges.status } : {}),
      },
      ...context,
    });
    return this.getBoard(payload, projectId);
  }

  // ── Aides privées ────────────────────────────────────────────────────

  private async ensureBoard(
    organizationId: string,
    projectId: string,
  ): Promise<BoardWithColumns> {
    const existing = await this.repository.findBoard(organizationId, projectId);
    if (existing) {
      return existing;
    }
    return this.repository.createBoard(organizationId, projectId, "Board", DEFAULT_COLUMNS);
  }

  /**
   * Répartit les cartes : la colonne explicite prime, sauf si son mapping
   * de statut contredit le statut réel (changé ailleurs) — le statut gagne.
   * Sans colonne résolue (ex. tâche annulée), la carte n'apparaît pas.
   */
  private assemble(board: BoardWithColumns, cards: BoardCard[]): BoardView {
    const byStatus = new Map<TaskStatus, string>();
    for (const column of board.columns) {
      if (column.mapsToStatus && !byStatus.has(column.mapsToStatus)) {
        byStatus.set(column.mapsToStatus, column.id);
      }
    }
    const columnIds = new Set(board.columns.map((column) => column.id));
    const columnById = new Map(board.columns.map((column) => [column.id, column]));

    const buckets = new Map<string, BoardCard[]>();
    for (const card of cards) {
      let target: string | undefined;
      if (card.boardColumnId && columnIds.has(card.boardColumnId)) {
        const explicit = columnById.get(card.boardColumnId)!;
        target =
          explicit.mapsToStatus && explicit.mapsToStatus !== card.status
            ? byStatus.get(card.status)
            : explicit.id;
      } else {
        target = byStatus.get(card.status);
      }
      if (!target) {
        continue;
      }
      const bucket = buckets.get(target) ?? [];
      bucket.push(card);
      buckets.set(target, bucket);
    }

    return {
      id: board.id,
      name: board.name,
      columns: board.columns.map((column) => ({
        id: column.id,
        name: column.name,
        position: column.position,
        wipLimit: column.wipLimit,
        mapsToStatus: column.mapsToStatus,
        cards: buckets.get(column.id) ?? [],
      })),
    };
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

  private async requireColumn(
    board: BoardWithColumns,
    columnId: string,
  ): Promise<BoardColumn> {
    const column = await this.repository.findColumn(board.id, columnId);
    if (!column) {
      throw new NotFoundException({
        code: "COLUMN_NOT_FOUND",
        message: "Colonne introuvable",
      });
    }
    return column;
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
      message: "Droits insuffisants sur le board de ce projet",
    });
  }

  private assertCanManage(payload: JwtPayload, project: ProjectAccess): void {
    if (payload.roles.some((role) => ORG_WIDE_ROLES.includes(role))) {
      return;
    }
    if (project.managerId === payload.sub) {
      return;
    }
    const membership = project.members.find((member) => member.userId === payload.sub);
    if (membership?.role === ProjectRole.manager) {
      return;
    }
    throw new ForbiddenException({
      code: "FORBIDDEN",
      message: "La configuration du board est réservée aux responsables",
    });
  }
}
