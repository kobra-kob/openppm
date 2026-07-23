import { RoleKey, WorkflowStateKind } from "@openppm/db";
import type { WorkflowDefinitionInput } from "../../workflow/domain/workflow.repository";

/** Type d'entité piloté par le workflow des demandes. */
export const DEMAND_ENTITY_TYPE = "demand";
export const DEMAND_WORKFLOW_KEY = "demand-default";

/**
 * Circuit par défaut d'une demande, tel que spécifié :
 *
 *   Brouillon → Soumise → Validation Manager → Qualification PMO →
 *   Business Case → Validation Finance → Comité d'investissement →
 *   Projet créé (final) — rejet possible à chaque étape de revue.
 *
 * Entièrement déclaratif : les états, transitions et rôles vivent en base via
 * le moteur de workflow. Aucun statut n'est codé en dur ailleurs. La transition
 * finale porte l'automatisation `createProject`, interprétée par le module
 * métier au lot de conversion.
 */
export const DEFAULT_DEMAND_WORKFLOW: WorkflowDefinitionInput = {
  key: DEMAND_WORKFLOW_KEY,
  entityType: DEMAND_ENTITY_TYPE,
  name: "Cycle de vie d'une demande",
  isDefault: true,
  states: [
    { key: "draft", label: "Brouillon", kind: WorkflowStateKind.initial },
    { key: "submitted", label: "Soumise", kind: WorkflowStateKind.intermediate },
    { key: "manager_review", label: "Validation Manager", kind: WorkflowStateKind.intermediate },
    { key: "pmo_qualification", label: "Qualification PMO", kind: WorkflowStateKind.intermediate },
    { key: "business_case", label: "Business Case", kind: WorkflowStateKind.intermediate },
    { key: "finance_review", label: "Validation Finance", kind: WorkflowStateKind.intermediate },
    { key: "committee", label: "Comité d'investissement", kind: WorkflowStateKind.intermediate },
    { key: "approved", label: "Projet créé", kind: WorkflowStateKind.final_ok },
    { key: "rejected", label: "Rejetée", kind: WorkflowStateKind.final_ko },
  ],
  transitions: [
    // Avancement — chaque rôle agit à son étape
    {
      key: "submit",
      label: "Soumettre",
      fromStateKey: "draft",
      toStateKey: "submitted",
      // Rôle non restreint : le demandeur soumet (contrôle de propriété côté service)
    },
    {
      key: "manager_approve",
      label: "Valider (Manager)",
      fromStateKey: "submitted",
      toStateKey: "manager_review",
      allowedRoles: [RoleKey.manager, RoleKey.pmo],
    },
    {
      key: "pmo_qualify",
      label: "Qualifier (PMO)",
      fromStateKey: "manager_review",
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
      key: "submit_to_committee",
      label: "Transmettre au comité",
      fromStateKey: "finance_review",
      toStateKey: "committee",
      allowedRoles: [RoleKey.finance, RoleKey.pmo],
    },
    {
      key: "committee_approve",
      label: "Approuver (Comité)",
      fromStateKey: "committee",
      toStateKey: "approved",
      allowedRoles: [RoleKey.executive],
      autoAction: { createProject: true },
    },
    // Renvoi au demandeur pour complément (Manager)
    {
      key: "request_changes",
      label: "Demander des compléments",
      fromStateKey: "submitted",
      toStateKey: "draft",
      allowedRoles: [RoleKey.manager, RoleKey.pmo],
      requiresComment: true,
    },
    // Rejets — possibles à chaque étape de revue, commentaire obligatoire
    {
      key: "reject_manager",
      label: "Rejeter",
      fromStateKey: "submitted",
      toStateKey: "rejected",
      allowedRoles: [RoleKey.manager, RoleKey.pmo],
      requiresComment: true,
    },
    {
      key: "reject_pmo",
      label: "Rejeter",
      fromStateKey: "manager_review",
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
