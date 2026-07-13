import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { ChecklistItem } from "@openppm/db";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import {
  AddDependencyDto,
  ChangeTaskStatusDto,
  CreateChecklistItemDto,
  CreateTaskDto,
  LogTimeDto,
  TaskAssigneeDto,
  UpdateChecklistItemDto,
  UpdateTaskDto,
} from "../application/dto/task.dtos";
import {
  GanttView,
  TaskDetailView,
  TasksService,
  TaskView,
} from "../application/tasks.service";

@ApiTags("tasks")
@ApiBearerAuth()
@Controller("projects/:projectId/tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: "Tâches du projet (liste plate avec parentId)" })
  list(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
  ): Promise<TaskView[]> {
    return this.tasks.list(user, projectId);
  }

  @Post()
  @ApiOperation({ summary: "Créer une tâche ou une sous-tâche" })
  create(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body() dto: CreateTaskDto,
    @Req() request: Request,
  ): Promise<TaskView> {
    return this.tasks.create(user, projectId, dto, this.context(request));
  }

  @Get("gantt")
  @ApiOperation({ summary: "Diagramme de Gantt : tâches, dépendances, chemin critique" })
  gantt(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
  ): Promise<GanttView> {
    return this.tasks.gantt(user, projectId);
  }

  @Get(":taskId")
  @ApiOperation({ summary: "Détail : checklist, dépendances, temps passé" })
  detail(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
  ): Promise<TaskDetailView> {
    return this.tasks.detail(user, projectId, taskId);
  }

  @Patch(":taskId")
  @ApiOperation({ summary: "Mettre à jour une tâche" })
  update(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
    @Req() request: Request,
  ): Promise<TaskView> {
    return this.tasks.update(user, projectId, taskId, dto, this.context(request));
  }

  @Patch(":taskId/status")
  @ApiOperation({ summary: "Changer le statut (done fixe completedAt)" })
  changeStatus(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() dto: ChangeTaskStatusDto,
    @Req() request: Request,
  ): Promise<TaskView> {
    return this.tasks.changeStatus(user, projectId, taskId, dto, this.context(request));
  }

  @Delete(":taskId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Supprimer la tâche et ses sous-tâches (soft delete)" })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.tasks.softDelete(user, projectId, taskId, this.context(request));
  }

  @Post(":taskId/assignees")
  @ApiOperation({ summary: "Assigner un membre du projet" })
  addAssignee(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() dto: TaskAssigneeDto,
    @Req() request: Request,
  ): Promise<TaskView> {
    return this.tasks.addAssignee(user, projectId, taskId, dto, this.context(request));
  }

  @Delete(":taskId/assignees/:userId")
  @ApiOperation({ summary: "Retirer un assigné" })
  removeAssignee(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Req() request: Request,
  ): Promise<TaskView> {
    return this.tasks.removeAssignee(user, projectId, taskId, userId, this.context(request));
  }

  @Post(":taskId/checklist")
  @ApiOperation({ summary: "Ajouter un élément de checklist" })
  addChecklistItem(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() dto: CreateChecklistItemDto,
  ): Promise<ChecklistItem> {
    return this.tasks.addChecklistItem(user, projectId, taskId, dto);
  }

  @Patch(":taskId/checklist/:itemId")
  @ApiOperation({ summary: "Cocher / renommer un élément de checklist" })
  updateChecklistItem(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateChecklistItemDto,
  ): Promise<ChecklistItem> {
    return this.tasks.updateChecklistItem(user, projectId, taskId, itemId, dto);
  }

  @Delete(":taskId/checklist/:itemId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Supprimer un élément de checklist" })
  async deleteChecklistItem(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    await this.tasks.deleteChecklistItem(user, projectId, taskId, itemId);
  }

  @Post(":taskId/dependencies")
  @ApiOperation({ summary: "Ajouter un prérequis (fin → début, anti-cycle)" })
  addDependency(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() dto: AddDependencyDto,
    @Req() request: Request,
  ): Promise<TaskDetailView> {
    return this.tasks.addDependency(user, projectId, taskId, dto, this.context(request));
  }

  @Delete(":taskId/dependencies/:predecessorId")
  @ApiOperation({ summary: "Retirer un prérequis" })
  removeDependency(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Param("predecessorId", ParseUUIDPipe) predecessorId: string,
    @Req() request: Request,
  ): Promise<TaskDetailView> {
    return this.tasks.removeDependency(
      user,
      projectId,
      taskId,
      predecessorId,
      this.context(request),
    );
  }

  @Post(":taskId/time")
  @ApiOperation({ summary: "Saisir du temps passé" })
  logTime(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() dto: LogTimeDto,
    @Req() request: Request,
  ): Promise<TaskDetailView> {
    return this.tasks.logTime(user, projectId, taskId, dto, this.context(request));
  }

  @Delete(":taskId/time/:entryId")
  @ApiOperation({ summary: "Supprimer une saisie de temps (la sienne, ou responsable projet)" })
  deleteTimeEntry(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Param("entryId", ParseUUIDPipe) entryId: string,
    @Req() request: Request,
  ): Promise<TaskDetailView> {
    return this.tasks.deleteTimeEntry(user, projectId, taskId, entryId, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
