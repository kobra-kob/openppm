import { Module } from "@nestjs/common";
import { ProjectsService } from "./application/projects.service";
import { PROJECT_REPOSITORY } from "./domain/project.repository";
import { PrismaProjectRepository } from "./infrastructure/prisma-project.repository";
import { ProjectsController } from "./presentation/projects.controller";

@Module({
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    { provide: PROJECT_REPOSITORY, useClass: PrismaProjectRepository },
  ],
  exports: [ProjectsService],
})
export class ProjectModule {}
