import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../../../core/audit/audit.service";
import type { RequestContext } from "../../auth/application/token.service";
import {
  ORGANIZATION_REPOSITORY,
  OrganizationProfile,
} from "../domain/organization.repository";
import type { OrganizationRepository } from "../domain/organization.repository";
import type { UpdateOrganizationDto } from "./dto/update-organization.dto";

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly repository: OrganizationRepository,
    private readonly audit: AuditService,
  ) {}

  async getProfile(organizationId: string): Promise<OrganizationProfile> {
    const profile = await this.repository.findProfile(organizationId);
    if (!profile) {
      throw new NotFoundException({
        code: "ORGANIZATION_NOT_FOUND",
        message: "Organisation introuvable",
      });
    }
    return profile;
  }

  /**
   * Met à jour le profil de l'organisation (nom + coordonnées société).
   * Le slug reste immuable : c'est un identifiant stable de l'espace de travail.
   */
  async updateProfile(
    organizationId: string,
    userId: string,
    dto: UpdateOrganizationDto,
    context: RequestContext,
  ): Promise<OrganizationProfile> {
    const before = await this.getProfile(organizationId);
    const profile = await this.repository.updateProfile(organizationId, {
      name: dto.name,
      country: dto.country,
      address: dto.address,
      vatNumber: dto.vatNumber,
      logoUrl: dto.logoUrl,
    });
    await this.audit.log({
      action: "organization.profile_updated",
      entityType: "organization",
      entityId: organizationId,
      organizationId,
      userId,
      before: {
        name: before.name,
        country: before.country,
        address: before.address,
        vatNumber: before.vatNumber,
        logoUrl: before.logoUrl,
      },
      after: {
        name: profile.name,
        country: profile.country,
        address: profile.address,
        vatNumber: profile.vatNumber,
        logoUrl: profile.logoUrl,
      },
      ...context,
    });
    return profile;
  }
}
