import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { RateUnit, ResourceType } from "@openppm/db";
import { AuditService } from "../../../core/audit/audit.service";
import { PrismaService } from "../../../core/prisma/prisma.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { taskDurationDays } from "../../task/domain/critical-path.policy";
import { calculateResourceCost, detectOverlaps } from "../domain/resource-cost.policy";
import { RESOURCE_REPOSITORY } from "../domain/resource.repository";
import type {
  AssignmentRecord,
  ResourceListFilters,
  ResourceRecord,
  ResourceRepository,
} from "../domain/resource.repository";
import type { CreateResourceDto, SetRateDto, UpdateResourceDto } from "./dto/resource.dtos";

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
  rate: { amount: number; unit: RateUnit; currency: string } | null;
}

export interface TaskResourceLine {
  resourceId: string;
  name: string;
  rate: { amount: number; unit: RateUnit; currency: string } | null;
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

@Injectable()
export class ResourceService {
  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly repository: ResourceRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Ressources (CRUD) ──────────────────────────────────────────────────

  list(payload: JwtPayload, filters: ResourceListFilters): Promise<ResourceView[]> {
    return this.repository
      .list(payload.org, filters)
      .then((rows) => rows.map((row) => this.toView(row)));
  }

  async get(payload: JwtPayload, id: string): Promise<ResourceView> {
    return this.toView(await this.require(payload.org, id));
  }

  async create(
    payload: JwtPayload,
    dto: CreateResourceDto,
    context: RequestContext,
  ): Promise<ResourceView> {
    const resource = await this.repository.create({
      organizationId: payload.org,
      firstName: dto.firstName,
      lastName: dto.lastName,
      resourceType: dto.resourceType,
      company: dto.company,
      email: dto.email,
      phone: dto.phone,
      jobTitle: dto.jobTitle,
      notes: dto.notes,
    });
    if (dto.rate) {
      await this.repository.setRate(resource.id, {
        amount: dto.rate.amount,
        unit: dto.rate.unit,
        currency: dto.rate.currency ?? "EUR",
      });
    }
    await this.audit.log({
      action: "resource.created",
      entityType: "resource",
      entityId: resource.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { name: `${resource.firstName} ${resource.lastName}`, type: resource.resourceType },
      ...context,
    });
    return this.get(payload, resource.id);
  }

  async update(
    payload: JwtPayload,
    id: string,
    dto: UpdateResourceDto,
    context: RequestContext,
  ): Promise<ResourceView> {
    await this.require(payload.org, id);
    const updated = await this.repository.update(id, dto);
    await this.audit.log({
      action: "resource.updated",
      entityType: "resource",
      entityId: id,
      organizationId: payload.org,
      userId: payload.sub,
      after: JSON.parse(JSON.stringify(dto)),
      ...context,
    });
    return this.toView({ ...updated, currentRate: updated.currentRate });
  }

  /** Archive (inactive) : reste visible sur les anciennes tâches, non ré-affectable. */
  async archive(payload: JwtPayload, id: string, context: RequestContext): Promise<ResourceView> {
    await this.require(payload.org, id);
    const updated = await this.repository.update(id, { active: false });
    await this.audit.log({
      action: "resource.archived",
      entityType: "resource",
      entityId: id,
      organizationId: payload.org,
      userId: payload.sub,
      ...context,
    });
    return this.toView(updated);
  }

  async setRate(
    payload: JwtPayload,
    id: string,
    dto: SetRateDto,
    context: RequestContext,
  ): Promise<ResourceView> {
    await this.require(payload.org, id);
    await this.repository.setRate(id, {
      amount: dto.amount,
      unit: dto.unit,
      currency: dto.currency ?? "EUR",
    });
    await this.audit.log({
      action: "resource.rate_updated",
      entityType: "resource",
      entityId: id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { amount: dto.amount, unit: dto.unit, currency: dto.currency ?? "EUR" },
      ...context,
    });
    return this.get(payload, id);
  }

  // ── Affectation tâche ↔ ressource ──────────────────────────────────────

  async assignToTask(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    resourceId: string,
    context: RequestContext,
  ): Promise<TaskResourcesView> {
    await this.requireTask(payload.org, projectId, taskId);
    const resource = await this.require(payload.org, resourceId);
    if (!resource.active) {
      throw new BadRequestException({
        code: "RESOURCE_INACTIVE",
        message: "Une ressource archivée ne peut pas être affectée",
      });
    }
    if (await this.repository.isAssigned(taskId, resourceId)) {
      throw new ConflictException({
        code: "RESOURCE_ALREADY_ASSIGNED",
        message: "Ressource déjà affectée à cette tâche",
      });
    }
    await this.repository.assignToTask(taskId, resourceId);
    await this.audit.log({
      action: "resource.assigned",
      entityType: "task",
      entityId: taskId,
      organizationId: payload.org,
      userId: payload.sub,
      after: { resourceId },
      ...context,
    });
    return this.taskResources(payload, projectId, taskId);
  }

  async removeFromTask(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
    resourceId: string,
    context: RequestContext,
  ): Promise<TaskResourcesView> {
    await this.requireTask(payload.org, projectId, taskId);
    const removed = await this.repository.removeFromTask(taskId, resourceId);
    if (!removed) {
      throw new NotFoundException({
        code: "RESOURCE_NOT_ASSIGNED",
        message: "Ressource non affectée à cette tâche",
      });
    }
    await this.audit.log({
      action: "resource.unassigned",
      entityType: "task",
      entityId: taskId,
      organizationId: payload.org,
      userId: payload.sub,
      before: { resourceId },
      ...context,
    });
    return this.taskResources(payload, projectId, taskId);
  }

  // ── Coûts & charge ─────────────────────────────────────────────────────

  /** Ressources d'une tâche : durée (dérivée des dates), allocation et coût. */
  async taskResources(
    payload: JwtPayload,
    projectId: string,
    taskId: string,
  ): Promise<TaskResourcesView> {
    await this.requireTask(payload.org, projectId, taskId);
    const assignments = await this.repository.listAssignmentsForTask(projectId, taskId);
    const durationDays = assignments[0]
      ? taskDurationDays({ id: taskId, startDate: assignments[0].startDate, dueDate: assignments[0].dueDate })
      : await this.taskDuration(taskId);
    const resources = assignments.map((a) => this.costLine(a, durationDays));
    return {
      taskId,
      durationDays,
      resources,
      totalCost: round(resources.reduce((sum, r) => sum + r.cost, 0)),
      currency: resources[0]?.rate?.currency ?? "EUR",
    };
  }

  /** Coût total des ressources d'un projet, agrégé par ressource. */
  async projectResourceCost(
    payload: JwtPayload,
    projectId: string,
  ): Promise<ProjectResourceCostView> {
    await this.requireProject(payload.org, projectId);
    const assignments = await this.repository.listAssignmentsForProject(projectId);
    const byResource = new Map<string, { name: string; allocationDays: number; cost: number }>();
    for (const a of assignments) {
      const duration = taskDurationDays({ id: a.taskId, startDate: a.startDate, dueDate: a.dueDate });
      const line = this.costLine(a, duration);
      const entry = byResource.get(a.resourceId) ?? { name: line.name, allocationDays: 0, cost: 0 };
      entry.allocationDays += line.allocationDays;
      entry.cost = round(entry.cost + line.cost);
      byResource.set(a.resourceId, entry);
    }
    const perResource = [...byResource.entries()].map(([resourceId, e]) => ({
      resourceId,
      name: e.name,
      allocationDays: e.allocationDays,
      cost: e.cost,
    }));
    return {
      perResource,
      totalCost: round(perResource.reduce((sum, r) => sum + r.cost, 0)),
      totalAllocatedDays: perResource.reduce((sum, r) => sum + r.allocationDays, 0),
      resourceCount: perResource.length,
      currency: assignments[0]?.rate?.currency ?? "EUR",
    };
  }

  /**
   * Coût des ressources agrégé par projet — point d'intégration finance.
   * Réutilise la durée dérivée des dates et la politique de coût du module.
   * Isolation : le service finance ne transmet que des projets déjà vérifiés
   * comme appartenant à l'organisation.
   */
  async resourceCostByProject(projectIds: string[]): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    if (projectIds.length === 0) {
      return totals;
    }
    const assignments = await this.repository.listAssignmentsForProjects(projectIds);
    for (const a of assignments) {
      const duration = taskDurationDays({ id: a.taskId, startDate: a.startDate, dueDate: a.dueDate });
      const cost = a.rate ? calculateResourceCost(duration, a.rate.amount, a.rate.unit, a.hoursPerDay) : 0;
      totals.set(a.projectId, round((totals.get(a.projectId) ?? 0) + cost));
    }
    return totals;
  }

  /** Détail d'une ressource : affectations multi-projets, charge, coût, surcharge. */
  async detail(payload: JwtPayload, id: string) {
    const resource = await this.require(payload.org, id);
    const assignments = await this.repository.listAssignmentsForResource(payload.org, id);
    const lines = assignments.map((a) => {
      const duration = taskDurationDays({ id: a.taskId, startDate: a.startDate, dueDate: a.dueDate });
      const cost = a.rate ? calculateResourceCost(duration, a.rate.amount, a.rate.unit, a.hoursPerDay) : 0;
      return {
        taskId: a.taskId,
        taskTitle: a.taskTitle,
        projectId: a.projectId,
        projectName: a.projectName,
        startDate: a.startDate,
        dueDate: a.dueDate,
        durationDays: duration,
        cost,
      };
    });
    const byProject = new Map<string, { projectName: string; days: number; cost: number }>();
    for (const l of lines) {
      const entry = byProject.get(l.projectId) ?? { projectName: l.projectName, days: 0, cost: 0 };
      entry.days += l.durationDays;
      entry.cost = round(entry.cost + l.cost);
      byProject.set(l.projectId, entry);
    }
    const overlaps = detectOverlaps(
      assignments.map((a) => ({ taskId: a.taskId, startDate: a.startDate, dueDate: a.dueDate })),
    );
    return {
      resource: this.toView(resource),
      assignments: lines,
      workloadByProject: [...byProject.entries()].map(([projectId, e]) => ({
        projectId,
        projectName: e.projectName,
        allocationDays: e.days,
        cost: e.cost,
      })),
      totalAllocatedDays: lines.reduce((sum, l) => sum + l.durationDays, 0),
      totalCost: round(lines.reduce((sum, l) => sum + l.cost, 0)),
      overallocations: overlaps,
    };
  }

  // ── Aides privées ──────────────────────────────────────────────────────

  private costLine(a: AssignmentRecord, durationDays: number): TaskResourceLine {
    const cost = a.rate ? calculateResourceCost(durationDays, a.rate.amount, a.rate.unit, a.hoursPerDay) : 0;
    return {
      resourceId: a.resourceId,
      name: a.resourceName,
      rate: a.rate,
      allocationDays: durationDays,
      cost,
    };
  }

  private async taskDuration(taskId: string): Promise<number> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { startDate: true, dueDate: true },
    });
    return taskDurationDays({ id: taskId, startDate: task?.startDate ?? null, dueDate: task?.dueDate ?? null });
  }

  private toView(resource: ResourceRecord): ResourceView {
    return {
      id: resource.id,
      name: `${resource.firstName} ${resource.lastName}`.trim(),
      firstName: resource.firstName,
      lastName: resource.lastName,
      resourceType: resource.resourceType,
      company: resource.company,
      email: resource.email,
      phone: resource.phone,
      jobTitle: resource.jobTitle,
      active: resource.active,
      notes: resource.notes,
      rate: resource.currentRate,
    };
  }

  private async require(organizationId: string, id: string): Promise<ResourceRecord> {
    const resource = await this.repository.findById(organizationId, id);
    if (!resource) {
      throw new NotFoundException({ code: "RESOURCE_NOT_FOUND", message: "Ressource introuvable" });
    }
    return resource;
  }

  /** Vérifie que le projet appartient à l'organisation (isolation tenant). */
  private async requireProject(organizationId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException({ code: "PROJECT_NOT_FOUND", message: "Projet introuvable" });
    }
  }

  /** Vérifie que la tâche appartient au projet et à l'organisation. */
  private async requireTask(organizationId: string, projectId: string, taskId: string): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException({ code: "TASK_NOT_FOUND", message: "Tâche introuvable" });
    }
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
