import { Module } from "@nestjs/common";
import { AuthService } from "./application/auth.service";
import { MfaService } from "./application/mfa.service";
import { TokenService } from "./application/token.service";
import { AUTH_REPOSITORY } from "./domain/auth.repository";
import { PrismaAuthRepository } from "./infrastructure/prisma-auth.repository";
import { AuthController } from "./presentation/auth.controller";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    MfaService,
    TokenService,
    { provide: AUTH_REPOSITORY, useClass: PrismaAuthRepository },
  ],
  exports: [AuthService],
})
export class AuthModule {}
