import { Body, Controller, Get, Patch, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { ProjectsService } from "../application/projects.service";
import { UpdateOrganizationSettingsDto } from "../application/dto/project.dtos";

@ApiTags("organization")
@ApiBearerAuth()
@Controller("organization/settings")
export class OrganizationSettingsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: "Paramètres projet de l'organisation" })
  get(@CurrentUser() user: JwtPayload): Promise<{ allowDirectProjectCreation: boolean }> {
    return this.projects.getSettings(user);
  }

  @Patch()
  @ApiOperation({ summary: "Activer/désactiver la création directe de projet (admin)" })
  update(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateOrganizationSettingsDto,
    @Req() request: Request,
  ): Promise<{ allowDirectProjectCreation: boolean }> {
    return this.projects.setDirectCreation(user, dto.allowDirectProjectCreation, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
