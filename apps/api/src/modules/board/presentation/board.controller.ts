import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import {
  CreateColumnDto,
  MoveCardDto,
  UpdateColumnDto,
} from "../application/dto/board.dtos";
import { BoardService, BoardView } from "../application/board.service";

@ApiTags("board")
@ApiBearerAuth()
@Controller("projects/:projectId/board")
export class BoardController {
  constructor(private readonly board: BoardService) {}

  @Get()
  @ApiOperation({
    summary: "Board Kanban du projet (créé avec les colonnes par défaut au premier accès)",
  })
  get(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
  ): Promise<BoardView> {
    return this.board.getBoard(user, projectId);
  }

  @Post("columns")
  @ApiOperation({ summary: "Ajouter une colonne (responsables du projet)" })
  addColumn(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body() dto: CreateColumnDto,
    @Req() request: Request,
  ): Promise<BoardView> {
    return this.board.addColumn(user, projectId, dto, this.context(request));
  }

  @Patch("columns/:columnId")
  @ApiOperation({ summary: "Modifier une colonne (nom, WIP, mapping, position)" })
  updateColumn(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("columnId", ParseUUIDPipe) columnId: string,
    @Body() dto: UpdateColumnDto,
    @Req() request: Request,
  ): Promise<BoardView> {
    return this.board.updateColumn(user, projectId, columnId, dto, this.context(request));
  }

  @Delete("columns/:columnId")
  @ApiOperation({ summary: "Supprimer une colonne (cartes reversées par statut)" })
  deleteColumn(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("columnId", ParseUUIDPipe) columnId: string,
    @Req() request: Request,
  ): Promise<BoardView> {
    return this.board.deleteColumn(user, projectId, columnId, this.context(request));
  }

  @Post("move")
  @ApiOperation({ summary: "Déplacer une carte (colonne + position, statut synchronisé)" })
  move(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body() dto: MoveCardDto,
    @Req() request: Request,
  ): Promise<BoardView> {
    return this.board.move(user, projectId, dto, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
