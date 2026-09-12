import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import {
  TenantDashboardService,
  TenantDashboardView,
} from "../application/tenant-dashboard.service";

@ApiTags("dashboard")
@ApiBearerAuth()
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: TenantDashboardService) {}

  @Get()
  @ApiOperation({ summary: "Tableau de bord global de l'organisation courante" })
  forOrganization(@CurrentUser() user: JwtPayload): Promise<TenantDashboardView> {
    return this.dashboard.forOrganization(user.org);
  }
}
