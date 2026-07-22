import { Injectable } from "@nestjs/common";
import {
  ApprovalDecision,
  BudgetRequestStatus,
  Prisma,
  ProjectStatus,
} from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import {
  BudgetGovernanceRepository,
  BudgetRequestWithSteps,
  CreateBudgetRequestInput,
  ProjectGovernanceContext,
} from "../domain/budget-governance.repository";

const REQUEST_INCLUDE = {
  requestedBy: { select: { firstName: true, lastName: true } },
  steps: {
    include: { decidedBy: { select: { firstName: true, lastName: true } } },
    orderBy: { stepOrder: "asc" as const },
  },
} as const;

@Injectable()
export class PrismaBudgetGovernanceRepository
  implements BudgetGovernanceRepository
{
  constructor(private readonly prisma: PrismaService) {}

  loadProjectContext(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectGovernanceContext | null> {
    return this.prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        status: true,
        portfolioId: true,
        managerId: true,
        members: { select: { userId: true, role: true } },
      },
    });
  }

  findLatestRequest(projectId: string): Promise<BudgetRequestWithSteps | null> {
    return this.prisma.budgetRequest.findFirst({
      where: { projectId },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async hasPendingRequest(projectId: string): Promise<boolean> {
    const found = await this.prisma.budgetRequest.findFirst({
      where: { projectId, status: BudgetRequestStatus.pending },
      select: { id: true },
    });
    return found !== null;
  }

  create(input: CreateBudgetRequestInput): Promise<BudgetRequestWithSteps> {
    return this.prisma.budgetRequest.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        amount: input.amount,
        capexAmount: input.capexAmount,
        opexAmount: input.opexAmount,
        justification: input.justification ?? null,
        requestedById: input.requestedById,
        steps: { create: input.steps },
      },
      include: REQUEST_INCLUDE,
    });
  }

  findRequestById(
    organizationId: string,
    requestId: string,
  ): Promise<BudgetRequestWithSteps | null> {
    return this.prisma.budgetRequest.findFirst({
      where: { id: requestId, organizationId },
      include: REQUEST_INCLUDE,
    });
  }

  async decideStep(input: {
    requestId: string;
    stepId: string;
    decision: ApprovalDecision;
    decidedById: string;
    comment?: string;
    finalize?: { projectId: string; amount: number; activate: boolean };
    nextStep?: number;
    requestStatus?: "approved" | "rejected";
  }): Promise<void> {
    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.approvalStep.update({
        where: { id: input.stepId },
        data: {
          status: input.decision,
          decidedById: input.decidedById,
          comment: input.comment ?? null,
          decidedAt: new Date(),
        },
      }),
    ];
    if (input.requestStatus) {
      operations.push(
        this.prisma.budgetRequest.update({
          where: { id: input.requestId },
          data: {
            status:
              input.requestStatus === "approved"
                ? BudgetRequestStatus.approved
                : BudgetRequestStatus.rejected,
            decidedAt: new Date(),
          },
        }),
      );
    } else if (input.nextStep !== undefined) {
      operations.push(
        this.prisma.budgetRequest.update({
          where: { id: input.requestId },
          data: { currentStep: input.nextStep },
        }),
      );
    }
    if (input.finalize) {
      operations.push(
        this.prisma.project.update({
          where: { id: input.finalize.projectId },
          data: {
            budget: input.finalize.amount,
            ...(input.finalize.activate ? { status: ProjectStatus.active } : {}),
          },
        }),
      );
    }
    await this.prisma.$transaction(operations);
  }
}
