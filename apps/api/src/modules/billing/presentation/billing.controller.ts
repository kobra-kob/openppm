import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import { P } from "../../auth/domain/permissions";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { RequirePermissions } from "../../auth/infrastructure/decorators/require-permissions.decorator";
import { BillingOverview, BillingService } from "../application/billing.service";
import { SubscriptionExempt } from "../infrastructure/subscription-exempt.decorator";

@ApiTags("billing")
@ApiBearerAuth()
@Controller("billing")
@SubscriptionExempt()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @RequirePermissions(P.BILLING_VIEW)
  @ApiOperation({ summary: "Vue d'ensemble de l'abonnement et de la facturation de l'org" })
  overview(@CurrentUser() user: JwtPayload): Promise<BillingOverview> {
    return this.billing.getOverview(user);
  }
}
