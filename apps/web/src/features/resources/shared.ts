/** Types et helpers partagés du module Ressources (miroir du backend). */

/** Rôles autorisés à gérer les ressources (miroir de RESOURCE_MANAGE côté API). */
export const RESOURCE_MANAGE_ROLES = ["admin", "manager", "pmo", "project_manager"];

export type ResourceType = "EMPLOYEE" | "CONTRACTOR" | "FREELANCER" | "VENDOR" | "OTHER";
export type RateUnit = "HOUR" | "DAY";

export const RESOURCE_TYPES: ResourceType[] = [
  "EMPLOYEE",
  "CONTRACTOR",
  "FREELANCER",
  "VENDOR",
  "OTHER",
];

export interface ResourceRate {
  amount: number;
  unit: RateUnit;
  currency: string;
}

export interface ResourceView {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  resourceType: ResourceType;
  company: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  active: boolean;
  notes: string | null;
  rate: ResourceRate | null;
}

export interface TaskResourceLine {
  resourceId: string;
  name: string;
  rate: ResourceRate | null;
  allocationDays: number;
  cost: number;
}

export interface TaskResourcesView {
  taskId: string;
  durationDays: number;
  resources: TaskResourceLine[];
  totalCost: number;
  currency: string;
}

export interface ProjectResourceCostView {
  perResource: Array<{ resourceId: string; name: string; allocationDays: number; cost: number }>;
  totalCost: number;
  totalAllocatedDays: number;
  resourceCount: number;
  currency: string;
}

export interface ResourceAssignmentLine {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  startDate: string | null;
  dueDate: string | null;
  durationDays: number;
  cost: number;
}

export interface ResourceDetailView {
  resource: ResourceView;
  assignments: ResourceAssignmentLine[];
  workloadByProject: Array<{
    projectId: string;
    projectName: string;
    allocationDays: number;
    cost: number;
  }>;
  totalAllocatedDays: number;
  totalCost: number;
  /** Paires de tâches (ids) qui se chevauchent pour cette ressource. */
  overallocations: Array<[string, string]>;
}

/** Peut gérer les ressources (création, tarif, affectation) d'après ses rôles. */
export function canManageResources(roles: string[] | undefined): boolean {
  return roles?.some((role) => RESOURCE_MANAGE_ROLES.includes(role)) ?? false;
}

/** Formate un tarif « 650 €/j » ou « 85 €/h » selon l'unité et la locale. */
export function formatRate(
  rate: ResourceRate | null,
  locale: string,
  unitLabels: { HOUR: string; DAY: string },
): string {
  if (!rate) {
    return "—";
  }
  const amount = rate.amount.toLocaleString(locale, {
    style: "currency",
    currency: rate.currency,
    maximumFractionDigits: 0,
  });
  return `${amount}/${rate.unit === "DAY" ? unitLabels.DAY : unitLabels.HOUR}`;
}
