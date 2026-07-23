import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import {
  BusinessCasesService,
  BusinessCaseView,
} from "../application/business-cases.service";
import { UpsertBusinessCaseDto } from "../application/dto/business-case.dtos";

@ApiTags("demands")
@ApiBearerAuth()
@Controller("demands/:id/business-case")
export class BusinessCasesController {
  constructor(private readonly businessCases: BusinessCasesService) {}

  @Get()
  @ApiOperation({ summary: "Business Case d'une demande (null s'il n'existe pas encore)" })
  get(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) demandId: string,
  ): Promise<BusinessCaseView | null> {
    return this.businessCases.get(user, demandId);
  }

  @Put()
  @ApiOperation({ summary: "Créer ou mettre à jour le Business Case (PMO / Business Analyst)" })
  upsert(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) demandId: string,
    @Body() dto: UpsertBusinessCaseDto,
    @Req() request: Request,
  ): Promise<BusinessCaseView> {
    return this.businessCases.upsert(user, demandId, dto, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
