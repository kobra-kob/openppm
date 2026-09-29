import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { P } from "../../auth/domain/permissions";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { RequirePermissions } from "../../auth/infrastructure/decorators/require-permissions.decorator";
import {
  ProjectResourceCostView,
  ResourceService,
  TaskResourcesView,
} from "../application/resource.service";
import { AssignResourceDto } from "../application/dto/resource.dtos";

@ApiTags("resources")
@ApiBearerAuth()
@Controller("projects/:projectId")
export class ProjectResourcesController {
  constructor(private readonly resources: ResourceService) {}

  @Get("resources")
  @RequirePermissions(P.RESOURCE_VIEW)
  @ApiOperation({ summary: "Coût des ressources du projet (par ressource + total)" })
  projectCost(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
  ): Promise<ProjectResourceCostView> {
    return this.resources.projectResourceCost(user, projectId);
  }

  @Get("tasks/:taskId/resources")
  @RequirePermissions(P.RESOURCE_VIEW)
  @ApiOperation({ summary: "Ressources d'une tâche : durée, allocation et coût" })
  taskResources(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
  ): Promise<TaskResourcesView> {
    return this.resources.taskResources(user, projectId, taskId);
  }

  @Post("tasks/:taskId/resources")
  @RequirePermissions(P.RESOURCE_MANAGE)
  @ApiOperation({ summary: "Affecter une ressource à une tâche" })
  assign(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() dto: AssignResourceDto,
    @Req() request: Request,
  ): Promise<TaskResourcesView> {
    return this.resources.assignToTask(user, projectId, taskId, dto.resourceId, this.context(request));
  }

  @Delete("tasks/:taskId/resources/:resourceId")
  @RequirePermissions(P.RESOURCE_MANAGE)
  @ApiOperation({ summary: "Retirer une ressource d'une tâche" })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Param("resourceId", ParseUUIDPipe) resourceId: string,
    @Req() request: Request,
  ): Promise<TaskResourcesView> {
    return this.resources.removeFromTask(user, projectId, taskId, resourceId, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
