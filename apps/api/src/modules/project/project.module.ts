import { Module } from "@nestjs/common";
import { CategoriesService } from "./application/categories.service";
import { ProjectDashboardService } from "./application/project-dashboard.service";
import { ProjectsService } from "./application/projects.service";
import { TemplatesService } from "./application/templates.service";
import { PROJECT_REPOSITORY } from "./domain/project.repository";
import { PrismaProjectRepository } from "./infrastructure/prisma-project.repository";
import { CategoriesController } from "./presentation/categories.controller";
import { OrganizationSettingsController } from "./presentation/organization-settings.controller";
import { ProjectsController } from "./presentation/projects.controller";
import { TemplatesController } from "./presentation/templates.controller";

@Module({
  controllers: [
    ProjectsController,
    CategoriesController,
    TemplatesController,
    OrganizationSettingsController,
  ],
  providers: [
    ProjectsService,
    ProjectDashboardService,
    CategoriesService,
    TemplatesService,
    { provide: PROJECT_REPOSITORY, useClass: PrismaProjectRepository },
  ],
  exports: [ProjectsService],
})
export class ProjectModule {}
