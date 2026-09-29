import type { RateUnit, ResourceType } from "@openppm/db";

export const RESOURCE_REPOSITORY = Symbol("RESOURCE_REPOSITORY");

export interface ResourceRate {
  amount: number;
  unit: RateUnit;
  currency: string;
}

export interface ResourceRecord {
  id: string;
  firstName: string;
  lastName: string;
  resourceType: ResourceType;
  company: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  active: boolean;
  notes: string | null;
  /** Tarif courant (effective_to = null), sinon null. */
  currentRate: ResourceRate | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateResourceInput {
  organizationId: string;
  firstName: string;
  lastName: string;
  resourceType: ResourceType;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  notes?: string | null;
}

export interface UpdateResourceInput {
  firstName?: string;
  lastName?: string;
  resourceType?: ResourceType;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  notes?: string | null;
  active?: boolean;
}

export interface ResourceListFilters {
  search?: string;
  resourceType?: ResourceType;
  active?: boolean;
}

/** Affectation d'une ressource à une tâche (charge & coût). */
export interface AssignmentRecord {
  taskResourceId: string;
  resourceId: string;
  resourceName: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  hoursPerDay: number;
  startDate: Date | null;
  dueDate: Date | null;
  rate: ResourceRate | null;
}

export interface ResourceRepository {
  list(organizationId: string, filters: ResourceListFilters): Promise<ResourceRecord[]>;
  findById(organizationId: string, id: string): Promise<ResourceRecord | null>;
  create(input: CreateResourceInput): Promise<ResourceRecord>;
  update(id: string, input: UpdateResourceInput): Promise<ResourceRecord>;
  /** Remplace le tarif courant (clôture l'ancien, ouvre le nouveau) en transaction. */
  setRate(resourceId: string, rate: ResourceRate): Promise<void>;

  assignToTask(taskId: string, resourceId: string): Promise<void>;
  removeFromTask(taskId: string, resourceId: string): Promise<boolean>;
  isAssigned(taskId: string, resourceId: string): Promise<boolean>;

  /** Ressources affectées à une tâche (avec tarif courant). */
  listResourcesForTask(taskId: string): Promise<ResourceRecord[]>;
  /** Affectations d'une tâche (jointes au projet + tarif). */
  listAssignmentsForTask(projectId: string, taskId: string): Promise<AssignmentRecord[]>;
  /** Toutes les affectations d'un projet (coût ressources projet). */
  listAssignmentsForProject(projectId: string): Promise<AssignmentRecord[]>;
  /** Affectations de plusieurs projets d'un bloc (intégration finance/portefeuille). */
  listAssignmentsForProjects(projectIds: string[]): Promise<AssignmentRecord[]>;
  /** Toutes les affectations d'une ressource (charge/coût multi-projets). */
  listAssignmentsForResource(organizationId: string, resourceId: string): Promise<AssignmentRecord[]>;
}
