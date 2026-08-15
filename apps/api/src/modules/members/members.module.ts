import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MembersService } from "./application/members.service";
import { MEMBERS_REPOSITORY } from "./domain/members.repository";
import { PrismaMembersRepository } from "./infrastructure/prisma-members.repository";
import { MembersController } from "./presentation/members.controller";

@Module({
  imports: [AuthModule], // PermissionsService (invalidation du cache lors d'un changement de rôles)
  controllers: [MembersController],
  providers: [
    MembersService,
    { provide: MEMBERS_REPOSITORY, useClass: PrismaMembersRepository },
  ],
})
export class MembersModule {}
