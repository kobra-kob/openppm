import { Injectable } from "@nestjs/common";
import { Prisma } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type {
  BusinessCaseRecord,
  BusinessCaseRepository,
  UpsertBusinessCaseInput,
} from "../domain/business-case.repository";

const BUSINESS_CASE_INCLUDE = {
  createdBy: { select: { firstName: true, lastName: true } },
  risks: { orderBy: { createdAt: "asc" } },
} as const;

type BusinessCaseRow = Prisma.BusinessCaseGetPayload<{
  include: typeof BUSINESS_CASE_INCLUDE;
}>;

@Injectable()
export class PrismaBusinessCaseRepository implements BusinessCaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByDemandId(demandId: string): Promise<BusinessCaseRecord | null> {
    const row = await this.prisma.businessCase.findUnique({
      where: { demandId },
      include: BUSINESS_CASE_INCLUDE,
    });
    return row ? this.toRecord(row) : null;
  }

  async upsert(input: UpsertBusinessCaseInput): Promise<BusinessCaseRecord> {
    const scalars = {
      roi: input.roi,
      costs: input.costs,
      benefits: input.benefits,
      assumptions: input.assumptions,
      resources: input.resources,
      dependencies: input.dependencies,
      plannedStartDate: input.plannedStartDate,
      plannedEndDate: input.plannedEndDate,
    };
    const risksCreate = {
      create: input.risks.map((risk) => ({
        label: risk.label,
        probability: risk.probability,
        impact: risk.impact,
        mitigation: risk.mitigation,
      })),
    };

    // Les risques sont remplacés intégralement à chaque enregistrement.
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.businessCase.findUnique({
        where: { demandId: input.demandId },
        select: { id: true },
      });
      if (existing) {
        await tx.businessCaseRisk.deleteMany({ where: { businessCaseId: existing.id } });
        return tx.businessCase.update({
          where: { id: existing.id },
          data: { ...scalars, risks: risksCreate },
          include: BUSINESS_CASE_INCLUDE,
        });
      }
      return tx.businessCase.create({
        data: {
          demandId: input.demandId,
          createdById: input.createdById,
          ...scalars,
          risks: risksCreate,
        },
        include: BUSINESS_CASE_INCLUDE,
      });
    });

    return this.toRecord(row);
  }

  private toRecord(row: BusinessCaseRow): BusinessCaseRecord {
    return {
      id: row.id,
      demandId: row.demandId,
      roi: row.roi,
      costs: row.costs,
      benefits: row.benefits,
      assumptions: row.assumptions,
      resources: row.resources,
      dependencies: row.dependencies,
      plannedStartDate: row.plannedStartDate,
      plannedEndDate: row.plannedEndDate,
      createdById: row.createdById,
      createdByName: `${row.createdBy.firstName} ${row.createdBy.lastName}`.trim(),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      risks: row.risks.map((risk) => ({
        id: risk.id,
        label: risk.label,
        probability: risk.probability,
        impact: risk.impact,
        mitigation: risk.mitigation,
      })),
    };
  }
}
