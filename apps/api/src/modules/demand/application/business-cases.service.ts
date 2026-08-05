import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { RiskLevel, RoleKey } from "@openppm/db";
import { AuditService } from "../../../core/audit/audit.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { BUSINESS_CASE_REPOSITORY } from "../domain/business-case.repository";
import type {
  BusinessCaseRecord,
  BusinessCaseRepository,
} from "../domain/business-case.repository";
import { DEMAND_REPOSITORY } from "../domain/demand.repository";
import type { DemandRepository } from "../domain/demand.repository";
import { computeSeverity } from "../domain/risk-severity";
import type { UpsertBusinessCaseDto } from "./dto/business-case.dtos";

/** Rôles habilités à rédiger le Business Case (qualification / instruction). */
const BUSINESS_CASE_EDITOR_ROLES: string[] = [
  RoleKey.admin,
  RoleKey.pmo,
  RoleKey.business_analyst,
];

export interface BusinessCaseRiskView {
  id: string;
  label: string;
  probability: RiskLevel;
  impact: RiskLevel;
  /** Sévérité dérivée (probabilité × impact). */
  severity: RiskLevel;
  mitigation: string | null;
}

export interface BusinessCaseView {
  id: string;
  demandId: string;
  roi: string | null;
  costs: string | null;
  benefits: string | null;
  assumptions: string | null;
  resources: string | null;
  dependencies: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  createdBy: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
  risks: BusinessCaseRiskView[];
  canEdit: boolean;
}

@Injectable()
export class BusinessCasesService {
  constructor(
    @Inject(BUSINESS_CASE_REPOSITORY)
    private readonly repository: BusinessCaseRepository,
    @Inject(DEMAND_REPOSITORY) private readonly demands: DemandRepository,
    private readonly audit: AuditService,
  ) {}

  /** Retourne le Business Case de la demande, ou null s'il n'a pas encore été rédigé. */
  async get(payload: JwtPayload, demandId: string): Promise<BusinessCaseView | null> {
    await this.requireDemand(payload, demandId);
    const record = await this.repository.findByDemandId(demandId);
    return record ? this.toView(payload, record) : null;
  }

  async upsert(
    payload: JwtPayload,
    demandId: string,
    dto: UpsertBusinessCaseDto,
    context: RequestContext,
  ): Promise<BusinessCaseView> {
    await this.requireDemand(payload, demandId);
    this.assertCanEdit(payload);

    const record = await this.repository.upsert({
      demandId,
      createdById: payload.sub,
      roi: dto.roi ?? null,
      costs: dto.costs ?? null,
      benefits: dto.benefits ?? null,
      assumptions: dto.assumptions ?? null,
      resources: dto.resources ?? null,
      dependencies: dto.dependencies ?? null,
      plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : null,
      plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : null,
      risks: (dto.risks ?? []).map((risk) => ({
        label: risk.label,
        probability: risk.probability ?? RiskLevel.medium,
        impact: risk.impact ?? RiskLevel.medium,
        mitigation: risk.mitigation ?? null,
      })),
    });

    await this.audit.log({
      action: "demand.business_case_saved",
      entityType: "demand",
      entityId: demandId,
      organizationId: payload.org,
      userId: payload.sub,
      after: { riskCount: record.risks.length },
      ...context,
    });

    return this.toView(payload, record);
  }

  private async requireDemand(payload: JwtPayload, demandId: string): Promise<void> {
    const demand = await this.demands.findById(payload.org, demandId);
    if (!demand) {
      throw new NotFoundException({
        code: "DEMAND_NOT_FOUND",
        message: "Demande introuvable",
      });
    }
  }

  private assertCanEdit(payload: JwtPayload): void {
    if (!payload.roles.some((role) => BUSINESS_CASE_EDITOR_ROLES.includes(role))) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Seuls le PMO, un Business Analyst ou un administrateur peuvent rédiger le Business Case",
      });
    }
  }

  private canEdit(payload: JwtPayload): boolean {
    return payload.roles.some((role) => BUSINESS_CASE_EDITOR_ROLES.includes(role));
  }

  private toView(payload: JwtPayload, record: BusinessCaseRecord): BusinessCaseView {
    return {
      id: record.id,
      demandId: record.demandId,
      roi: record.roi,
      costs: record.costs,
      benefits: record.benefits,
      assumptions: record.assumptions,
      resources: record.resources,
      dependencies: record.dependencies,
      plannedStartDate: record.plannedStartDate
        ? record.plannedStartDate.toISOString().slice(0, 10)
        : null,
      plannedEndDate: record.plannedEndDate
        ? record.plannedEndDate.toISOString().slice(0, 10)
        : null,
      createdBy: { id: record.createdById, name: record.createdByName },
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      risks: record.risks.map((risk) => ({
        id: risk.id,
        label: risk.label,
        probability: risk.probability,
        impact: risk.impact,
        severity: computeSeverity(risk.probability, risk.impact),
        mitigation: risk.mitigation,
      })),
      canEdit: this.canEdit(payload),
    };
  }
}
