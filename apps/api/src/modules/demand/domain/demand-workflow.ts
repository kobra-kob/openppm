import { RoleKey, WorkflowStateKind } from "@openppm/db";
import type { WorkflowDefinitionInput } from "../../workflow/domain/workflow.repository";

/** Type d'entité piloté par le workflow des demandes. */
export const DEMAND_ENTITY_TYPE = "demand";
export const DEMAND_WORKFLOW_KEY = "demand-default";

/** État de revue Finance : point de bifurcation vers le comité ou la création directe. */
export const FINANCE_REVIEW_STATE = "finance_review";
/** Transition « Transmettre au comité » (budget élevé ou règle désactivée). */
export const T_SUBMIT_TO_COMMITTEE = "submit_to_committee";
/** Transition « Créer le projet » directement après Finance (budget sous le seuil). */
export const T_FINANCE_CREATES_PROJECT = "finance_creates_project";

/** Seuil (€) au-delà duquel une demande passe obligatoirement par le comité. */
export const COMMITTEE_THRESHOLD = 100_000;

/**
 * Le comité d'investissement est-il requis pour cette demande ?
 * - Règle désactivée → toujours le comité (comportement par défaut).
 * - Règle activée → comité seulement si le budget dépasse le seuil ; un budget
 *   inconnu part au comité par prudence.
 */
export function committeeRequired(
  ruleEnabled: boolean,
  estimatedBudget: number | null,
): boolean {
  if (!ruleEnabled) {
    return true;
  }
  if (estimatedBudget === null) {
    return true;
  }
  return estimatedBudget > COMMITTEE_THRESHOLD;
}

/**
 * Circuit par défaut d'une demande :
 *
 *   Brouillon → Soumise → Qualification PMO → Business Case →
 *   Validation Finance → (Comité d'investissement) → Projet créé.
 *
 * La validation Manager a été retirée. Après la validation Finance, deux issues
 * mutuellement exclusives selon la règle de gouvernance et le budget :
 *   • `submit_to_committee`   → passe au comité (budget élevé ou règle off) ;
 *   • `finance_creates_project` → crée directement le projet (budget sous le seuil).
 * Le choix est arbitré côté service (voir committeeRequired) : une seule des
 * deux transitions est proposée/franchissable pour une demande donnée.
 *
 * Entièrement déclaratif : états, transitions et rôles vivent en base. La
 * création de projet est portée par l'automatisation `createProject`.
 */
export const DEFAULT_DEMAND_WORKFLOW: WorkflowDefinitionInput = {
  key: DEMAND_WORKFLOW_KEY,
  entityType: DEMAND_ENTITY_TYPE,
  name: "Cycle de vie d'une demande",
  isDefault: true,
  states: [
    { key: "draft", label: "Brouillon", kind: WorkflowStateKind.initial },
    { key: "submitted", label: "Soumise", kind: WorkflowStateKind.intermediate },
    { key: "pmo_qualification", label: "Qualification PMO", kind: WorkflowStateKind.intermediate },
    { key: "business_case", label: "Business Case", kind: WorkflowStateKind.intermediate },
    { key: "finance_review", label: "Validation Finance", kind: WorkflowStateKind.intermediate },
    { key: "committee", label: "Comité d'investissement", kind: WorkflowStateKind.intermediate },
    { key: "approved", label: "Projet créé", kind: WorkflowStateKind.final_ok },
    { key: "rejected", label: "Rejetée", kind: WorkflowStateKind.final_ko },
  ],
  transitions: [
    {
      key: "submit",
      label: "Soumettre",
      fromStateKey: "draft",
      toStateKey: "submitted",
      // Rôle non restreint : le demandeur soumet (contrôle de propriété côté service)
    },
    {
      key: "pmo_qualify",
      label: "Qualifier (PMO)",
      fromStateKey: "submitted",
      toStateKey: "pmo_qualification",
      allowedRoles: [RoleKey.pmo],
    },
    {
      key: "prepare_business_case",
      label: "Préparer le Business Case",
      fromStateKey: "pmo_qualification",
      toStateKey: "business_case",
      allowedRoles: [RoleKey.pmo, RoleKey.business_analyst],
    },
    {
      key: "finance_validate",
      label: "Valider le budget (Finance)",
      fromStateKey: "business_case",
      toStateKey: "finance_review",
      allowedRoles: [RoleKey.finance],
    },
    {
      key: T_SUBMIT_TO_COMMITTEE,
      label: "Transmettre au comité",
      fromStateKey: "finance_review",
      toStateKey: "committee",
      allowedRoles: [RoleKey.finance, RoleKey.pmo],
    },
    {
      key: T_FINANCE_CREATES_PROJECT,
      label: "Créer le projet",
      fromStateKey: "finance_review",
      toStateKey: "approved",
      allowedRoles: [RoleKey.finance],
      autoAction: { createProject: true },
    },
    {
      key: "committee_approve",
      label: "Approuver (Comité)",
      fromStateKey: "committee",
      toStateKey: "approved",
      allowedRoles: [RoleKey.executive],
      autoAction: { createProject: true },
    },
    // Renvoi au demandeur pour complément (PMO)
    {
      key: "request_changes",
      label: "Demander des compléments",
      fromStateKey: "submitted",
      toStateKey: "draft",
      allowedRoles: [RoleKey.pmo],
      requiresComment: true,
    },
    // Rejets — possibles à chaque étape de revue, commentaire obligatoire
    {
      key: "reject_submitted",
      label: "Rejeter",
      fromStateKey: "submitted",
      toStateKey: "rejected",
      allowedRoles: [RoleKey.pmo],
      requiresComment: true,
    },
    {
      key: "reject_pmo",
      label: "Rejeter",
      fromStateKey: "pmo_qualification",
      toStateKey: "rejected",
      allowedRoles: [RoleKey.pmo],
      requiresComment: true,
    },
    {
      key: "reject_finance",
      label: "Rejeter",
      fromStateKey: "finance_review",
      toStateKey: "rejected",
      allowedRoles: [RoleKey.finance],
      requiresComment: true,
    },
    {
      key: "reject_committee",
      label: "Rejeter",
      fromStateKey: "committee",
      toStateKey: "rejected",
      allowedRoles: [RoleKey.executive],
      requiresComment: true,
    },
  ],
};
