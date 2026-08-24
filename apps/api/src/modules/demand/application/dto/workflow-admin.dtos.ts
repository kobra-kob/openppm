import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsBoolean, IsString } from "class-validator";

/** Reconfiguration de la gouvernance d'une transition (rôles + commentaire requis). */
export class UpdateTransitionGovernanceDto {
  @ApiProperty({
    description: "Rôles habilités à franchir la transition (vide = aucune restriction de rôle)",
    example: ["manager", "pmo"],
    isArray: true,
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  allowedRoles!: string[];

  @ApiProperty({ description: "Exiger un commentaire lors du franchissement" })
  @IsBoolean()
  requiresComment!: boolean;
}
