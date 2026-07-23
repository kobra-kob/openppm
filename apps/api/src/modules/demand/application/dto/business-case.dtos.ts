import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { RiskLevel } from "@openppm/db";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from "class-validator";

export class BusinessCaseRiskDto {
  @Length(1, 200)
  label!: string;

  @ApiPropertyOptional({ enum: Object.values(RiskLevel), default: RiskLevel.medium })
  @IsOptional()
  @IsIn(Object.values(RiskLevel))
  probability?: RiskLevel;

  @ApiPropertyOptional({ enum: Object.values(RiskLevel), default: RiskLevel.medium })
  @IsOptional()
  @IsIn(Object.values(RiskLevel))
  impact?: RiskLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mitigation?: string;
}

/** Création ou mise à jour du Business Case (upsert : les risques sont remplacés). */
export class UpsertBusinessCaseDto {
  @ApiPropertyOptional({ description: "Retour sur investissement attendu" })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  roi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  costs?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  benefits?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  assumptions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  resources?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  dependencies?: string;

  @ApiPropertyOptional({ description: "Début prévisionnel (ISO 8601)" })
  @IsOptional()
  @IsISO8601()
  plannedStartDate?: string;

  @ApiPropertyOptional({ description: "Fin prévisionnelle (ISO 8601)" })
  @IsOptional()
  @IsISO8601()
  plannedEndDate?: string;

  @ApiProperty({ type: [BusinessCaseRiskDto], required: false, default: [] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BusinessCaseRiskDto)
  risks?: BusinessCaseRiskDto[];
}
