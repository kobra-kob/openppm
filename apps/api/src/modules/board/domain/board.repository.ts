import type { Board, BoardColumn, TaskStatus } from "@openppm/db";
import type { ProjectAccess } from "../../task/domain/task.repository";

export type BoardWithColumns = Board & { columns: BoardColumn[] };

/** Carte du board : tâche + agrégats d'affichage. */
export interface BoardCard {
  id: string;
  title: string;
  status: TaskStatus;
  priority: number;
  dueDate: Date | null;
  parentId: string | null;
  boardColumnId: string | null;
  boardRank: number;
  position: number;
  assignees: Array<{ userId: string; name: string }>;
  checklistDone: number;
  checklistTotal: number;
}

export interface ColumnSeed {
  name: string;
  position: number;
  mapsToStatus?: TaskStatus;
}

export interface MoveUpdate {
  taskId: string;
  boardColumnId: string;
  boardRank: number;
  status?: TaskStatus;
  completedAt?: Date | null;
}

export interface BoardRepository {
  findProjectAccess(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectAccess | null>;
  findBoard(organizationId: string, projectId: string): Promise<BoardWithColumns | null>;
  createBoard(
    organizationId: string,
    projectId: string,
    name: string,
    columns: ColumnSeed[],
  ): Promise<BoardWithColumns>;

  listCards(projectId: string): Promise<BoardCard[]>;

  findColumn(boardId: string, columnId: string): Promise<BoardColumn | null>;
  countColumns(boardId: string): Promise<number>;
  nextColumnPosition(boardId: string): Promise<number>;
  createColumn(
    boardId: string,
    input: { name: string; position: number; wipLimit?: number; mapsToStatus?: TaskStatus },
  ): Promise<BoardColumn>;
  updateColumn(
    columnId: string,
    input: {
      name?: string;
      wipLimit?: number | null;
      mapsToStatus?: TaskStatus | null;
      position?: number;
    },
  ): Promise<BoardColumn>;
  /** Supprime la colonne ; les cartes explicitement rattachées sont détachées. */
  deleteColumn(columnId: string): Promise<void>;

  /** Applique un déplacement : mises à jour atomiques des cartes concernées. */
  applyMove(updates: MoveUpdate[]): Promise<void>;
}

export const BOARD_REPOSITORY = Symbol("BOARD_REPOSITORY");
