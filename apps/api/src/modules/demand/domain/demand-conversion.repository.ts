export const DEMAND_CONVERSION_REPOSITORY = Symbol("DEMAND_CONVERSION_REPOSITORY");

export interface ConvertDemandInput {
  organizationId: string;
  demandId: string;
  reference: string;
  /** Utilisateur déclenchant la conversion (comité / admin). */
  actorId: string;
  /** Demandeur d'origine, chef de projet par défaut du projet créé. */
  requesterId: string;
  name: string;
  description: string | null;
  priority: number;
  portfolioId: string | null;
  /** Budget estimé : donne lieu à une demande de budget déjà approuvée. */
  estimatedBudget: number | null;
}

export interface ConvertDemandResult {
  projectId: string;
  projectCode: string;
  budgetApproved: boolean;
  transferredDocuments: number;
  transferredRisks: number;
}

export interface DemandConversionRepository {
  /** Vrai si un projet est déjà rattaché à cette demande (conversion idempotente). */
  isConverted(demandId: string): Promise<boolean>;
  /**
   * Convertit une demande approuvée en projet, dans une seule transaction :
   * création du projet (chef = demandeur, portefeuille repris, lien de
   * traçabilité), budget approuvé via la gouvernance, reprise des pièces
   * jointes et des risques du Business Case.
   */
  convert(input: ConvertDemandInput): Promise<ConvertDemandResult>;
}
