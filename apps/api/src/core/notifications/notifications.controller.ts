import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { JwtPayload } from "../../modules/auth/application/jwt-payload";
import { CurrentUser } from "../../modules/auth/infrastructure/decorators/current-user.decorator";
import { NotificationsService, NotificationView } from "./notifications.service";

@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "Mes notifications (30 dernières) + nombre de non-lues" })
  async list(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ items: NotificationView[]; unread: number }> {
    const [items, unread] = await Promise.all([
      this.notifications.list(user.sub),
      this.notifications.countUnread(user.sub),
    ]);
    return { items, unread };
  }

  @Post(":id/read")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Marquer une notification comme lue" })
  async markRead(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notifications.markRead(user.sub, id);
  }

  @Post("read-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Tout marquer comme lu" })
  async markAllRead(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.notifications.markAllRead(user.sub);
  }
}
