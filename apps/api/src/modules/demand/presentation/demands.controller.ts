import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { DemandListView, DemandView, DemandsService } from "../application/demands.service";
import {
  CreateDemandDto,
  ListDemandsQuery,
  UpdateDemandDto,
} from "../application/dto/demand.dtos";

@ApiTags("demands")
@ApiBearerAuth()
@Controller("demands")
export class DemandsController {
  constructor(private readonly demands: DemandsService) {}

  @Get()
  @ApiOperation({ summary: "Lister les demandes de l'organisation" })
  list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListDemandsQuery,
  ): Promise<DemandListView> {
    return this.demands.list(user, query);
  }

  @Post()
  @ApiOperation({ summary: "Créer une demande (numéro DEMDxxxxx attribué automatiquement)" })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDemandDto,
    @Req() request: Request,
  ): Promise<DemandView> {
    return this.demands.create(user, dto, this.context(request));
  }

  @Get(":id")
  @ApiOperation({ summary: "Détail d'une demande" })
  get(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<DemandView> {
    return this.demands.get(user, id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Modifier une demande" })
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDemandDto,
    @Req() request: Request,
  ): Promise<DemandView> {
    return this.demands.update(user, id, dto, this.context(request));
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Mettre une demande à la corbeille" })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.demands.remove(user, id, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
