import { ApiPropertyOptional } from "@nestjs/swagger";
import { DemandUrgency } from "@openppm/db";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateDemandDto {
  /*
   * Pas de champ `reference` : le numéro (DEMDxxxxx) est attribué
   * automatiquement par le serveur et n'est ni saisissable ni modifiable.
   */

  @Length(2, 160)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ description: "Objectifs visés par la demande" })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  objectives?: string;

  @ApiPropertyOptional({ description: "Justification métier" })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  justification?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @ApiPropertyOptional({ description: "1 (haute) à 5 (basse)", default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

  @ApiPropertyOptional({ enum: Object.values(DemandUrgency) })
  @IsOptional()
  @IsIn(Object.values(DemandUrgency))
  urgency?: DemandUrgency;

  @ApiPropertyOptional({ description: "Budget estimé (€)" })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedBudget?: number;

  @ApiPropertyOptional({ description: "Durée estimée en jours" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedDurationDays?: number;

  @ApiPropertyOptional({ description: "Portefeuille visé" })
  @IsOptional()
  @IsUUID()
  targetPortfolioId?: string;

  @ApiPropertyOptional({ type: [String], description: "Étiquettes libres" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? [...new Set(value.map((tag: string) => String(tag).trim()).filter(Boolean))]
      : value,
  )
  tags?: string[];
}

export class UpdateDemandDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Length(2, 160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  objectives?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  justification?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

  @ApiPropertyOptional({ enum: Object.values(DemandUrgency) })
  @IsOptional()
  @IsIn(Object.values(DemandUrgency))
  urgency?: DemandUrgency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedBudget?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedDurationDays?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  targetPortfolioId?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? [...new Set(value.map((tag: string) => String(tag).trim()).filter(Boolean))]
      : value,
  )
  tags?: string[];
}

export class TransitionDemandDto {
  @ApiPropertyOptional({ description: "Commentaire (obligatoire pour certaines transitions)" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ListDemandsQuery {
  @ApiPropertyOptional({
    enum: ["mine", "all"],
    default: "all",
    description: "mine = demandes que j'ai émises",
  })
  @IsOptional()
  @IsIn(["mine", "all"])
  scope?: "mine" | "all";

  @ApiPropertyOptional({ description: "Recherche sur le titre, le numéro et la description" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  targetPortfolioId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
