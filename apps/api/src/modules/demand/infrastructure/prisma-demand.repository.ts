import { Injectable } from "@nestjs/common";
import { Prisma } from "@openppm/db";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { DEMAND_CODE_PREFIX } from "../domain/demand-code";
import type {
  CreateDemandInput,
  DemandListFilters,
  DemandRecord,
  DemandRepository,
  UpdateDemandInput,
} from "../domain/demand.repository";

const DEMAND_INCLUDE = {
  requester: { select: { firstName: true, lastName: true } },
  targetPortfolio: { select: { id: true, name: true } },
  tags: { orderBy: { label: "asc" } },
  project: { select: { id: true, code: true } },
} as const;

type DemandRow = Prisma.DemandGetPayload<{ include: typeof DEMAND_INCLUDE }>;

@Injectable()
export class PrismaDemandRepository implements DemandRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filters: DemandListFilters,
  ): Promise<{ items: DemandRecord[]; total: number }> {
    const where: Prisma.DemandWhereInput = {
      organizationId: filters.organizationId,
      deletedAt: null,
      ...(filters.requesterId ? { requesterId: filters.requesterId } : {}),
      ...(filters.targetPortfolioId ? { targetPortfolioId: filters.targetPortfolioId } : {}),
      ...(filters.search
        ? {
            OR: [
              { title: { contains: filters.search } },
              { reference: { contains: filters.search } },
              { description: { contains: filters.search } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.demand.findMany({
        where,
        include: DEMAND_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.demand.count({ where }),
    ]);
    return { items: rows.map((row) => toRecord(row)), total };
  }

  async findById(organizationId: string, id: string): Promise<DemandRecord | null> {
    const found = await this.prisma.demand.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: DEMAND_INCLUDE,
    });
    return found ? toRecord(found) : null;
  }

  async findSummariesByIds(organizationId: string, ids: string[]) {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.demand.findMany({
      where: { organizationId, id: { in: ids }, deletedAt: null },
      select: { id: true, reference: true, title: true, requesterId: true },
    });
    return rows;
  }

  async create(input: CreateDemandInput): Promise<DemandRecord> {
    const created = await this.prisma.demand.create({
      data: {
        organizationId: input.organizationId,
        reference: input.reference,
        title: input.title,
        description: input.description,
        objectives: input.objectives,
        justification: input.justification,
        requesterId: input.requesterId,
        department: input.department,
        priority: input.priority,
        urgency: input.urgency,
        estimatedBudget: input.estimatedBudget,
        estimatedDurationDays: input.estimatedDurationDays,
        targetPortfolioId: input.targetPortfolioId,
        tags: { create: input.tags.map((label) => ({ label })) },
      },
      include: DEMAND_INCLUDE,
    });
    return toRecord(created);
  }

  async update(id: string, input: UpdateDemandInput): Promise<DemandRecord> {
    const { tags, ...fields } = input;
    const updated = await this.prisma.demand.update({
      where: { id },
      data: {
        ...fields,
        // Les étiquettes sont remplacées en bloc lorsqu'elles sont fournies
        ...(tags
          ? { tags: { deleteMany: {}, create: tags.map((label) => ({ label })) } }
          : {}),
      },
      include: DEMAND_INCLUDE,
    });
    return toRecord(updated);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.demand.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async isReferenceTaken(organizationId: string, reference: string): Promise<boolean> {
    const found = await this.prisma.demand.findUnique({
      where: { organizationId_reference: { organizationId, reference } },
      select: { id: true },
    });
    return found !== null;
  }

  async maxReferenceSequence(organizationId: string): Promise<number> {
    // Le tri lexicographique suffit : la séquence est zéro-remplie sur 5 chiffres.
    const last = await this.prisma.demand.findFirst({
      where: { organizationId, reference: { startsWith: DEMAND_CODE_PREFIX } },
      orderBy: { reference: "desc" },
      select: { reference: true },
    });
    if (!last) {
      return 0;
    }
    const sequence = Number.parseInt(last.reference.slice(DEMAND_CODE_PREFIX.length), 10);
    return Number.isFinite(sequence) ? sequence : 0;
  }

  async portfolioExists(organizationId: string, portfolioId: string): Promise<boolean> {
    const found = await this.prisma.portfolio.findFirst({
      where: { id: portfolioId, organizationId, deletedAt: null },
      select: { id: true },
    });
    return found !== null;
  }
}

function toRecord(row: DemandRow): DemandRecord {
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    description: row.description,
    objectives: row.objectives,
    justification: row.justification,
    requesterId: row.requesterId,
    requesterName: `${row.requester.firstName} ${row.requester.lastName}`,
    department: row.department,
    priority: row.priority,
    urgency: row.urgency,
    estimatedBudget: row.estimatedBudget?.toString() ?? null,
    estimatedDurationDays: row.estimatedDurationDays,
    targetPortfolio: row.targetPortfolio
      ? { id: row.targetPortfolio.id, name: row.targetPortfolio.name }
      : null,
    tags: row.tags.map((tag) => tag.label),
    project: row.project ? { id: row.project.id, code: row.project.code } : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
