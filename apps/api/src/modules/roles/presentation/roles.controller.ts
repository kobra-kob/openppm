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
import { RequirePermissions } from "../../auth/infrastructure/decorators/require-permissions.decorator";
import { P } from "../../auth/domain/permissions";
import {
  PermissionView,
  RoleView,
  RolesService,
} from "../application/roles.service";
import { CreateRoleDto, UpdateRoleDto } from "../application/dto/role.dtos";

@ApiTags("roles")
@ApiBearerAuth()
@Controller()
@RequirePermissions(P.ROLE_MANAGE)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get("permissions")
  @ApiOperation({ summary: "Catalogue des permissions (éditeur de rôles)" })
  listPermissions(): Promise<PermissionView[]> {
    return this.roles.listPermissions();
  }

  @Get("roles")
  @ApiOperation({ summary: "Lister les rôles (système + personnalisés de l'org)" })
  list(@CurrentUser() user: JwtPayload): Promise<RoleView[]> {
    return this.roles.list(user);
  }

  @Get("roles/:id/users")
  @ApiOperation({ summary: "Utilisateurs possédant ce rôle" })
  users(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<Array<{ id: string; name: string; email: string }>> {
    return this.roles.listUsers(user, id);
  }

  @Post("roles")
  @ApiOperation({ summary: "Créer un rôle personnalisé" })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRoleDto,
    @Req() request: Request,
  ): Promise<RoleView> {
    return this.roles.create(user, dto, this.context(request));
  }

  @Patch("roles/:id")
  @ApiOperation({ summary: "Modifier un rôle (permissions, description, activation)" })
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @Req() request: Request,
  ): Promise<RoleView> {
    return this.roles.update(user, id, dto, this.context(request));
  }

  @Delete("roles/:id")
  @HttpCode(204)
  @ApiOperation({ summary: "Supprimer un rôle personnalisé non attribué" })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.roles.remove(user, id, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
