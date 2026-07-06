import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import helmet from "helmet";

/**
 * Configuration HTTP commune à main.ts et aux tests d'intégration,
 * pour que les tests exercent exactement la même app que la prod.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix("api/v1", { exclude: ["health"] });
  app.enableCors({
    origin: (config.get<string>("CORS_ORIGIN") ?? "http://localhost:3000").split(","),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
