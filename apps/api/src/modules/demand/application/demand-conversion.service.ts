import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../../../core/audit/audit.service";
import { NotificationsService } from "../../../core/notifications/notifications.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { DEMAND_CONVERSION_REPOSITORY } from "../domain/demand-conversion.repository";
import type {
  ConvertDemandResult,
  DemandConversionRepository,
} from "../domain/demand-conversion.repository";
import type { DemandRecord } from "../domain/demand.repository";

@Injectable()
export class DemandConversionService {
  constructor(
    @Inject(DEMAND_CONVERSION_REPOSITORY)
    private readonly repository: DemandConversionRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Convertit une demande approuvée en projet. Idempotent : si un projet est
   * déjà rattaché à la demande, retourne null sans rien recréer.
   */
  async convertFromDemand(
    payload: JwtPayload,
    demand: DemandRecord,
    context: RequestContext,
  ): Promise<ConvertDemandResult | null> {
    if (await this.repository.isConverted(demand.id)) {
      return null;
    }

    const result = await this.repository.convert({
      organizationId: payload.org,
      demandId: demand.id,
      reference: demand.reference,
      actorId: payload.sub,
      requesterId: demand.requesterId,
      name: demand.title,
      description: demand.description,
      priority: demand.priority,
      portfolioId: demand.targetPortfolio?.id ?? null,
      estimatedBudget: demand.estimatedBudget !== null ? Number(demand.estimatedBudget) : null,
    });

    await this.audit.log({
      action: "demand.converted",
      entityType: "demand",
      entityId: demand.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: {
        projectId: result.projectId,
        projectCode: result.projectCode,
        budgetApproved: result.budgetApproved,
        transferredDocuments: result.transferredDocuments,
        transferredRisks: result.transferredRisks,
      },
      ...context,
    });

    // Informe le demandeur que son projet est créé (hors action de sa part).
    if (demand.requesterId !== payload.sub) {
      await this.notifications.notify({
        organizationId: payload.org,
        userId: demand.requesterId,
        type: "demand.transition",
        payload: {
          demandId: demand.id,
          reference: demand.reference,
          stateLabel: `Projet ${result.projectCode} créé`,
          actorName: payload.name,
        },
      });
    }

    return result;
  }
}
