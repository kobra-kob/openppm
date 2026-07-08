import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../../../core/audit/audit.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { PROJECT_REPOSITORY } from "../domain/project.repository";
import type {
  ProjectRepository,
  TemplateWithCategory,
} from "../domain/project.repository";
import type { CreateTemplateDto } from "./dto/category-template.dtos";

export interface TemplateView {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  budget: string | null;
  durationDays: number | null;
  category: { id: string; name: string; color: string } | null;
  createdAt: Date;
}

@Injectable()
export class TemplatesService {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly repository: ProjectRepository,
    private readonly audit: AuditService,
  ) {}

  private toView(template: TemplateWithCategory): TemplateView {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      priority: template.priority,
      budget: template.budget?.toString() ?? null,
      durationDays: template.durationDays,
      category: template.category
        ? {
            id: template.category.id,
            name: template.category.name,
            color: template.category.color,
          }
        : null,
      createdAt: template.createdAt,
    };
  }

  async list(payload: JwtPayload): Promise<TemplateView[]> {
    const templates = await this.repository.listTemplates(payload.org);
    return templates.map((template) => this.toView(template));
  }

  async create(
    payload: JwtPayload,
    dto: CreateTemplateDto,
    context: RequestContext,
  ): Promise<TemplateView> {
    if (await this.repository.templateNameTaken(payload.org, dto.name)) {
      throw new ConflictException({
        code: "TEMPLATE_ALREADY_EXISTS",
        message: "Un template porte déjà ce nom",
      });
    }
    let defaults: Omit<CreateTemplateDto, "name" | "fromProjectId"> = dto;
    if (dto.fromProjectId) {
      const project = await this.repository.findById(payload.org, dto.fromProjectId);
      if (!project) {
        throw new NotFoundException({
          code: "PROJECT_NOT_FOUND",
          message: "Projet source introuvable",
        });
      }
      const durationDays =
        project.startDate && project.endDate
          ? Math.max(
              1,
              Math.round(
                (project.endDate.getTime() - project.startDate.getTime()) / 86_400_000,
              ),
            )
          : undefined;
      defaults = {
        description: dto.description ?? project.description ?? undefined,
        priority: dto.priority ?? project.priority,
        budget: dto.budget ?? (project.budget ? Number(project.budget) : undefined),
        durationDays: dto.durationDays ?? durationDays,
        categoryId: dto.categoryId ?? project.categoryId ?? undefined,
      };
    }
    if (defaults.categoryId && !(await this.repository.findCategory(payload.org, defaults.categoryId))) {
      throw new BadRequestException({
        code: "CATEGORY_NOT_FOUND",
        message: "Catégorie introuvable",
      });
    }
    const template = await this.repository.createTemplate({
      organizationId: payload.org,
      name: dto.name,
      description: defaults.description,
      priority: defaults.priority,
      budget: defaults.budget,
      durationDays: defaults.durationDays,
      categoryId: defaults.categoryId,
      createdById: payload.sub,
    });
    await this.audit.log({
      action: "project_template.created",
      entityType: "project_template",
      entityId: template.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { name: template.name, fromProjectId: dto.fromProjectId ?? null },
      ...context,
    });
    return this.toView(template);
  }

  async remove(payload: JwtPayload, id: string, context: RequestContext): Promise<void> {
    const template = await this.repository.findTemplate(payload.org, id);
    if (!template) {
      throw new NotFoundException({
        code: "TEMPLATE_NOT_FOUND",
        message: "Template introuvable",
      });
    }
    await this.repository.deleteTemplate(template.id);
    await this.audit.log({
      action: "project_template.deleted",
      entityType: "project_template",
      entityId: template.id,
      organizationId: payload.org,
      userId: payload.sub,
      before: { name: template.name },
      ...context,
    });
  }
}
