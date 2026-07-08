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
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RoleKey } from "@openppm/db";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { Roles } from "../../auth/infrastructure/decorators/roles.decorator";
import type { ProjectActivityEntry } from "../domain/project.repository";
import {
  AddProjectMemberDto,
  ChangeStatusDto,
  CreateProjectDto,
  ListProjectsQuery,
  UpdateProjectDto,
  UpdateProjectMemberDto,
} from "../application/dto/project.dtos";
import {
  ProjectListView,
  ProjectsService,
  ProjectView,
} from "../application/projects.service";

@ApiTags("projects")
@ApiBearerAuth()
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: "Projets de l'organisation (paginé, recherche, filtre statut)" })
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListProjectsQuery,
  ): Promise<ProjectListView> {
    return this.projects.list(user, query);
  }

  @Get("trash")
  @ApiOperation({ summary: "Corbeille (admin/manager/PMO)" })
  trash(@CurrentUser() user: JwtPayload): Promise<ProjectView[]> {
    return this.projects.listTrash(user);
  }

  @Post()
  @Roles(RoleKey.admin, RoleKey.manager, RoleKey.pmo, RoleKey.project_manager)
  @ApiOperation({ summary: "Créer un projet (code auto-généré si absent)" })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateProjectDto,
    @Req() request: Request,
  ): Promise<ProjectView> {
    return this.projects.create(user, dto, this.context(request));
  }

  @Get(":id")
  @ApiOperation({ summary: "Détail d'un projet" })
  get(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ProjectView> {
    return this.projects.get(user, id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Mettre à jour un projet" })
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @Req() request: Request,
  ): Promise<ProjectView> {
    return this.projects.update(user, id, dto, this.context(request));
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Changer l'état (workflow de cycle de vie)" })
  changeStatus(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
    @Req() request: Request,
  ): Promise<ProjectView> {
    return this.projects.changeStatus(user, id, dto, this.context(request));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Mettre à la corbeille (soft delete)" })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.projects.softDelete(user, id, this.context(request));
  }

  @Post(":id/restore")
  @ApiOperation({ summary: "Restaurer depuis la corbeille (admin/manager/PMO)" })
  restore(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ProjectView> {
    return this.projects.restore(user, id, this.context(request));
  }

  @Post(":id/members")
  @ApiOperation({ summary: "Ajouter un membre au projet" })
  addMember(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddProjectMemberDto,
    @Req() request: Request,
  ): Promise<ProjectView> {
    return this.projects.addMember(user, id, dto, this.context(request));
  }

  @Patch(":id/members/:userId")
  @ApiOperation({ summary: "Changer le rôle d'un membre du projet" })
  updateMember(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: UpdateProjectMemberDto,
    @Req() request: Request,
  ): Promise<ProjectView> {
    return this.projects.updateMemberRole(user, id, userId, dto, this.context(request));
  }

  @Delete(":id/members/:userId")
  @ApiOperation({ summary: "Retirer un membre du projet" })
  removeMember(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Req() request: Request,
  ): Promise<ProjectView> {
    return this.projects.removeMember(user, id, userId, this.context(request));
  }

  @Get(":id/activity")
  @ApiOperation({ summary: "Historique d'activité du projet (50 dernières entrées)" })
  activity(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ProjectActivityEntry[]> {
    return this.projects.activity(user, id);
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
