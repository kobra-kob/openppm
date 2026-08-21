import { Module } from "@nestjs/common";
import { BUDGET_GOVERNANCE_REPOSITORY } from "../budget-governance/domain/budget-governance.repository";
import { PrismaBudgetGovernanceRepository } from "../budget-governance/infrastructure/prisma-budget-governance.repository";
import { DEMAND_REPOSITORY } from "../demand/domain/demand.repository";
import { PrismaDemandRepository } from "../demand/infrastructure/prisma-demand.repository";
import { WORKFLOW_REPOSITORY } from "../workflow/domain/workflow.repository";
import { PrismaWorkflowRepository } from "../workflow/infrastructure/prisma-workflow.repository";
import { ValidationsService } from "./application/validations.service";
import { ValidationsController } from "./presentation/validations.controller";

/**
 * Espace « Mes validations » : agrège, en lecture seule, les files d'attente de
 * décision issues de la gouvernance budgétaire et du workflow des demandes. Les
 * dépôts (stateless) sont re-fournis ici ; PrismaService est global.
 */
@Module({
  controllers: [ValidationsController],
  providers: [
    ValidationsService,
    { provide: BUDGET_GOVERNANCE_REPOSITORY, useClass: PrismaBudgetGovernanceRepository },
    { provide: DEMAND_REPOSITORY, useClass: PrismaDemandRepository },
    { provide: WORKFLOW_REPOSITORY, useClass: PrismaWorkflowRepository },
  ],
})
export class ValidationsModule {}
