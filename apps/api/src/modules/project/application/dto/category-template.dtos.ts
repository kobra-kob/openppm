import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateCategoryDto {
  @ApiProperty({ example: "Digital", minLength: 1, maxLength: 60 })
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiPropertyOptional({ example: "#0071e3", description: "Couleur hexadécimale" })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "color: format attendu #rrggbb" })
  color?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CreateTemplateDto {
  @ApiProperty({ example: "Projet web standard", minLength: 2, maxLength: 140 })
  @IsString()
  @Length(2, 140)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  budget?: number;

  @ApiPropertyOptional({ description: "Durée par défaut en jours (calcule la date de fin)" })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: "Créer le template à partir d'un projet existant (copie ses valeurs)",
  })
  @IsOptional()
  @IsUUID()
  fromProjectId?: string;
}
