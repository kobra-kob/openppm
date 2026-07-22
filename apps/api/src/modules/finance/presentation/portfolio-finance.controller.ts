import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import {
  FinanceService,
  PortfolioFinanceSummaryRow,
  PortfolioFinanceView,
} from "../application/finance.service";

@ApiTags("finance")
@ApiBearerAuth()
@Controller()
export class PortfolioFinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get("finance/portfolios")
  @ApiOperation({ summary: "Résumés financiers de tous les portefeuilles (liste)" })
  getSummaries(@CurrentUser() user: JwtPayload): Promise<PortfolioFinanceSummaryRow[]> {
    return this.finance.getPortfolioSummaries(user);
  }

  @Get("portfolios/:portfolioId/finance")
  @ApiOperation({ summary: "Consolidation financière du portefeuille (mêmes stats, agrégées)" })
  getConsolidation(
    @CurrentUser() user: JwtPayload,
    @Param("portfolioId", ParseUUIDPipe) portfolioId: string,
  ): Promise<PortfolioFinanceView> {
    return this.finance.getPortfolioConsolidation(user, portfolioId);
  }
}
