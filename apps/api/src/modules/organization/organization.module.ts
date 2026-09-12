import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OrganizationService } from "./application/organization.service";
import { ORGANIZATION_REPOSITORY } from "./domain/organization.repository";
import { PrismaOrganizationRepository } from "./infrastructure/prisma-organization.repository";
import { OrganizationController } from "./presentation/organization.controller";

@Module({
  // AuthModule : guards de permissions (ORGANIZATION_MANAGE) déjà globaux.
  imports: [AuthModule],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    { provide: ORGANIZATION_REPOSITORY, useClass: PrismaOrganizationRepository },
  ],
})
export class OrganizationModule {}
