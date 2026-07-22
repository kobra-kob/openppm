import {
  Body,
  Controller,
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
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import {
  BudgetGovernanceService,
  BudgetRequestView,
  GovernanceView,
} from "../application/budget-governance.service";
import {
  CreateBudgetRequestDto,
  DecideStepDto,
} from "../application/dto/budget-governance.dtos";

@ApiTags("budget-governance")
@ApiBearerAuth()
@Controller("projects/:projectId/budget")
export class BudgetGovernanceController {
  constructor(private readonly governance: BudgetGovernanceService) {}

  @Get()
  @ApiOperation({ summary: "État de la gouvernance budgétaire du projet" })
  getGovernance(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
  ): Promise<GovernanceView> {
    return this.governance.getGovernance(user, projectId);
  }

  @Post("requests")
  @ApiOperation({ summary: "Soumettre une demande de budget (projet en portefeuille)" })
  createRequest(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body() dto: CreateBudgetRequestDto,
    @Req() request: Request,
  ): Promise<BudgetRequestView> {
    return this.governance.createRequest(user, projectId, dto, this.context(request));
  }

  @Post("requests/:requestId/steps/:stepId/decide")
  @ApiOperation({ summary: "Valider ou refuser l'étape courante (Finance puis Direction)" })
  decide(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("requestId", ParseUUIDPipe) requestId: string,
    @Param("stepId", ParseUUIDPipe) stepId: string,
    @Body() dto: DecideStepDto,
    @Req() request: Request,
  ): Promise<BudgetRequestView> {
    return this.governance.decideStep(
      user,
      projectId,
      requestId,
      stepId,
      dto,
      this.context(request),
    );
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
