import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

/** Mise à jour des règles de gouvernance de l'organisation (admin). */
export class UpdateGovernanceDto {
  @ApiProperty({
    example: true,
    description:
      "Active la règle : au-delà de 100 k€ → comité ; en dessous → Finance suffit. Désactivée : comité par défaut.",
  })
  @IsBoolean()
  committeeRuleEnabled!: boolean;
}
