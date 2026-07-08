import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ProjectCategory, RoleKey } from "@openppm/db";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { Roles } from "../../auth/infrastructure/decorators/roles.decorator";
import { CategoriesService } from "../application/categories.service";
import {
  CreateCategoryDto,
  UpdateCategoryDto,
} from "../application/dto/category-template.dtos";

@ApiTags("project-categories")
@ApiBearerAuth()
@Controller("project-categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: "Catégories de projets de l'organisation" })
  list(@CurrentUser() user: JwtPayload): Promise<ProjectCategory[]> {
    return this.categories.list(user);
  }

  @Post()
  @Roles(RoleKey.admin, RoleKey.manager, RoleKey.pmo)
  @ApiOperation({ summary: "Créer une catégorie" })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCategoryDto,
    @Req() request: Request,
  ): Promise<ProjectCategory> {
    return this.categories.create(user, dto, this.context(request));
  }

  @Patch(":id")
  @Roles(RoleKey.admin, RoleKey.manager, RoleKey.pmo)
  @ApiOperation({ summary: "Renommer / recolorer une catégorie" })
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @Req() request: Request,
  ): Promise<ProjectCategory> {
    return this.categories.update(user, id, dto, this.context(request));
  }

  @Delete(":id")
  @Roles(RoleKey.admin, RoleKey.manager, RoleKey.pmo)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Supprimer une catégorie (les projets sont détachés)" })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.categories.remove(user, id, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
