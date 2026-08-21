import type { RiskLevel } from "@openppm/db";

export const BUSINESS_CASE_REPOSITORY = Symbol("BUSINESS_CASE_REPOSITORY");

export interface BusinessCaseRiskRecord {
  id: string;
  label: string;
  probability: RiskLevel;
  impact: RiskLevel;
  mitigation: string | null;
}

export interface BusinessCaseRecord {
  id: string;
  demandId: string;
  roi: string | null;
  costs: string | null;
  benefits: string | null;
  assumptions: string | null;
  resources: string | null;
  dependencies: string | null;
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  createdById: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  risks: BusinessCaseRiskRecord[];
}

export interface UpsertBusinessCaseRiskInput {
  label: string;
  probability: RiskLevel;
  impact: RiskLevel;
  mitigation: string | null;
}

export interface UpsertBusinessCaseInput {
  demandId: string;
  createdById: string;
  roi: string | null;
  costs: string | null;
  benefits: string | null;
  assumptions: string | null;
  resources: string | null;
  dependencies: string | null;
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  /** Remplace intégralement les risques identifiés. */
  risks: UpsertBusinessCaseRiskInput[];
}

export interface BusinessCaseRepository {
  findByDemandId(demandId: string): Promise<BusinessCaseRecord | null>;
  /** Crée ou met à jour le Business Case de la demande (les risques sont remplacés). */
  upsert(input: UpsertBusinessCaseInput): Promise<BusinessCaseRecord>;
}

/**
 * Un Business Case est « complet » lorsqu'il porte les éléments financiers
 * minimaux exigés avant la validation Finance : coûts, bénéfices et ROI
 * renseignés. Sert de garde avant de quitter l'étape Business Case du workflow.
 */
export function isBusinessCaseComplete(bc: BusinessCaseRecord | null): boolean {
  if (!bc) {
    return false;
  }
  const filled = (value: string | null): boolean => value !== null && value.trim().length > 0;
  return filled(bc.costs) && filled(bc.benefits) && filled(bc.roi);
}
