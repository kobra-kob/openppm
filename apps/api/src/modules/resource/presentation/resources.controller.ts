import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { P } from "../../auth/domain/permissions";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { RequirePermissions } from "../../auth/infrastructure/decorators/require-permissions.decorator";
import { ResourceService, ResourceView } from "../application/resource.service";
import {
  CreateResourceDto,
  ListResourcesQuery,
  SetRateDto,
  UpdateResourceDto,
} from "../application/dto/resource.dtos";

@ApiTags("resources")
@ApiBearerAuth()
@Controller("resources")
export class ResourcesController {
  constructor(private readonly resources: ResourceService) {}

  @Get()
  @RequirePermissions(P.RESOURCE_VIEW)
  @ApiOperation({ summary: "Lister les ressources de l'organisation" })
  list(@CurrentUser() user: JwtPayload, @Query() query: ListResourcesQuery): Promise<ResourceView[]> {
    return this.resources.list(user, {
      search: query.search,
      resourceType: query.resourceType,
      active: query.active,
    });
  }

  @Get(":id")
  @RequirePermissions(P.RESOURCE_VIEW)
  @ApiOperation({ summary: "Détail d'une ressource : affectations, charge, coûts, surcharge" })
  detail(@CurrentUser() user: JwtPayload, @Param("id", ParseUUIDPipe) id: string) {
    return this.resources.detail(user, id);
  }

  @Post()
  @RequirePermissions(P.RESOURCE_MANAGE)
  @ApiOperation({ summary: "Créer une ressource (avec tarif optionnel)" })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateResourceDto,
    @Req() request: Request,
  ): Promise<ResourceView> {
    return this.resources.create(user, dto, this.context(request));
  }

  @Patch(":id")
  @RequirePermissions(P.RESOURCE_MANAGE)
  @ApiOperation({ summary: "Modifier une ressource" })
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateResourceDto,
    @Req() request: Request,
  ): Promise<ResourceView> {
    return this.resources.update(user, id, dto, this.context(request));
  }

  @Post(":id/archive")
  @RequirePermissions(P.RESOURCE_MANAGE)
  @ApiOperation({ summary: "Archiver une ressource (inactive : non ré-affectable)" })
  archive(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ResourceView> {
    return this.resources.archive(user, id, this.context(request));
  }

  @Put(":id/rate")
  @RequirePermissions(P.RESOURCE_MANAGE)
  @ApiOperation({ summary: "Définir le tarif courant d'une ressource" })
  setRate(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetRateDto,
    @Req() request: Request,
  ): Promise<ResourceView> {
    return this.resources.setRate(user, id, dto, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
