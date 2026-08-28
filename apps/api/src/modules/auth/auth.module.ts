import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { AuthService } from "./application/auth.service";
import { MfaService } from "./application/mfa.service";
import { PermissionsService } from "./application/permissions.service";
import { TokenService } from "./application/token.service";
import { AUTH_REPOSITORY } from "./domain/auth.repository";
import { PrismaAuthRepository } from "./infrastructure/prisma-auth.repository";
import { AuthController } from "./presentation/auth.controller";

@Module({
  imports: [BillingModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    MfaService,
    TokenService,
    PermissionsService,
    { provide: AUTH_REPOSITORY, useClass: PrismaAuthRepository },
  ],
  // PermissionsService est exporté pour la garde globale (app.module) et les
  // modules qui basculeront vers les permissions.
  exports: [AuthService, PermissionsService],
})
export class AuthModule {}
