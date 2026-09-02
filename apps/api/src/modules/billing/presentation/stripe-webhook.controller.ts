import { Controller, Headers, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { Public } from "../../auth/infrastructure/decorators/public.decorator";
import { StripeWebhookService } from "../application/stripe-webhook.service";

/**
 * Réception des webhooks Stripe (public, HTTPS). La signature est vérifiée par
 * le service ; le corps brut est requis (main.ts : rawBody). Idempotent.
 */
@ApiTags("webhooks")
@Controller("webhooks/stripe")
export class StripeWebhookController {
  constructor(private readonly webhook: StripeWebhookService) {}

  @Public()
  @SkipThrottle()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature?: string,
  ): Promise<{ received: boolean; duplicate: boolean }> {
    const raw = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    return this.webhook.handle(raw, signature);
  }
}
