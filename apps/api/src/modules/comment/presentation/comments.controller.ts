import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { CommentsService, CommentView } from "../application/comments.service";
import { CreateCommentDto } from "../application/dto/comment.dtos";

@ApiTags("comments")
@ApiBearerAuth()
@Controller("projects/:projectId/tasks/:taskId/comments")
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @ApiOperation({ summary: "Commentaires de la tâche" })
  list(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
  ): Promise<CommentView[]> {
    return this.comments.list(user, projectId, taskId);
  }

  @Post()
  @ApiOperation({ summary: "Commenter (mentions @ notifiées)" })
  create(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() dto: CreateCommentDto,
    @Req() request: Request,
  ): Promise<CommentView> {
    return this.comments.create(user, projectId, taskId, dto, this.context(request));
  }

  @Delete(":commentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Supprimer un commentaire (auteur ou responsable)" })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Param("commentId", ParseUUIDPipe) commentId: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.comments.delete(user, projectId, taskId, commentId, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
