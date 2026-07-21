import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { PortfolioStatus } from "@openppm/db";
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
} from "class-validator";

export class CreatePortfolioDto {
  @ApiProperty({ example: "Transformation digitale", minLength: 2, maxLength: 140 })
  @IsString()
  @Length(2, 140)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @ApiPropertyOptional({ description: "Responsable du portefeuille (membre de l'org)" })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ description: "Enveloppe budgétaire totale (€)" })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  budgetEnvelope?: number;
}

export class UpdatePortfolioDto extends PartialType(CreatePortfolioDto) {
  @ApiPropertyOptional({ enum: Object.values(PortfolioStatus) })
  @IsOptional()
  @IsIn(Object.values(PortfolioStatus))
  status?: PortfolioStatus;
}

export class AttachProjectDto {
  @ApiProperty()
  @IsUUID()
  projectId!: string;
}
