import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@openppm/db";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  organizationId?: string;
  userId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string;
  userAgent?: string;
}

/**
 * Journal d'audit : qui, quand, quoi, avant/après, IP.
 * Une écriture d'audit qui échoue ne doit jamais faire échouer
 * l'opération métier : l'erreur est loggée puis avalée.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          organizationId: entry.organizationId ?? null,
          userId: entry.userId ?? null,
          before: entry.before ?? Prisma.JsonNull,
          after: entry.after ?? Prisma.JsonNull,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent?.slice(0, 255) ?? null,
        },
      });
    } catch (error) {
      this.logger.error(`Écriture d'audit échouée (${entry.action})`, error as Error);
    }
  }
}
