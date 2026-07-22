import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { QuoteService, QuoteView } from "../application/quote.service";
import {
  CreateQuoteDto,
  CreateQuoteLineDto,
  DecideQuoteDto,
  UpdateQuoteDto,
  UpdateQuoteLineDto,
} from "../application/dto/quote.dtos";

@ApiTags("quotes")
@ApiBearerAuth()
@Controller("projects/:projectId/quotes")
export class QuoteController {
  constructor(private readonly quotes: QuoteService) {}

  @Get()
  @ApiOperation({ summary: "Lister les devis du projet" })
  list(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
  ): Promise<QuoteView[]> {
    return this.quotes.list(user, projectId);
  }

  @Post()
  @ApiOperation({ summary: "Créer un devis (brouillon)" })
  create(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body() dto: CreateQuoteDto,
    @Req() request: Request,
  ): Promise<QuoteView> {
    return this.quotes.create(user, projectId, dto, this.context(request));
  }

  @Get(":quoteId")
  @ApiOperation({ summary: "Détail d'un devis (lignes + totaux + workflow)" })
  get(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("quoteId", ParseUUIDPipe) quoteId: string,
  ): Promise<QuoteView> {
    return this.quotes.get(user, projectId, quoteId);
  }

  @Patch(":quoteId")
  @ApiOperation({ summary: "Modifier l'en-tête d'un devis (brouillon)" })
  update(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("quoteId", ParseUUIDPipe) quoteId: string,
    @Body() dto: UpdateQuoteDto,
    @Req() request: Request,
  ): Promise<QuoteView> {
    return this.quotes.update(user, projectId, quoteId, dto, this.context(request));
  }

  @Delete(":quoteId")
  @HttpCode(204)
  @ApiOperation({ summary: "Supprimer un devis" })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("quoteId", ParseUUIDPipe) quoteId: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.quotes.remove(user, projectId, quoteId, this.context(request));
  }

  @Post(":quoteId/lines")
  @ApiOperation({ summary: "Ajouter une ligne au devis" })
  addLine(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("quoteId", ParseUUIDPipe) quoteId: string,
    @Body() dto: CreateQuoteLineDto,
    @Req() request: Request,
  ): Promise<QuoteView> {
    return this.quotes.addLine(user, projectId, quoteId, dto, this.context(request));
  }

  @Patch(":quoteId/lines/:lineId")
  @ApiOperation({ summary: "Modifier une ligne du devis" })
  updateLine(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("quoteId", ParseUUIDPipe) quoteId: string,
    @Param("lineId", ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateQuoteLineDto,
    @Req() request: Request,
  ): Promise<QuoteView> {
    return this.quotes.updateLine(user, projectId, quoteId, lineId, dto, this.context(request));
  }

  @Delete(":quoteId/lines/:lineId")
  @ApiOperation({ summary: "Supprimer une ligne du devis" })
  deleteLine(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("quoteId", ParseUUIDPipe) quoteId: string,
    @Param("lineId", ParseUUIDPipe) lineId: string,
    @Req() request: Request,
  ): Promise<QuoteView> {
    return this.quotes.deleteLine(user, projectId, quoteId, lineId, this.context(request));
  }

  @Post(":quoteId/submit")
  @ApiOperation({ summary: "Soumettre le devis à la validation" })
  submit(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("quoteId", ParseUUIDPipe) quoteId: string,
    @Req() request: Request,
  ): Promise<QuoteView> {
    return this.quotes.submit(user, projectId, quoteId, this.context(request));
  }

  @Post(":quoteId/review")
  @ApiOperation({ summary: "Revue niveau 1 (encadrement)" })
  review(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("quoteId", ParseUUIDPipe) quoteId: string,
    @Body() dto: DecideQuoteDto,
    @Req() request: Request,
  ): Promise<QuoteView> {
    return this.quotes.review(user, projectId, quoteId, dto, this.context(request));
  }

  @Post(":quoteId/approve")
  @ApiOperation({ summary: "Validation finale niveau 2 (finance/direction)" })
  approve(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("quoteId", ParseUUIDPipe) quoteId: string,
    @Body() dto: DecideQuoteDto,
    @Req() request: Request,
  ): Promise<QuoteView> {
    return this.quotes.approve(user, projectId, quoteId, dto, this.context(request));
  }

  @Post(":quoteId/duplicate")
  @ApiOperation({ summary: "Créer une révision (nouveau brouillon)" })
  duplicate(
    @CurrentUser() user: JwtPayload,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("quoteId", ParseUUIDPipe) quoteId: string,
    @Req() request: Request,
  ): Promise<QuoteView> {
    return this.quotes.duplicate(user, projectId, quoteId, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
