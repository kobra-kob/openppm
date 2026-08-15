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
  Put,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RoleKey } from "@openppm/db";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { P } from "../../auth/domain/permissions";
import { RequirePermissions } from "../../auth/infrastructure/decorators/require-permissions.decorator";
import { Roles } from "../../auth/infrastructure/decorators/roles.decorator";
import type { MemberSummary } from "../domain/members.repository";
import { InviteMemberDto } from "../application/dto/invite-member.dto";
import { SetMemberRolesDto } from "../application/dto/set-member-roles.dto";
import {
  MembersService,
  PendingInvitationView,
} from "../application/members.service";

@ApiTags("members")
@ApiBearerAuth()
@Controller("members")
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @ApiOperation({ summary: "Membres de l'organisation courante" })
  list(@CurrentUser() user: JwtPayload): Promise<MemberSummary[]> {
    return this.members.listMembers(user.org);
  }

  @Put(":userId/roles")
  @RequirePermissions(P.MEMBER_MANAGE)
  @ApiOperation({ summary: "Définir les rôles d'un membre (rôles cumulables)" })
  setRoles(
    @CurrentUser() user: JwtPayload,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: SetMemberRolesDto,
    @Req() request: Request,
  ): Promise<MemberSummary> {
    return this.members.setRoles(user, userId, dto.roleIds, this.context(request));
  }

  @Get("invitations")
  @Roles(RoleKey.admin, RoleKey.manager)
  @ApiOperation({ summary: "Invitations en attente" })
  invitations(@CurrentUser() user: JwtPayload): Promise<PendingInvitationView[]> {
    return this.members.listInvitations(user.org);
  }

  @Post("invitations")
  @Roles(RoleKey.admin, RoleKey.manager)
  @ApiOperation({ summary: "Inviter un collaborateur avec un rôle" })
  invite(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InviteMemberDto,
    @Req() request: Request,
  ): Promise<PendingInvitationView> {
    return this.members.invite(user.org, user.sub, dto, this.context(request));
  }

  @Delete("invitations/:id")
  @Roles(RoleKey.admin, RoleKey.manager)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Révoquer une invitation en attente" })
  async revoke(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.members.revoke(user.org, id, user.sub, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
