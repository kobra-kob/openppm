import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

/** Changement d'organisation courante (tenant switch). */
export class SwitchOrganizationDto {
  @ApiProperty({ description: "Organisation cible (doit être un membership actif du compte)" })
  @IsUUID()
  organizationId!: string;
}
