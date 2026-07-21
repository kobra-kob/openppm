import { Module } from "@nestjs/common";
import { CommentsService } from "./application/comments.service";
import { COMMENT_REPOSITORY } from "./domain/comment.repository";
import { PrismaCommentRepository } from "./infrastructure/prisma-comment.repository";
import { CommentsController } from "./presentation/comments.controller";

@Module({
  controllers: [CommentsController],
  providers: [
    CommentsService,
    { provide: COMMENT_REPOSITORY, useClass: PrismaCommentRepository },
  ],
})
export class CommentModule {}
