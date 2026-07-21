import { Module } from "@nestjs/common";
import { PortfoliosService } from "./application/portfolios.service";
import { PORTFOLIO_REPOSITORY } from "./domain/portfolio.repository";
import { PrismaPortfolioRepository } from "./infrastructure/prisma-portfolio.repository";
import { PortfoliosController } from "./presentation/portfolios.controller";

@Module({
  controllers: [PortfoliosController],
  providers: [
    PortfoliosService,
    { provide: PORTFOLIO_REPOSITORY, useClass: PrismaPortfolioRepository },
  ],
})
export class PortfolioModule {}
