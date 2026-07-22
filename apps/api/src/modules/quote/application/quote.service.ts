import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, ProjectRole, QuoteStatus, RoleKey } from "@openppm/db";
import { AuditService } from "../../../core/audit/audit.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { QUOTE_REPOSITORY } from "../domain/quote.repository";
import { computeQuoteTotals, lineTotalHT } from "../domain/quote-totals";
import type {
  ProjectQuoteContext,
  QuoteRecord,
  QuoteRepository,
} from "../domain/quote.repository";
import type {
  CreateQuoteDto,
  CreateQuoteLineDto,
  DecideQuoteDto,
  UpdateQuoteDto,
  UpdateQuoteLineDto,
} from "./dto/quote.dtos";

/** Rôles pouvant rédiger/éditer un devis. */
const QUOTE_EDITOR_ROLES: string[] = [RoleKey.admin, RoleKey.manager, RoleKey.pmo, RoleKey.finance];
/** Niveau 1 (revue) : encadrement projet. */
const QUOTE_REVIEWER_ROLES: string[] = [RoleKey.admin, RoleKey.manager, RoleKey.pmo];
/** Niveau 2 (validation finale) : finance / direction. */
const QUOTE_APPROVER_ROLES: string[] = [RoleKey.admin, RoleKey.finance];

export interface QuoteLineView {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  discountRate: number;
  lineTotalHT: number;
}

export interface QuoteView {
  id: string;
  reference: string;
  title: string;
  customerName: string | null;
  status: QuoteStatus;
  revision: number;
  vatRate: number;
  validUntil: string | null;
  notes: string | null;
  createdByName: string;
  submittedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  decisionComment: string | null;
  createdAt: string;
  totalHT: number;
  vatAmount: number;
  totalTTC: number;
  lineCount: number;
  lines: QuoteLineView[];
  can: {
    edit: boolean;
    submit: boolean;
    review: boolean;
    approve: boolean;
  };
}

@Injectable()
export class QuoteService {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly repository: QuoteRepository,
    private readonly audit: AuditService,
  ) {}

  async list(payload: JwtPayload, projectId: string): Promise<QuoteView[]> {
    const project = await this.requireProject(payload, projectId);
    const quotes = await this.repository.list(projectId);
    return quotes.map((quote) => this.toView(payload, project, quote));
  }

  async get(payload: JwtPayload, projectId: string, quoteId: string): Promise<QuoteView> {
    const project = await this.requireProject(payload, projectId);
    const quote = await this.requireQuote(payload, projectId, quoteId);
    return this.toView(payload, project, quote);
  }

  async create(
    payload: JwtPayload,
    projectId: string,
    dto: CreateQuoteDto,
    context: RequestContext,
  ): Promise<QuoteView> {
    const project = await this.requireProject(payload, projectId);
    this.assertCanEdit(payload, project);
    const reference = await this.nextReference(payload.org);
    const quote = await this.repository.create({
      organizationId: payload.org,
      projectId,
      reference,
      title: dto.title,
      customerName: dto.customerName ?? null,
      vatRate: dto.vatRate ?? 20,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      notes: dto.notes ?? null,
      revision: 1,
      createdById: payload.sub,
    });
    await this.log(payload, context, "quote.created", quote.id, { reference });
    return this.toView(payload, project, quote);
  }

  async update(
    payload: JwtPayload,
    projectId: string,
    quoteId: string,
    dto: UpdateQuoteDto,
    context: RequestContext,
  ): Promise<QuoteView> {
    const project = await this.requireProject(payload, projectId);
    const quote = await this.requireQuote(payload, projectId, quoteId);
    this.assertCanEdit(payload, project);
    this.assertDraft(quote);
    const updated = await this.repository.updateHeader(quoteId, {
      title: dto.title,
      customerName: dto.customerName,
      vatRate: dto.vatRate,
      validUntil: dto.validUntil === undefined ? undefined : dto.validUntil ? new Date(dto.validUntil) : null,
      notes: dto.notes,
    });
    await this.log(payload, context, "quote.updated", quoteId, { ...dto });
    return this.toView(payload, project, updated);
  }

  async remove(
    payload: JwtPayload,
    projectId: string,
    quoteId: string,
    context: RequestContext,
  ): Promise<void> {
    const project = await this.requireProject(payload, projectId);
    const quote = await this.requireQuote(payload, projectId, quoteId);
    this.assertCanEdit(payload, project);
    await this.repository.delete(quoteId);
    await this.log(payload, context, "quote.deleted", quoteId, { reference: quote.reference });
  }

  async addLine(
    payload: JwtPayload,
    projectId: string,
    quoteId: string,
    dto: CreateQuoteLineDto,
    context: RequestContext,
  ): Promise<QuoteView> {
    const project = await this.requireProject(payload, projectId);
    const quote = await this.requireQuote(payload, projectId, quoteId);
    this.assertCanEdit(payload, project);
    this.assertDraft(quote);
    const position = (await this.repository.maxLinePosition(quoteId)) + 1;
    const updated = await this.repository.addLine(quoteId, {
      label: dto.label,
      quantity: dto.quantity,
      unitPrice: dto.unitPrice,
      discountRate: dto.discountRate ?? 0,
      position,
    });
    await this.log(payload, context, "quote.line_added", quoteId, { label: dto.label });
    return this.toView(payload, project, updated);
  }

  async updateLine(
    payload: JwtPayload,
    projectId: string,
    quoteId: string,
    lineId: string,
    dto: UpdateQuoteLineDto,
    context: RequestContext,
  ): Promise<QuoteView> {
    const project = await this.requireProject(payload, projectId);
    const quote = await this.requireQuote(payload, projectId, quoteId);
    this.assertCanEdit(payload, project);
    this.assertDraft(quote);
    const line = await this.repository.findLine(quoteId, lineId);
    if (!line) {
      throw new NotFoundException({ code: "QUOTE_LINE_NOT_FOUND", message: "Ligne introuvable" });
    }
    await this.repository.updateLine(lineId, dto);
    const updated = await this.requireQuote(payload, projectId, quoteId);
    await this.log(payload, context, "quote.line_updated", quoteId, { lineId });
    return this.toView(payload, project, updated);
  }

  async deleteLine(
    payload: JwtPayload,
    projectId: string,
    quoteId: string,
    lineId: string,
    context: RequestContext,
  ): Promise<QuoteView> {
    const project = await this.requireProject(payload, projectId);
    const quote = await this.requireQuote(payload, projectId, quoteId);
    this.assertCanEdit(payload, project);
    this.assertDraft(quote);
    const line = await this.repository.findLine(quoteId, lineId);
    if (!line) {
      throw new NotFoundException({ code: "QUOTE_LINE_NOT_FOUND", message: "Ligne introuvable" });
    }
    await this.repository.deleteLine(lineId);
    const updated = await this.requireQuote(payload, projectId, quoteId);
    await this.log(payload, context, "quote.line_deleted", quoteId, { lineId });
    return this.toView(payload, project, updated);
  }

  async submit(
    payload: JwtPayload,
    projectId: string,
    quoteId: string,
    context: RequestContext,
  ): Promise<QuoteView> {
    const project = await this.requireProject(payload, projectId);
    const quote = await this.requireQuote(payload, projectId, quoteId);
    this.assertCanEdit(payload, project);
    if (quote.status !== QuoteStatus.draft) {
      throw new BadRequestException({ code: "QUOTE_NOT_DRAFT", message: "Le devis n'est pas un brouillon" });
    }
    if (quote.lines.length === 0) {
      throw new BadRequestException({ code: "QUOTE_EMPTY", message: "Ajoutez au moins une ligne avant de soumettre" });
    }
    const updated = await this.repository.updateStatus(quoteId, {
      status: QuoteStatus.submitted,
      submittedAt: new Date(),
    });
    await this.log(payload, context, "quote.submitted", quoteId, {});
    return this.toView(payload, project, updated);
  }

  /** Niveau 1 : revue. submitted → reviewed (ou rejected). */
  async review(
    payload: JwtPayload,
    projectId: string,
    quoteId: string,
    dto: DecideQuoteDto,
    context: RequestContext,
  ): Promise<QuoteView> {
    const project = await this.requireProject(payload, projectId);
    const quote = await this.requireQuote(payload, projectId, quoteId);
    if (quote.status !== QuoteStatus.submitted) {
      throw new BadRequestException({ code: "QUOTE_NOT_SUBMITTED", message: "Le devis n'est pas en attente de revue" });
    }
    if (!this.hasAnyRole(payload, QUOTE_REVIEWER_ROLES)) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Revue niveau 1 réservée à l'encadrement" });
    }
    const updated = dto.approve
      ? await this.repository.updateStatus(quoteId, {
          status: QuoteStatus.reviewed,
          reviewedById: payload.sub,
          reviewedAt: new Date(),
          decisionComment: dto.comment ?? null,
        })
      : await this.repository.updateStatus(quoteId, {
          status: QuoteStatus.rejected,
          reviewedById: payload.sub,
          reviewedAt: new Date(),
          decisionComment: dto.comment ?? null,
        });
    await this.log(payload, context, dto.approve ? "quote.reviewed" : "quote.rejected", quoteId, {
      level: 1,
    });
    return this.toView(payload, project, updated);
  }

  /** Niveau 2 : validation finale. reviewed → approved (ou rejected). */
  async approve(
    payload: JwtPayload,
    projectId: string,
    quoteId: string,
    dto: DecideQuoteDto,
    context: RequestContext,
  ): Promise<QuoteView> {
    const project = await this.requireProject(payload, projectId);
    const quote = await this.requireQuote(payload, projectId, quoteId);
    if (quote.status !== QuoteStatus.reviewed) {
      throw new BadRequestException({ code: "QUOTE_NOT_REVIEWED", message: "Le devis doit d'abord passer la revue niveau 1" });
    }
    if (!this.hasAnyRole(payload, QUOTE_APPROVER_ROLES)) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Validation finale réservée à la finance/direction" });
    }
    const updated = await this.repository.updateStatus(quoteId, {
      status: dto.approve ? QuoteStatus.approved : QuoteStatus.rejected,
      approvedById: payload.sub,
      approvedAt: new Date(),
      decisionComment: dto.comment ?? null,
    });
    await this.log(payload, context, dto.approve ? "quote.approved" : "quote.rejected", quoteId, {
      level: 2,
    });
    return this.toView(payload, project, updated);
  }

  /** Repart d'un devis clôturé (approuvé/rejeté) en nouveau brouillon révisé. */
  async duplicate(
    payload: JwtPayload,
    projectId: string,
    quoteId: string,
    context: RequestContext,
  ): Promise<QuoteView> {
    const project = await this.requireProject(payload, projectId);
    const source = await this.requireQuote(payload, projectId, quoteId);
    this.assertCanEdit(payload, project);
    const reference = await this.nextReference(payload.org);
    const created = await this.repository.duplicate(quoteId, {
      organizationId: payload.org,
      projectId,
      reference,
      title: source.title,
      customerName: source.customerName,
      vatRate: Number(source.vatRate),
      validUntil: source.validUntil,
      notes: source.notes,
      revision: source.revision + 1,
      createdById: payload.sub,
    });
    await this.log(payload, context, "quote.duplicated", created.id, { from: quoteId });
    return this.toView(payload, project, created);
  }

  // ── Aides privées ────────────────────────────────────────────────────

  private async nextReference(organizationId: string): Promise<string> {
    const count = await this.repository.countQuotes(organizationId);
    return `DEV-${String(count + 1).padStart(4, "0")}`;
  }

  private toView(
    payload: JwtPayload,
    project: ProjectQuoteContext,
    quote: QuoteRecord,
  ): QuoteView {
    const vatRate = Number(quote.vatRate);
    const lines: QuoteLineView[] = quote.lines.map((line) => ({
      id: line.id,
      label: line.label,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      discountRate: Number(line.discountRate),
      lineTotalHT: lineTotalHT(line),
    }));
    const { totalHT, vatAmount, totalTTC } = computeQuoteTotals(quote.lines, vatRate);

    const canEdit = this.canEdit(payload, project) && quote.status === QuoteStatus.draft;
    return {
      id: quote.id,
      reference: quote.reference,
      title: quote.title,
      customerName: quote.customerName,
      status: quote.status,
      revision: quote.revision,
      vatRate,
      validUntil: quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : null,
      notes: quote.notes,
      createdByName: quote.createdByName,
      submittedAt: quote.submittedAt ? quote.submittedAt.toISOString() : null,
      reviewedByName: quote.reviewedByName,
      reviewedAt: quote.reviewedAt ? quote.reviewedAt.toISOString() : null,
      approvedByName: quote.approvedByName,
      approvedAt: quote.approvedAt ? quote.approvedAt.toISOString() : null,
      decisionComment: quote.decisionComment,
      createdAt: quote.createdAt.toISOString(),
      totalHT,
      vatAmount,
      totalTTC,
      lineCount: lines.length,
      lines,
      can: {
        edit: canEdit,
        submit: canEdit && lines.length > 0,
        review: quote.status === QuoteStatus.submitted && this.hasAnyRole(payload, QUOTE_REVIEWER_ROLES),
        approve: quote.status === QuoteStatus.reviewed && this.hasAnyRole(payload, QUOTE_APPROVER_ROLES),
      },
    };
  }

  private async requireProject(
    payload: JwtPayload,
    projectId: string,
  ): Promise<ProjectQuoteContext> {
    const project = await this.repository.loadProjectContext(payload.org, projectId);
    if (!project) {
      throw new NotFoundException({ code: "PROJECT_NOT_FOUND", message: "Projet introuvable" });
    }
    return project;
  }

  private async requireQuote(
    payload: JwtPayload,
    projectId: string,
    quoteId: string,
  ): Promise<QuoteRecord> {
    const quote = await this.repository.findById(payload.org, quoteId);
    if (!quote || quote.projectId !== projectId) {
      throw new NotFoundException({ code: "QUOTE_NOT_FOUND", message: "Devis introuvable" });
    }
    return quote;
  }

  private assertDraft(quote: QuoteRecord): void {
    if (quote.status !== QuoteStatus.draft) {
      throw new BadRequestException({
        code: "QUOTE_LOCKED",
        message: "Le devis n'est modifiable qu'à l'état brouillon",
      });
    }
  }

  private assertCanEdit(payload: JwtPayload, project: ProjectQuoteContext): void {
    if (!this.canEdit(payload, project)) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Vous n'avez pas les droits pour gérer les devis de ce projet",
      });
    }
  }

  private canEdit(payload: JwtPayload, project: ProjectQuoteContext): boolean {
    if (this.hasAnyRole(payload, QUOTE_EDITOR_ROLES)) {
      return true;
    }
    if (project.managerId === payload.sub) {
      return true;
    }
    return project.members.some(
      (member) => member.userId === payload.sub && member.role === ProjectRole.manager,
    );
  }

  private hasAnyRole(payload: JwtPayload, roles: string[]): boolean {
    return payload.roles.some((role) => roles.includes(role));
  }

  private log(
    payload: JwtPayload,
    context: RequestContext,
    action: string,
    entityId: string,
    after: Prisma.InputJsonObject,
  ): Promise<void> {
    return this.audit.log({
      action,
      entityType: "quote",
      entityId,
      organizationId: payload.org,
      userId: payload.sub,
      after,
      ...context,
    });
  }
}
