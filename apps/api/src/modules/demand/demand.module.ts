import { Module } from "@nestjs/common";
import { WorkflowModule } from "../workflow/workflow.module";
import { BusinessCasesService } from "./application/business-cases.service";
import { DemandConversionService } from "./application/demand-conversion.service";
import { DemandsService } from "./application/demands.service";
import { BUSINESS_CASE_REPOSITORY } from "./domain/business-case.repository";
import { DEMAND_CONVERSION_REPOSITORY } from "./domain/demand-conversion.repository";
import { DEMAND_REPOSITORY } from "./domain/demand.repository";
import { PrismaBusinessCaseRepository } from "./infrastructure/prisma-business-case.repository";
import { PrismaDemandConversionRepository } from "./infrastructure/prisma-demand-conversion.repository";
import { PrismaDemandRepository } from "./infrastructure/prisma-demand.repository";
import { BusinessCasesController } from "./presentation/business-cases.controller";
import { DemandsController } from "./presentation/demands.controller";

/**
 * Demand Management : point d'entrée du cycle de vie, en amont du projet.
 * Couvre les demandes (workflow), leur Business Case (justification + risques)
 * et la conversion automatique en projet à l'approbation du comité.
 */
@Module({
  imports: [WorkflowModule],
  controllers: [DemandsController, BusinessCasesController],
  providers: [
    DemandsService,
    BusinessCasesService,
    DemandConversionService,
    { provide: DEMAND_REPOSITORY, useClass: PrismaDemandRepository },
    { provide: BUSINESS_CASE_REPOSITORY, useClass: PrismaBusinessCaseRepository },
    { provide: DEMAND_CONVERSION_REPOSITORY, useClass: PrismaDemandConversionRepository },
  ],
  exports: [DemandsService, BusinessCasesService],
})
export class DemandModule {}
