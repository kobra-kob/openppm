import { Module } from "@nestjs/common";
import { FinanceService } from "./application/finance.service";
import { FINANCE_REPOSITORY } from "./domain/finance.repository";
import { PrismaFinanceRepository } from "./infrastructure/prisma-finance.repository";
import { FinanceController } from "./presentation/finance.controller";
import { PortfolioFinanceController } from "./presentation/portfolio-finance.controller";

@Module({
  controllers: [FinanceController, PortfolioFinanceController],
  providers: [
    FinanceService,
    { provide: FINANCE_REPOSITORY, useClass: PrismaFinanceRepository },
  ],
})
export class FinanceModule {}
