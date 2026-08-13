import { Module } from "@nestjs/common";
import { RolesService } from "./application/roles.service";
import { RolesController } from "./presentation/roles.controller";

/** Administration des rôles et permissions (réservée à la permission ROLE_MANAGE). */
@Module({
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
