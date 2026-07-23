import { Module } from "@nestjs/common";
import { WorkflowModule } from "../workflow/workflow.module";
import { DemandsService } from "./application/demands.service";
import { DEMAND_REPOSITORY } from "./domain/demand.repository";
import { PrismaDemandRepository } from "./infrastructure/prisma-demand.repository";
import { DemandsController } from "./presentation/demands.controller";

/**
 * Demand Management : point d'entrée du cycle de vie, en amont du projet.
 * Le moteur de workflow est importé dès maintenant — il pilotera l'avancement
 * des demandes au lot suivant.
 */
@Module({
  imports: [WorkflowModule],
  controllers: [DemandsController],
  providers: [DemandsService, { provide: DEMAND_REPOSITORY, useClass: PrismaDemandRepository }],
  exports: [DemandsService],
})
export class DemandModule {}
