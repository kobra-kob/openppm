import { Body, Controller, Get, Param, Patch, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import type { RequestContext } from "../../auth/application/token.service";
import { P } from "../../auth/domain/permissions";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { RequirePermissions } from "../../auth/infrastructure/decorators/require-permissions.decorator";
import type { WorkflowDefinitionRecord } from "../../workflow/domain/workflow.repository";
import { WorkflowService } from "../../workflow/application/workflow.service";
import { DEFAULT_DEMAND_WORKFLOW } from "../domain/demand-workflow";
import { UpdateTransitionGovernanceDto } from "../application/dto/workflow-admin.dtos";

/**
 * Administration des workflows (§19) — réservée à WORKFLOW_MANAGE (admin).
 * Permet de reconfigurer *qui* valide *quoi* à chaque étape, sans altérer le
 * graphe d'états ni les automatisations : les instances en cours restent saines.
 */
@ApiTags("workflows")
@ApiBearerAuth()
@Controller("workflows")
@RequirePermissions(P.WORKFLOW_MANAGE)
export class WorkflowAdminController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get()
  @ApiOperation({ summary: "Lister les définitions de workflow de l'organisation" })
  async list(@CurrentUser() user: JwtPayload): Promise<WorkflowDefinitionRecord[]> {
    // Garantit la présence du circuit des demandes, même sans demande créée.
    await this.workflow.ensureDefinition(user.org, DEFAULT_DEMAND_WORKFLOW);
    return this.workflow.listDefinitions(user);
  }

  @Patch(":key/transitions/:transitionKey")
  @ApiOperation({ summary: "Reconfigurer les rôles et le commentaire d'une transition" })
  updateTransition(
    @CurrentUser() user: JwtPayload,
    @Param("key") key: string,
    @Param("transitionKey") transitionKey: string,
    @Body() dto: UpdateTransitionGovernanceDto,
    @Req() request: Request,
  ): Promise<WorkflowDefinitionRecord> {
    return this.workflow.updateTransition(
      user,
      key,
      transitionKey,
      { allowedRoles: dto.allowedRoles, requiresComment: dto.requiresComment },
      this.context(request),
    );
  }

  private context(request: Request): RequestContext {
    return { ip: request.ip, userAgent: request.headers["user-agent"] };
  }
}
