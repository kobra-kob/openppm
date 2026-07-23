import { Module } from "@nestjs/common";
import { WorkflowService } from "./application/workflow.service";
import { WORKFLOW_REPOSITORY } from "./domain/workflow.repository";
import { PrismaWorkflowRepository } from "./infrastructure/prisma-workflow.repository";

/**
 * Moteur de workflow générique. Exporté pour être consommé par les modules
 * métier (demandes, puis éventuellement projets, risques, changements…).
 */
@Module({
  providers: [WorkflowService, { provide: WORKFLOW_REPOSITORY, useClass: PrismaWorkflowRepository }],
  exports: [WorkflowService],
})
export class WorkflowModule {}
