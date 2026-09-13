import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { WorkflowService } from "../../workflow/application/workflow.service";
import {
  DEFAULT_DEMAND_WORKFLOW,
  DEMAND_WORKFLOW_KEY,
  T_FINANCE_CREATES_PROJECT,
} from "../domain/demand-workflow";

const REMOVED_STATE = "manager_review";
const FALLBACK_STATE = "pmo_qualification";

/**
 * Met à niveau, au démarrage, les circuits de demande déjà présents en base
 * (la validation Manager a été retirée et la bifurcation Finance ajoutée). Les
 * définitions par organisation sont créées à la volée : ce correctif rejoue la
 * nouvelle définition sur les organisations existantes. Idempotent — les
 * circuits déjà à jour sont ignorés. Les instances encore à l'étape Manager
 * sont ramenées à la Qualification PMO avant la suppression de l'état.
 */
@Injectable()
export class DemandWorkflowUpgradeService implements OnModuleInit {
  private readonly logger = new Logger(DemandWorkflowUpgradeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.upgrade();
    } catch (error) {
      // Un échec de mise à niveau ne doit pas empêcher l'API de démarrer.
      this.logger.error("Mise à niveau du circuit des demandes échouée", error as Error);
    }
  }

  private async upgrade(): Promise<void> {
    const definitions = await this.prisma.workflowDefinition.findMany({
      where: { key: DEMAND_WORKFLOW_KEY },
      select: {
        organizationId: true,
        states: { select: { id: true, key: true } },
        transitions: { select: { key: true } },
      },
    });

    for (const definition of definitions) {
      const managerState = definition.states.find((state) => state.key === REMOVED_STATE);
      const hasFinanceDirect = definition.transitions.some(
        (transition) => transition.key === T_FINANCE_CREATES_PROJECT,
      );
      if (!managerState && hasFinanceDirect) {
        continue; // Déjà à jour.
      }

      // Aucune instance ne doit plus référencer l'état supprimé (contrainte FK).
      if (managerState) {
        const fallback = definition.states.find((state) => state.key === FALLBACK_STATE);
        if (fallback) {
          await this.prisma.workflowInstance.updateMany({
            where: { currentStateId: managerState.id },
            data: { currentStateId: fallback.id },
          });
        }
      }

      await this.workflow.defineWorkflow(definition.organizationId, DEFAULT_DEMAND_WORKFLOW);
      this.logger.log(
        `Circuit des demandes mis à niveau pour l'organisation ${definition.organizationId}`,
      );
    }
  }
}
