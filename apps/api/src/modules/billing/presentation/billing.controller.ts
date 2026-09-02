import { Controller, Get, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { P } from "../../auth/domain/permissions";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { RequirePermissions } from "../../auth/infrastructure/decorators/require-permissions.decorator";
import { BillingOverview, BillingService, CheckoutResult } from "../application/billing.service";
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

  @Post("checkout")
  @RequirePermissions(P.SUBSCRIPTION_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Démarrer un abonnement (Stripe Checkout, ou activation mock)" })
  checkout(@CurrentUser() user: JwtPayload, @Req() request: Request): Promise<CheckoutResult> {
    return this.billing.startCheckout(user, this.context(request));
  }

  @Post("portal")
  @RequirePermissions(P.BILLING_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Ouvrir le portail de facturation Stripe" })
  portal(@CurrentUser() user: JwtPayload, @Req() request: Request): Promise<{ url: string }> {
    return this.billing.openPortal(user, this.context(request));
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
