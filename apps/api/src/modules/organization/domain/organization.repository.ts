/** Profil public d'une organisation (page Paramètres → Organisation). */
export interface OrganizationProfile {
  id: string;
  name: string;
  slug: string;
  plan: string;
  country: string | null;
  address: string | null;
  vatNumber: string | null;
  logoUrl: string | null;
}

/** Champs modifiables du profil (undefined = inchangé). */
export interface UpdateOrganizationInput {
  name?: string;
  country?: string | null;
  address?: string | null;
  vatNumber?: string | null;
  logoUrl?: string | null;
}

/**
 * Port de persistance du module organisation : l'application ne connaît que
 * cette interface, Prisma reste confiné dans l'infrastructure.
 */
export interface OrganizationRepository {
  findProfile(organizationId: string): Promise<OrganizationProfile | null>;
  updateProfile(
    organizationId: string,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationProfile>;
}

export const ORGANIZATION_REPOSITORY = Symbol("ORGANIZATION_REPOSITORY");
