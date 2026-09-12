import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsString, Length, MaxLength } from "class-validator";

/** Vide → null : permet d'effacer un champ optionnel depuis le formulaire. */
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === "string" && value.trim() === "" ? null : value;

/** Mise à jour du profil de l'organisation (admin). Tous les champs sont optionnels. */
export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: "ACME SAS", minLength: 2, maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional({ example: "FR", description: "Code pays ISO 3166-1 alpha-2" })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string | null;

  @ApiPropertyOptional({ example: "12 rue de la Paix, 75002 Paris" })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @ApiPropertyOptional({ example: "FR12345678901" })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  vatNumber?: string | null;

  @ApiPropertyOptional({ example: "https://cdn.acme.fr/logo.png" })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;
}
