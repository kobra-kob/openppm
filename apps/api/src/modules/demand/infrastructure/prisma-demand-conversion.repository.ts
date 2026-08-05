import { Injectable } from "@nestjs/common";
import {
  ApprovalDecision,
  BudgetRequestStatus,
  ProjectRole,
  ProjectStatus,
  RoleKey,
} from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { formatProjectCode, PROJECT_CODE_PREFIX } from "../../project/domain/project-code";
import type {
  ConvertDemandInput,
  ConvertDemandResult,
  DemandConversionRepository,
} from "../domain/demand-conversion.repository";
import { computeSeverity } from "../domain/risk-severity";

@Injectable()
export class PrismaDemandConversionRepository implements DemandConversionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isConverted(demandId: string): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { demandId },
      select: { id: true },
    });
    return project !== null;
  }

  async convert(input: ConvertDemandInput): Promise<ConvertDemandResult> {
    const hasBudget =
      input.portfolioId !== null &&
      input.estimatedBudget !== null &&
      input.estimatedBudget > 0;

    return this.prisma.$transaction(async (tx) => {
      const code = await this.nextProjectCode(tx, input.organizationId);

      // Chef de projet par défaut = demandeur ; le déclencheur rejoint l'équipe.
      const members = new Map<string, ProjectRole>();
      members.set(input.requesterId, ProjectRole.manager);
      members.set(input.actorId, ProjectRole.manager);

      const project = await tx.project.create({
        data: {
          organizationId: input.organizationId,
          code,
          name: input.name,
          description: input.description,
          priority: input.priority,
          portfolioId: input.portfolioId,
          managerId: input.requesterId,
          demandId: input.demandId,
          createdById: input.actorId,
          status: hasBudget ? ProjectStatus.active : ProjectStatus.draft,
          budget: hasBudget ? input.estimatedBudget : null,
          members: {
            create: [...members.entries()].map(([userId, role]) => ({ userId, role })),
          },
        },
        select: { id: true, code: true },
      });

      // Le vote du comité vaut acte de gouvernance : on matérialise une demande
      // de budget déjà approuvée (revue Finance + validation Direction).
      if (hasBudget) {
        const now = new Date();
        await tx.budgetRequest.create({
          data: {
            organizationId: input.organizationId,
            projectId: project.id,
            amount: input.estimatedBudget!,
            capexAmount: 0,
            opexAmount: input.estimatedBudget!,
            justification: `Budget issu de la demande ${input.reference}, approuvée en comité.`,
            status: BudgetRequestStatus.approved,
            currentStep: 1,
            requestedById: input.actorId,
            decidedAt: now,
            steps: {
              create: [
                {
                  stepOrder: 0,
                  approverRole: RoleKey.finance,
                  status: ApprovalDecision.approved,
                  decidedById: input.actorId,
                  decidedAt: now,
                },
                {
                  stepOrder: 1,
                  approverRole: RoleKey.admin,
                  status: ApprovalDecision.approved,
                  decidedById: input.actorId,
                  decidedAt: now,
                },
              ],
            },
          },
        });
      }

      // Reprise des pièces jointes de la demande vers le projet.
      const movedDocuments = await tx.document.updateMany({
        where: { demandId: input.demandId },
        data: { projectId: project.id, demandId: null },
      });

      // Reprise des risques identifiés dans le Business Case → registre projet.
      const businessCase = await tx.businessCase.findUnique({
        where: { demandId: input.demandId },
        include: { risks: true },
      });
      let transferredRisks = 0;
      if (businessCase && businessCase.risks.length > 0) {
        await tx.risk.createMany({
          data: businessCase.risks.map((risk) => ({
            organizationId: input.organizationId,
            projectId: project.id,
            label: risk.label,
            probability: risk.probability,
            impact: risk.impact,
            severity: computeSeverity(risk.probability, risk.impact),
            mitigation: risk.mitigation,
            sourceBusinessCaseRiskId: risk.id,
          })),
        });
        transferredRisks = businessCase.risks.length;
      }

      return {
        projectId: project.id,
        projectCode: project.code,
        budgetApproved: hasBudget,
        transferredDocuments: movedDocuments.count,
        transferredRisks,
      };
    });
  }

  /** Plus grand numéro de séquence PROJxxxxx déjà attribué, + 1. */
  private async nextProjectCode(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    organizationId: string,
  ): Promise<string> {
    const rows = await tx.project.findMany({
      where: { organizationId, code: { startsWith: PROJECT_CODE_PREFIX } },
      select: { code: true },
    });
    const max = rows.reduce((acc, { code }) => {
      const sequence = Number.parseInt(code.slice(PROJECT_CODE_PREFIX.length), 10);
      return Number.isNaN(sequence) ? acc : Math.max(acc, sequence);
    }, 0);
    return formatProjectCode(max + 1);
  }
}
