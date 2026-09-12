import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../core/prisma/prisma.service";
import {
  OrganizationProfile,
  OrganizationRepository,
  UpdateOrganizationInput,
} from "../domain/organization.repository";

const PROFILE_SELECT = {
  id: true,
  name: true,
  slug: true,
  plan: true,
  country: true,
  address: true,
  vatNumber: true,
  logoUrl: true,
} as const;

@Injectable()
export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProfile(organizationId: string): Promise<OrganizationProfile | null> {
    return this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: PROFILE_SELECT,
    });
  }

  updateProfile(
    organizationId: string,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationProfile> {
    return this.prisma.organization.update({
      where: { id: organizationId },
      // Les clés absentes (undefined) ne sont pas modifiées par Prisma.
      data: {
        name: input.name,
        country: input.country,
        address: input.address,
        vatNumber: input.vatNumber,
        logoUrl: input.logoUrl,
      },
      select: PROFILE_SELECT,
    });
  }
}
