import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule, JwtSignOptions } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { validateEnv } from "./config/env.validation";
import { AuditModule } from "./core/audit/audit.module";
import { FavoritesModule } from "./core/favorites/favorites.module";
import { HealthController } from "./core/health/health.controller";
import { MailerModule } from "./core/mailer/mailer.module";
import { PrismaModule } from "./core/prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { MembersModule } from "./modules/members/members.module";
import { ProjectModule } from "./modules/project/project.module";
import { BoardModule } from "./modules/board/board.module";
import { TaskModule } from "./modules/task/task.module";
import { JwtAuthGuard } from "./modules/auth/infrastructure/guards/jwt-auth.guard";
import { RolesGuard } from "./modules/auth/infrastructure/guards/roles.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level:
            config.get("NODE_ENV") === "test"
              ? "silent"
              : config.get("NODE_ENV") === "production"
                ? "info"
                : "debug",
          redact: ["req.headers.authorization", "req.headers.cookie"],
          transport:
            config.get("NODE_ENV") === "development"
              ? { target: "pino-pretty", options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        skipIf: () => config.get("NODE_ENV") === "test",
      }),
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: (config.get<string>("JWT_ACCESS_TTL") ??
            "900s") as JwtSignOptions["expiresIn"],
        },
      }),
    }),
    PrismaModule,
    AuditModule,
    FavoritesModule,
    MailerModule,
    AuthModule,
    MembersModule,
    ProjectModule,
    TaskModule,
    BoardModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
