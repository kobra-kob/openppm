import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { FinanceService, FinanceView } from "../application/finance.service";
import {
  CreateBudgetLineDto,
  CreateCostEntryDto,
  SetLaborRateDto,
  UpdateBudgetLineDto,
} from "../application/dto/finance.dtos";

@ApiTags("finance")
@ApiBearerAuth()
@Controller("projects/:projectId/finance")
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  @ApiOperation({ summary: "Synthèse financière du projet (prévu, réel, reste)" })
  getFinance(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
  ): Promise<FinanceView> {
    return this.finance.getFinance(user, projectId);
  }

  @Put("labor-rate")
  @ApiOperation({ summary: "Définir le taux horaire de valorisation du temps" })
  setLaborRate(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body() dto: SetLaborRateDto,
    @Req() request: Request,
  ): Promise<FinanceView> {
    return this.finance.setLaborRate(user, projectId, dto, this.context(request));
  }

  @Post("lines")
  @ApiOperation({ summary: "Ajouter une ligne de budget prévisionnel (CAPEX/OPEX)" })
  addLine(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body() dto: CreateBudgetLineDto,
    @Req() request: Request,
  ): Promise<FinanceView> {
    return this.finance.addBudgetLine(user, projectId, dto, this.context(request));
  }

  @Patch("lines/:lineId")
  @ApiOperation({ summary: "Modifier une ligne de budget" })
  updateLine(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("lineId", ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateBudgetLineDto,
    @Req() request: Request,
  ): Promise<FinanceView> {
    return this.finance.updateBudgetLine(user, projectId, lineId, dto, this.context(request));
  }

  @Delete("lines/:lineId")
  @ApiOperation({ summary: "Supprimer une ligne de budget" })
  deleteLine(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("lineId", ParseUUIDPipe) lineId: string,
    @Req() request: Request,
  ): Promise<FinanceView> {
    return this.finance.deleteBudgetLine(user, projectId, lineId, this.context(request));
  }

  @Post("costs")
  @ApiOperation({ summary: "Enregistrer un coût réel" })
  addCost(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body() dto: CreateCostEntryDto,
    @Req() request: Request,
  ): Promise<FinanceView> {
    return this.finance.addCostEntry(user, projectId, dto, this.context(request));
  }

  @Delete("costs/:costId")
  @ApiOperation({ summary: "Supprimer un coût réel" })
  deleteCost(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("costId", ParseUUIDPipe) costId: string,
    @Req() request: Request,
  ): Promise<FinanceView> {
    return this.finance.deleteCostEntry(user, projectId, costId, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
