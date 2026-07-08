import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RoleKey } from "@openppm/db";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { Roles } from "../../auth/infrastructure/decorators/roles.decorator";
import { CreateTemplateDto } from "../application/dto/category-template.dtos";
import { TemplatesService, TemplateView } from "../application/templates.service";

@ApiTags("project-templates")
@ApiBearerAuth()
@Controller("project-templates")
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: "Templates de projet de l'organisation" })
  list(@CurrentUser() user: JwtPayload): Promise<TemplateView[]> {
    return this.templates.list(user);
  }

  @Post()
  @Roles(RoleKey.admin, RoleKey.manager, RoleKey.pmo, RoleKey.project_manager)
  @ApiOperation({
    summary: "Créer un template (à partir de zéro ou d'un projet via fromProjectId)",
  })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTemplateDto,
    @Req() request: Request,
  ): Promise<TemplateView> {
    return this.templates.create(user, dto, this.context(request));
  }

  @Delete(":id")
  @Roles(RoleKey.admin, RoleKey.manager, RoleKey.pmo, RoleKey.project_manager)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Supprimer un template" })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.templates.remove(user, id, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
