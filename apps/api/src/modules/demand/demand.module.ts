import { Module } from "@nestjs/common";
import { WorkflowModule } from "../workflow/workflow.module";
import { BusinessCasesService } from "./application/business-cases.service";
import { DemandsService } from "./application/demands.service";
import { BUSINESS_CASE_REPOSITORY } from "./domain/business-case.repository";
import { DEMAND_REPOSITORY } from "./domain/demand.repository";
import { PrismaBusinessCaseRepository } from "./infrastructure/prisma-business-case.repository";
import { PrismaDemandRepository } from "./infrastructure/prisma-demand.repository";
import { BusinessCasesController } from "./presentation/business-cases.controller";
import { DemandsController } from "./presentation/demands.controller";

/**
 * Demand Management : point d'entrée du cycle de vie, en amont du projet.
 * Couvre les demandes (workflow) et leur Business Case (justification + risques).
 */
@Module({
  imports: [WorkflowModule],
  controllers: [DemandsController, BusinessCasesController],
  providers: [
    DemandsService,
    BusinessCasesService,
    { provide: DEMAND_REPOSITORY, useClass: PrismaDemandRepository },
    { provide: BUSINESS_CASE_REPOSITORY, useClass: PrismaBusinessCaseRepository },
  ],
  exports: [DemandsService, BusinessCasesService],
})
export class DemandModule {}
