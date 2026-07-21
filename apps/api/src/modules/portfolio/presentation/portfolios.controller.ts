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
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import type { PortfolioProjectSummary } from "../domain/portfolio.repository";
import {
  AttachProjectDto,
  CreatePortfolioDto,
  UpdatePortfolioDto,
} from "../application/dto/portfolio.dtos";
import { PortfoliosService, PortfolioView } from "../application/portfolios.service";

@ApiTags("portfolios")
@ApiBearerAuth()
@Controller("portfolios")
export class PortfoliosController {
  constructor(private readonly portfolios: PortfoliosService) {}

  @Get()
  @ApiOperation({ summary: "Portefeuilles de l'organisation (avec consolidation)" })
  list(@CurrentUser() user: JwtPayload): Promise<PortfolioView[]> {
    return this.portfolios.list(user);
  }

  @Get("unassigned-projects")
  @ApiOperation({ summary: "Projets sans portefeuille (pour rattachement)" })
  unassigned(@CurrentUser() user: JwtPayload): Promise<PortfolioProjectSummary[]> {
    return this.portfolios.unassignedProjects(user);
  }

  @Post()
  @ApiOperation({ summary: "Créer un portefeuille (admin/manager/PMO)" })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePortfolioDto,
    @Req() request: Request,
  ): Promise<PortfolioView> {
    return this.portfolios.create(user, dto, this.context(request));
  }

  @Get(":id")
  @ApiOperation({ summary: "Détail d'un portefeuille" })
  get(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<PortfolioView> {
    return this.portfolios.get(user, id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Mettre à jour un portefeuille" })
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePortfolioDto,
    @Req() request: Request,
  ): Promise<PortfolioView> {
    return this.portfolios.update(user, id, dto, this.context(request));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Supprimer un portefeuille (projets détachés)" })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.portfolios.remove(user, id, this.context(request));
  }

  @Post(":id/projects")
  @ApiOperation({ summary: "Rattacher un projet au portefeuille" })
  attach(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AttachProjectDto,
    @Req() request: Request,
  ): Promise<PortfolioView> {
    return this.portfolios.attachProject(user, id, dto, this.context(request));
  }

  @Delete(":id/projects/:projectId")
  @ApiOperation({ summary: "Détacher un projet du portefeuille" })
  detach(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Req() request: Request,
  ): Promise<PortfolioView> {
    return this.portfolios.detachProject(user, id, projectId, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
