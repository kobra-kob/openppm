import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ProjectRole, ProjectStatus, RoleKey } from "@openppm/db";
import { AuditService } from "../../../core/audit/audit.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { allowedTransitions, canTransition } from "../domain/project-status.policy";
import { PROJECT_REPOSITORY } from "../domain/project.repository";
import type {
  ProjectActivityEntry,
  ProjectRepository,
  ProjectWithRelations,
  UpdateProjectInput,
} from "../domain/project.repository";
import type {
  AddProjectMemberDto,
  ChangeStatusDto,
  CreateProjectDto,
  ListProjectsQuery,
  UpdateProjectDto,
  UpdateProjectMemberDto,
} from "./dto/project.dtos";

/** Rôles d'organisation qui pilotent tous les projets. */
const ORG_WIDE_ROLES: string[] = [RoleKey.admin, RoleKey.manager, RoleKey.pmo];

export interface ProjectView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  health: string;
  priority: number;
  startDate: Date | null;
  endDate: Date | null;
  budget: string | null;
  manager: { id: string; name: string } | null;
  members: Array<{
    userId: string;
    name: string;
    email: string;
    role: ProjectRole;
  }>;
  allowedTransitions: readonly ProjectStatus[];
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectListView {
  items: ProjectView[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly repository: ProjectRepository,
    private readonly audit: AuditService,
  ) {}

  private toView(project: ProjectWithRelations): ProjectView {
    return {
      id: project.id,
      code: project.code,
      name: project.name,
      description: project.description,
      status: project.status,
      health: project.health,
      priority: project.priority,
      startDate: project.startDate,
      endDate: project.endDate,
      budget: project.budget?.toString() ?? null,
      manager: project.manager
        ? {
            id: project.manager.id,
            name: `${project.manager.firstName} ${project.manager.lastName}`,
          }
        : null,
      members: project.members.map((member) => ({
        userId: member.userId,
        name: `${member.user.firstName} ${member.user.lastName}`,
        email: member.user.email,
        role: member.role,
      })),
      allowedTransitions: allowedTransitions(project.status),
      archivedAt: project.archivedAt,
      deletedAt: project.deletedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  async list(payload: JwtPayload, query: ListProjectsQuery): Promise<ProjectListView> {
    const { items, total } = await this.repository.list(payload.org, {
      search: query.search,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: items.map((project) => this.toView(project)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async listTrash(payload: JwtPayload): Promise<ProjectView[]> {
    this.assertOrgWide(payload);
    const items = await this.repository.listTrash(payload.org);
    return items.map((project) => this.toView(project));
  }

  async get(payload: JwtPayload, id: string): Promise<ProjectView> {
    return this.toView(await this.requireProject(payload.org, id));
  }

  async create(
    payload: JwtPayload,
    dto: CreateProjectDto,
    context: RequestContext,
  ): Promise<ProjectView> {
    const { startDate, endDate } = this.parseDates(dto.startDate, dto.endDate);
    if (dto.managerId && !(await this.repository.userInOrganization(payload.org, dto.managerId))) {
      throw new BadRequestException({
        code: "MANAGER_NOT_IN_ORG",
        message: "Le chef de projet doit appartenir à l'organisation",
      });
    }
    const code = await this.resolveCode(payload.org, dto.code);

    // Créateur et chef de projet rejoignent l'équipe comme managers du projet
    const initialMembers = new Map<string, ProjectRole>();
    initialMembers.set(payload.sub, ProjectRole.manager);
    if (dto.managerId) {
      initialMembers.set(dto.managerId, ProjectRole.manager);
    }

    const project = await this.repository.create({
      organizationId: payload.org,
      code,
      name: dto.name,
      description: dto.description,
      priority: dto.priority,
      startDate,
      endDate,
      budget: dto.budget,
      managerId: dto.managerId,
      createdById: payload.sub,
      initialMembers: [...initialMembers.entries()].map(([userId, role]) => ({
        userId,
        role,
      })),
    });
    await this.audit.log({
      action: "project.created",
      entityType: "project",
      entityId: project.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { code: project.code, name: project.name },
      ...context,
    });
    return this.toView(project);
  }

  async update(
    payload: JwtPayload,
    id: string,
    dto: UpdateProjectDto,
    context: RequestContext,
  ): Promise<ProjectView> {
    const project = await this.requireProject(payload.org, id);
    this.assertCanEdit(payload, project);

    const input: UpdateProjectInput = {};
    if (dto.name !== undefined) input.name = dto.name;
    if (dto.description !== undefined) input.description = dto.description;
    if (dto.priority !== undefined) input.priority = dto.priority;
    if (dto.health !== undefined) input.health = dto.health;
    if (dto.budget !== undefined) input.budget = dto.budget;
    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      const { startDate, endDate } = this.parseDates(
        dto.startDate ?? project.startDate?.toISOString(),
        dto.endDate ?? project.endDate?.toISOString(),
      );
      if (dto.startDate !== undefined) input.startDate = startDate ?? null;
      if (dto.endDate !== undefined) input.endDate = endDate ?? null;
    }
    if (dto.managerId !== undefined) {
      if (dto.managerId && !(await this.repository.userInOrganization(payload.org, dto.managerId))) {
        throw new BadRequestException({
          code: "MANAGER_NOT_IN_ORG",
          message: "Le chef de projet doit appartenir à l'organisation",
        });
      }
      input.managerId = dto.managerId || null;
    }

    const updated = await this.repository.update(project.id, input);
    await this.audit.log({
      action: "project.updated",
      entityType: "project",
      entityId: project.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: JSON.parse(JSON.stringify(dto)),
      ...context,
    });
    return this.toView(updated);
  }

  async changeStatus(
    payload: JwtPayload,
    id: string,
    dto: ChangeStatusDto,
    context: RequestContext,
  ): Promise<ProjectView> {
    const project = await this.requireProject(payload.org, id);
    this.assertCanEdit(payload, project);
    if (!canTransition(project.status, dto.status)) {
      throw new BadRequestException({
        code: "INVALID_STATUS_TRANSITION",
        message: `Transition ${project.status} → ${dto.status} interdite`,
        allowed: allowedTransitions(project.status),
      });
    }
    const archivedAt = dto.status === ProjectStatus.archived ? new Date() : null;
    const updated = await this.repository.setStatus(project.id, dto.status, archivedAt);
    await this.audit.log({
      action: "project.status_changed",
      entityType: "project",
      entityId: project.id,
      organizationId: payload.org,
      userId: payload.sub,
      before: { status: project.status },
      after: { status: dto.status },
      ...context,
    });
    return this.toView(updated);
  }

  async softDelete(payload: JwtPayload, id: string, context: RequestContext): Promise<void> {
    const project = await this.requireProject(payload.org, id);
    this.assertCanEdit(payload, project);
    await this.repository.softDelete(project.id);
    await this.audit.log({
      action: "project.deleted",
      entityType: "project",
      entityId: project.id,
      organizationId: payload.org,
      userId: payload.sub,
      before: { code: project.code, name: project.name },
      ...context,
    });
  }

  async restore(payload: JwtPayload, id: string, context: RequestContext): Promise<ProjectView> {
    this.assertOrgWide(payload);
    const project = await this.repository.findById(payload.org, id, true);
    if (!project || !project.deletedAt) {
      throw new NotFoundException({
        code: "PROJECT_NOT_FOUND",
        message: "Projet introuvable dans la corbeille",
      });
    }
    const restored = await this.repository.restore(project.id);
    await this.audit.log({
      action: "project.restored",
      entityType: "project",
      entityId: project.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { code: project.code },
      ...context,
    });
    return this.toView(restored);
  }

  async addMember(
    payload: JwtPayload,
    id: string,
    dto: AddProjectMemberDto,
    context: RequestContext,
  ): Promise<ProjectView> {
    const project = await this.requireProject(payload.org, id);
    this.assertCanEdit(payload, project);
    if (!(await this.repository.userInOrganization(payload.org, dto.userId))) {
      throw new BadRequestException({
        code: "USER_NOT_IN_ORG",
        message: "L'utilisateur doit appartenir à l'organisation",
      });
    }
    if (project.members.some((member) => member.userId === dto.userId)) {
      throw new ConflictException({
        code: "MEMBER_ALREADY_EXISTS",
        message: "Déjà membre du projet",
      });
    }
    await this.repository.addMember(project.id, dto.userId, dto.role ?? ProjectRole.member);
    await this.audit.log({
      action: "project.member_added",
      entityType: "project",
      entityId: project.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { userId: dto.userId, role: dto.role ?? ProjectRole.member },
      ...context,
    });
    return this.get(payload, id);
  }

  async updateMemberRole(
    payload: JwtPayload,
    id: string,
    userId: string,
    dto: UpdateProjectMemberDto,
    context: RequestContext,
  ): Promise<ProjectView> {
    const project = await this.requireProject(payload.org, id);
    this.assertCanEdit(payload, project);
    this.requireMembership(project, userId);
    await this.repository.updateMemberRole(project.id, userId, dto.role);
    await this.audit.log({
      action: "project.member_role_changed",
      entityType: "project",
      entityId: project.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { userId, role: dto.role },
      ...context,
    });
    return this.get(payload, id);
  }

  async removeMember(
    payload: JwtPayload,
    id: string,
    userId: string,
    context: RequestContext,
  ): Promise<ProjectView> {
    const project = await this.requireProject(payload.org, id);
    this.assertCanEdit(payload, project);
    this.requireMembership(project, userId);
    await this.repository.removeMember(project.id, userId);
    await this.audit.log({
      action: "project.member_removed",
      entityType: "project",
      entityId: project.id,
      organizationId: payload.org,
      userId: payload.sub,
      before: { userId },
      ...context,
    });
    return this.get(payload, id);
  }

  async activity(payload: JwtPayload, id: string): Promise<ProjectActivityEntry[]> {
    await this.requireProject(payload.org, id);
    return this.repository.listActivity(payload.org, id, 50);
  }

  // ── Aides privées ────────────────────────────────────────────────────

  private async requireProject(
    organizationId: string,
    id: string,
  ): Promise<ProjectWithRelations> {
    const project = await this.repository.findById(organizationId, id);
    if (!project) {
      throw new NotFoundException({
        code: "PROJECT_NOT_FOUND",
        message: "Projet introuvable",
      });
    }
    return project;
  }

  /** Édition : rôle d'organisation transverse, chef de projet, ou membre manager. */
  private assertCanEdit(payload: JwtPayload, project: ProjectWithRelations): void {
    if (payload.roles.some((role) => ORG_WIDE_ROLES.includes(role))) {
      return;
    }
    if (project.managerId === payload.sub) {
      return;
    }
    const membership = project.members.find((member) => member.userId === payload.sub);
    if (membership?.role === ProjectRole.manager) {
      return;
    }
    throw new ForbiddenException({
      code: "FORBIDDEN",
      message: "Droits insuffisants sur ce projet",
    });
  }

  private assertOrgWide(payload: JwtPayload): void {
    if (!payload.roles.some((role) => ORG_WIDE_ROLES.includes(role))) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Réservé aux rôles Administrateur, Manager ou PMO",
      });
    }
  }

  private requireMembership(project: ProjectWithRelations, userId: string): void {
    if (!project.members.some((member) => member.userId === userId)) {
      throw new NotFoundException({
        code: "MEMBER_NOT_FOUND",
        message: "Cet utilisateur n'est pas membre du projet",
      });
    }
  }

  private parseDates(
    start?: string,
    end?: string,
  ): { startDate?: Date; endDate?: Date } {
    const startDate = start ? new Date(start) : undefined;
    const endDate = end ? new Date(end) : undefined;
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException({
        code: "INVALID_DATE_RANGE",
        message: "La date de fin doit être postérieure à la date de début",
      });
    }
    return { startDate, endDate };
  }

  private async resolveCode(organizationId: string, requested?: string): Promise<string> {
    if (requested) {
      if (await this.repository.isCodeTaken(organizationId, requested)) {
        throw new ConflictException({
          code: "CODE_ALREADY_USED",
          message: "Ce code projet est déjà utilisé",
        });
      }
      return requested;
    }
    const count = await this.repository.countAll(organizationId);
    for (let candidate = count + 1; candidate <= count + 100; candidate += 1) {
      const code = `P-${String(candidate).padStart(4, "0")}`;
      if (!(await this.repository.isCodeTaken(organizationId, code))) {
        return code;
      }
    }
    throw new ConflictException({
      code: "CODE_GENERATION_FAILED",
      message: "Impossible de générer un code projet unique",
    });
  }
}
