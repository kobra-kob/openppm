import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ProjectCategory } from "@openppm/db";
import { AuditService } from "../../../core/audit/audit.service";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { PROJECT_REPOSITORY } from "../domain/project.repository";
import type { ProjectRepository } from "../domain/project.repository";
import type { CreateCategoryDto, UpdateCategoryDto } from "./dto/category-template.dtos";

@Injectable()
export class CategoriesService {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly repository: ProjectRepository,
    private readonly audit: AuditService,
  ) {}

  list(payload: JwtPayload): Promise<ProjectCategory[]> {
    return this.repository.listCategories(payload.org);
  }

  async create(
    payload: JwtPayload,
    dto: CreateCategoryDto,
    context: RequestContext,
  ): Promise<ProjectCategory> {
    if (await this.repository.categoryNameTaken(payload.org, dto.name)) {
      throw new ConflictException({
        code: "CATEGORY_ALREADY_EXISTS",
        message: "Une catégorie porte déjà ce nom",
      });
    }
    const category = await this.repository.createCategory({
      organizationId: payload.org,
      name: dto.name,
      color: dto.color,
    });
    await this.audit.log({
      action: "project_category.created",
      entityType: "project_category",
      entityId: category.id,
      organizationId: payload.org,
      userId: payload.sub,
      after: { name: category.name, color: category.color },
      ...context,
    });
    return category;
  }

  async update(
    payload: JwtPayload,
    id: string,
    dto: UpdateCategoryDto,
    context: RequestContext,
  ): Promise<ProjectCategory> {
    const category = await this.requireCategory(payload.org, id);
    if (
      dto.name &&
      dto.name !== category.name &&
      (await this.repository.categoryNameTaken(payload.org, dto.name))
    ) {
      throw new ConflictException({
        code: "CATEGORY_ALREADY_EXISTS",
        message: "Une catégorie porte déjà ce nom",
      });
    }
    const updated = await this.repository.updateCategory(category.id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.color !== undefined ? { color: dto.color } : {}),
    });
    await this.audit.log({
      action: "project_category.updated",
      entityType: "project_category",
      entityId: category.id,
      organizationId: payload.org,
      userId: payload.sub,
      before: { name: category.name, color: category.color },
      after: { name: updated.name, color: updated.color },
      ...context,
    });
    return updated;
  }

  async remove(payload: JwtPayload, id: string, context: RequestContext): Promise<void> {
    const category = await this.requireCategory(payload.org, id);
    await this.repository.deleteCategory(category.id);
    await this.audit.log({
      action: "project_category.deleted",
      entityType: "project_category",
      entityId: category.id,
      organizationId: payload.org,
      userId: payload.sub,
      before: { name: category.name },
      ...context,
    });
  }

  private async requireCategory(
    organizationId: string,
    id: string,
  ): Promise<ProjectCategory> {
    const category = await this.repository.findCategory(organizationId, id);
    if (!category) {
      throw new NotFoundException({
        code: "CATEGORY_NOT_FOUND",
        message: "Catégorie introuvable",
      });
    }
    return category;
  }
}
