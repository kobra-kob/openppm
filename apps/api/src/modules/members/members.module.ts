import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { MembersService } from "./application/members.service";
import { MEMBERS_REPOSITORY } from "./domain/members.repository";
import { PrismaMembersRepository } from "./infrastructure/prisma-members.repository";
import { MembersController } from "./presentation/members.controller";

@Module({
  // AuthModule : PermissionsService (invalidation cache) ; BillingModule : sièges.
  imports: [AuthModule, BillingModule],
  controllers: [MembersController],
  providers: [
    MembersService,
    { provide: MEMBERS_REPOSITORY, useClass: PrismaMembersRepository },
  ],
})
export class MembersModule {}
