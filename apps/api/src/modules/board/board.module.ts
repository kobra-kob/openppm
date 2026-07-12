import { Module } from "@nestjs/common";
import { BoardService } from "./application/board.service";
import { BOARD_REPOSITORY } from "./domain/board.repository";
import { PrismaBoardRepository } from "./infrastructure/prisma-board.repository";
import { BoardController } from "./presentation/board.controller";

@Module({
  controllers: [BoardController],
  providers: [
    BoardService,
    { provide: BOARD_REPOSITORY, useClass: PrismaBoardRepository },
  ],
})
export class BoardModule {}
