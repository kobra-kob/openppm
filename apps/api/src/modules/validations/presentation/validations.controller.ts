import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { ValidationsService, ValidationsView } from "../application/validations.service";

@ApiTags("validations")
@ApiBearerAuth()
@Controller("me/validations")
export class ValidationsController {
  constructor(private readonly validations: ValidationsService) {}

  @Get()
  @ApiOperation({ summary: "Éléments en attente de ma décision (budgets, demandes)" })
  list(@CurrentUser() user: JwtPayload): Promise<ValidationsView> {
    return this.validations.listForUser(user);
  }
}
