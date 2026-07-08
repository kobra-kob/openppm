import type {
  Prisma,
  Project,
  ProjectHealth,
  ProjectMember,
  ProjectRole,
  ProjectStatus,
} from "@openppm/db";

export interface MemberUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export type ProjectWithRelations = Project & {
  manager: MemberUser | null;
  members: Array<ProjectMember & { user: MemberUser }>;
};

export interface ProjectListFilters {
  search?: string;
  status?: ProjectStatus;
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
  managerId?: string | null;
}

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
  listActivity(
    organizationId: string,
    projectId: string,
    limit: number,
  ): Promise<ProjectActivityEntry[]>;
}

export const PROJECT_REPOSITORY = Symbol("PROJECT_REPOSITORY");
