import { Module } from "@nestjs/common";
import { ResourceService } from "./application/resource.service";
import { RESOURCE_REPOSITORY } from "./domain/resource.repository";
import { PrismaResourceRepository } from "./infrastructure/prisma-resource.repository";
import { ProjectResourcesController } from "./presentation/project-resources.controller";
import { ResourcesController } from "./presentation/resources.controller";

/**
 * Module Ressources : gestion des ressources projet (personnes/prestations),
 * de leurs tarifs, de leur affectation aux tâches, et du calcul de charge et de
 * coût. Extension native — ne remplace pas la finance existante.
 */
@Module({
  controllers: [ResourcesController, ProjectResourcesController],
  providers: [
    ResourceService,
    { provide: RESOURCE_REPOSITORY, useClass: PrismaResourceRepository },
  ],
  exports: [ResourceService],
})
export class ResourceModule {}
