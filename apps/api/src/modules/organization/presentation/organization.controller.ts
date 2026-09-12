import { Body, Controller, Get, Patch, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { P } from "../../auth/domain/permissions";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { RequirePermissions } from "../../auth/infrastructure/decorators/require-permissions.decorator";
import { OrganizationService } from "../application/organization.service";
import { UpdateOrganizationDto } from "../application/dto/update-organization.dto";
import type { OrganizationProfile } from "../domain/organization.repository";

@ApiTags("organization")
@ApiBearerAuth()
@Controller("organization")
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get("profile")
  @ApiOperation({ summary: "Profil de l'organisation courante (nom, coordonnées)" })
  getProfile(@CurrentUser() user: JwtPayload): Promise<OrganizationProfile> {
    return this.organization.getProfile(user.org);
  }

  @Patch("profile")
  @RequirePermissions(P.ORGANIZATION_MANAGE)
  @ApiOperation({ summary: "Modifier le profil de l'organisation (admin)" })
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateOrganizationDto,
    @Req() request: Request,
  ): Promise<OrganizationProfile> {
    return this.organization.updateProfile(user.org, user.sub, dto, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
