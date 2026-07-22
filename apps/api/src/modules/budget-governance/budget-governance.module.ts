import { Module } from "@nestjs/common";
import { BudgetGovernanceService } from "./application/budget-governance.service";
import { BUDGET_GOVERNANCE_REPOSITORY } from "./domain/budget-governance.repository";
import { PrismaBudgetGovernanceRepository } from "./infrastructure/prisma-budget-governance.repository";
import { BudgetGovernanceController } from "./presentation/budget-governance.controller";

@Module({
  controllers: [BudgetGovernanceController],
  providers: [
    BudgetGovernanceService,
    { provide: BUDGET_GOVERNANCE_REPOSITORY, useClass: PrismaBudgetGovernanceRepository },
  ],
})
export class BudgetGovernanceModule {}
