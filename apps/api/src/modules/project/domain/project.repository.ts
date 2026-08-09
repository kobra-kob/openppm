import type {
  Prisma,
  Project,
  ProjectCategory,
  ProjectHealth,
  ProjectMember,
  ProjectRole,
  ProjectStatus,
  ProjectTemplate,
} from "@openppm/db";

export interface MemberUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export type ProjectWithRelations = Project & {
  manager: MemberUser | null;
  category: ProjectCategory | null;
  members: Array<ProjectMember & { user: MemberUser }>;
  /** Demande d'origine si le projet est issu d'une conversion. */
  originDemand: { id: string; reference: string } | null;
};

export interface ProjectListFilters {
  search?: string;
  status?: ProjectStatus;
  categoryId?: string;
  /** Restreint aux projets dont cet utilisateur est membre, chef ou créateur. */
  memberUserId?: string;
  sort?: "recent" | "priority";
  page: number;
  pageSize: number;
}

export interface CreateProjectInput {
  organizationId: string;
  code: string;
  name: string;
  description?: string;
  priority?: number;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  categoryId?: string;
  managerId?: string;
  createdById: string;
  /** Membres initiaux (créateur + manager), rôle par utilisateur. */
  initialMembers: Array<{ userId: string; role: ProjectRole }>;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  priority?: number;
  health?: ProjectHealth;
  startDate?: Date | null;
  endDate?: Date | null;
  budget?: number | null;
  categoryId?: string | null;
  managerId?: string | null;
}

export interface CreateCategoryInput {
  organizationId: string;
  name: string;
  color?: string;
}

export interface CreateTemplateInput {
  organizationId: string;
  name: string;
  description?: string;
  priority?: number;
  budget?: number;
  durationDays?: number;
  categoryId?: string;
  createdById: string;
}

export type TemplateWithCategory = ProjectTemplate & {
  category: ProjectCategory | null;
};

export interface ProjectActivityEntry {
  id: string;
  action: string;
  actorName: string | null;
  after: Prisma.JsonValue;
  createdAt: Date;
}

export interface ProjectRepository {
  list(
    organizationId: string,
    filters: ProjectListFilters,
  ): Promise<{ items: ProjectWithRelations[]; total: number }>;
  listTrash(organizationId: string): Promise<ProjectWithRelations[]>;
  findById(
    organizationId: string,
    id: string,
    includeDeleted?: boolean,
  ): Promise<ProjectWithRelations | null>;
  isCodeTaken(organizationId: string, code: string): Promise<boolean>;
  /** Compte tous les projets de l'org (corbeille comprise) pour générer un code. */
  countAll(organizationId: string): Promise<number>;
  /**
   * Plus grand numéro de séquence déjà attribué (codes PROJxxxxx), corbeille
   * comprise. Robuste aux suppressions, contrairement à un simple comptage.
   */
  maxCodeSequence(organizationId: string): Promise<number>;
  create(input: CreateProjectInput): Promise<ProjectWithRelations>;
  update(id: string, input: UpdateProjectInput): Promise<ProjectWithRelations>;
  setStatus(
    id: string,
    status: ProjectStatus,
    archivedAt: Date | null,
  ): Promise<ProjectWithRelations>;
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<ProjectWithRelations>;
  addMember(projectId: string, userId: string, role: ProjectRole): Promise<void>;
  updateMemberRole(projectId: string, userId: string, role: ProjectRole): Promise<void>;
  removeMember(projectId: string, userId: string): Promise<void>;
  userInOrganization(organizationId: string, userId: string): Promise<boolean>;
  /** L'organisation autorise-t-elle la création directe d'un projet (hors conversion) ? */
  directCreationAllowed(organizationId: string): Promise<boolean>;
  /** Bascule le drapeau de création directe (réservé à l'administration). */
  setDirectCreationAllowed(organizationId: string, allowed: boolean): Promise<boolean>;
  listActivity(
    organizationId: string,
    projectId: string,
    limit: number,
  ): Promise<ProjectActivityEntry[]>;

  // Catégories
  listCategories(organizationId: string): Promise<ProjectCategory[]>;
  findCategory(organizationId: string, id: string): Promise<ProjectCategory | null>;
  categoryNameTaken(organizationId: string, name: string): Promise<boolean>;
  createCategory(input: CreateCategoryInput): Promise<ProjectCategory>;
  updateCategory(
    id: string,
    input: { name?: string; color?: string },
  ): Promise<ProjectCategory>;
  /** Supprime la catégorie et détache les projets/templates associés. */
  deleteCategory(id: string): Promise<void>;

  // Templates
  listTemplates(organizationId: string): Promise<TemplateWithCategory[]>;
  findTemplate(organizationId: string, id: string): Promise<TemplateWithCategory | null>;
  templateNameTaken(organizationId: string, name: string): Promise<boolean>;
  createTemplate(input: CreateTemplateInput): Promise<TemplateWithCategory>;
  deleteTemplate(id: string): Promise<void>;
}

export const PROJECT_REPOSITORY = Symbol("PROJECT_REPOSITORY");
