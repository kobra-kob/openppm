import { Module } from "@nestjs/common";
import { MembersService } from "./application/members.service";
import { MEMBERS_REPOSITORY } from "./domain/members.repository";
import { PrismaMembersRepository } from "./infrastructure/prisma-members.repository";
import { MembersController } from "./presentation/members.controller";

@Module({
  controllers: [MembersController],
  providers: [
    MembersService,
    { provide: MEMBERS_REPOSITORY, useClass: PrismaMembersRepository },
  ],
})
export class MembersModule {}
