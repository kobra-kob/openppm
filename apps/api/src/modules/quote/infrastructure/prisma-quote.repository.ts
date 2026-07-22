import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type {
  CreateQuoteInput,
  ProjectQuoteContext,
  QuoteLineRecord,
  QuoteRecord,
  QuoteRepository,
  QuoteStatusPatch,
} from "../domain/quote.repository";

const QUOTE_INCLUDE = {
  lines: { orderBy: { position: "asc" } },
  createdBy: { select: { firstName: true, lastName: true } },
  reviewedBy: { select: { firstName: true, lastName: true } },
  approvedBy: { select: { firstName: true, lastName: true } },
} as const;

type QuoteRow = {
  id: string;
  projectId: string;
  reference: string;
  title: string;
  customerName: string | null;
  status: QuoteRecord["status"];
  revision: number;
  vatRate: { toString(): string };
  validUntil: Date | null;
  notes: string | null;
  createdById: string;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  approvedAt: Date | null;
  decisionComment: string | null;
  createdAt: Date;
  lines: Array<{
    id: string;
    label: string;
    quantity: { toString(): string };
    unitPrice: { toString(): string };
    discountRate: { toString(): string };
    position: number;
  }>;
  createdBy: { firstName: string; lastName: string };
  reviewedBy: { firstName: string; lastName: string } | null;
  approvedBy: { firstName: string; lastName: string } | null;
};

@Injectable()
export class PrismaQuoteRepository implements QuoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async loadProjectContext(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectQuoteContext | null> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: { id: true, managerId: true, members: { select: { userId: true, role: true } } },
    });
    return project ?? null;
  }

  countQuotes(organizationId: string): Promise<number> {
    return this.prisma.quote.count({ where: { organizationId } });
  }

  async list(projectId: string): Promise<QuoteRecord[]> {
    const quotes = await this.prisma.quote.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: QUOTE_INCLUDE,
    });
    return quotes.map((quote) => this.toRecord(quote));
  }

  async findById(organizationId: string, quoteId: string): Promise<QuoteRecord | null> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, organizationId },
      include: QUOTE_INCLUDE,
    });
    return quote ? this.toRecord(quote) : null;
  }

  async create(input: CreateQuoteInput): Promise<QuoteRecord> {
    const quote = await this.prisma.quote.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        reference: input.reference,
        title: input.title,
        customerName: input.customerName,
        vatRate: input.vatRate,
        validUntil: input.validUntil,
        notes: input.notes,
        revision: input.revision,
        createdById: input.createdById,
      },
      include: QUOTE_INCLUDE,
    });
    return this.toRecord(quote);
  }

  async updateHeader(
    quoteId: string,
    data: {
      title?: string;
      customerName?: string | null;
      vatRate?: number;
      validUntil?: Date | null;
      notes?: string | null;
    },
  ): Promise<QuoteRecord> {
    const quote = await this.prisma.quote.update({
      where: { id: quoteId },
      data,
      include: QUOTE_INCLUDE,
    });
    return this.toRecord(quote);
  }

  async updateStatus(quoteId: string, patch: QuoteStatusPatch): Promise<QuoteRecord> {
    const quote = await this.prisma.quote.update({
      where: { id: quoteId },
      data: patch,
      include: QUOTE_INCLUDE,
    });
    return this.toRecord(quote);
  }

  async delete(quoteId: string): Promise<void> {
    await this.prisma.quote.delete({ where: { id: quoteId } });
  }

  async addLine(
    quoteId: string,
    data: { label: string; quantity: number; unitPrice: number; discountRate: number; position: number },
  ): Promise<QuoteRecord> {
    await this.prisma.quoteLine.create({ data: { quoteId, ...data } });
    const quote = await this.prisma.quote.findUniqueOrThrow({
      where: { id: quoteId },
      include: QUOTE_INCLUDE,
    });
    return this.toRecord(quote);
  }

  async updateLine(
    lineId: string,
    data: { label?: string; quantity?: number; unitPrice?: number; discountRate?: number },
  ): Promise<void> {
    await this.prisma.quoteLine.update({ where: { id: lineId }, data });
  }

  async findLine(quoteId: string, lineId: string): Promise<QuoteLineRecord | null> {
    const line = await this.prisma.quoteLine.findFirst({ where: { id: lineId, quoteId } });
    if (!line) {
      return null;
    }
    return {
      id: line.id,
      label: line.label,
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
      discountRate: line.discountRate.toString(),
      position: line.position,
    };
  }

  async deleteLine(lineId: string): Promise<void> {
    await this.prisma.quoteLine.delete({ where: { id: lineId } });
  }

  async maxLinePosition(quoteId: string): Promise<number> {
    const result = await this.prisma.quoteLine.aggregate({
      where: { quoteId },
      _max: { position: true },
    });
    return result._max.position ?? -1;
  }

  async duplicate(sourceQuoteId: string, input: CreateQuoteInput): Promise<QuoteRecord> {
    const source = await this.prisma.quoteLine.findMany({
      where: { quoteId: sourceQuoteId },
      orderBy: { position: "asc" },
    });
    const quote = await this.prisma.quote.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        reference: input.reference,
        title: input.title,
        customerName: input.customerName,
        vatRate: input.vatRate,
        validUntil: input.validUntil,
        notes: input.notes,
        revision: input.revision,
        createdById: input.createdById,
        lines: {
          create: source.map((line) => ({
            label: line.label,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountRate: line.discountRate,
            position: line.position,
          })),
        },
      },
      include: QUOTE_INCLUDE,
    });
    return this.toRecord(quote);
  }

  private toRecord(quote: QuoteRow): QuoteRecord {
    return {
      id: quote.id,
      projectId: quote.projectId,
      reference: quote.reference,
      title: quote.title,
      customerName: quote.customerName,
      status: quote.status,
      revision: quote.revision,
      vatRate: quote.vatRate.toString(),
      validUntil: quote.validUntil,
      notes: quote.notes,
      createdById: quote.createdById,
      createdByName: `${quote.createdBy.firstName} ${quote.createdBy.lastName}`,
      submittedAt: quote.submittedAt,
      reviewedByName: quote.reviewedBy
        ? `${quote.reviewedBy.firstName} ${quote.reviewedBy.lastName}`
        : null,
      reviewedAt: quote.reviewedAt,
      approvedByName: quote.approvedBy
        ? `${quote.approvedBy.firstName} ${quote.approvedBy.lastName}`
        : null,
      approvedAt: quote.approvedAt,
      decisionComment: quote.decisionComment,
      createdAt: quote.createdAt,
      lines: quote.lines.map((line) => ({
        id: line.id,
        label: line.label,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toString(),
        discountRate: line.discountRate.toString(),
        position: line.position,
      })),
    };
  }
}
