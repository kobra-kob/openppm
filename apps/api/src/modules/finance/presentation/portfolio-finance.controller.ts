import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { FinanceService, PortfolioFinanceView } from "../application/finance.service";

@ApiTags("finance")
@ApiBearerAuth()
@Controller("portfolios/:portfolioId/finance")
export class PortfolioFinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  @ApiOperation({ summary: "Consolidation financière du portefeuille (mêmes stats, agrégées)" })
  getConsolidation(
    @CurrentUser() user: JwtPayload,
    @Param("portfolioId", ParseUUIDPipe) portfolioId: string,
  ): Promise<PortfolioFinanceView> {
    return this.finance.getPortfolioConsolidation(user, portfolioId);
  }
}
