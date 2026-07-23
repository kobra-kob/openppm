import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@openppm/db";
import { MailerService } from "../mailer/mailer.service";
import { PrismaService } from "../prisma/prisma.service";

/** Type discriminant côté client pour le rendu i18n de la notification. */
export type NotificationType =
  | "task.assigned"
  | "task.comment"
  | "task.mention"
  | "demand.transition";

export interface CreateNotificationInput {
  organizationId: string;
  userId: string;
  type: NotificationType;
  payload: Prisma.InputJsonObject;
  /** Email envoyé en plus de la notification in-app. */
  email?: { to: string; subject: string; text: string };
}

export interface NotificationView {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
}

/**
 * Socle de notifications transverse : crée les notifications in-app et
 * délègue l'email au mailer. Une notification qui échoue ne doit jamais
 * casser l'action métier — les erreurs sont loggées puis avalées.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    config: ConfigService,
  ) {
    this.appUrl = config.get<string>("APP_URL") ?? "http://localhost:3000";
  }

  /** Notifie un ensemble d'utilisateurs (auteur exclu par l'appelant). */
  async notifyMany(inputs: CreateNotificationInput[]): Promise<void> {
    await Promise.all(inputs.map((input) => this.notify(input)));
  }

  async notify(input: CreateNotificationInput): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          type: input.type,
          payload: input.payload,
        },
      });
      if (input.email) {
        await this.mailer.send({
          to: input.email.to,
          subject: input.email.subject,
          text: `${input.email.text}\n\n${this.appUrl}`,
        });
      }
    } catch (error) {
      this.logger.error(
        `Notification échouée (${input.type} → ${input.userId})`,
        error as Error,
      );
    }
  }

  list(userId: string): Promise<NotificationView[]> {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        type: true,
        payload: true,
        readAt: true,
        createdAt: true,
      },
    });
  }

  countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
