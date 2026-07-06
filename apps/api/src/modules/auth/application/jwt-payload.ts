/** Contenu du JWT d'accès. `org` = organization_id (tenant). */
export interface JwtPayload {
  sub: string;
  email: string;
  org: string;
  roles: string[];
  name: string;
  iat?: number;
  exp?: number;
}
