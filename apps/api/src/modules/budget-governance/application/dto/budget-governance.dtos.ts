import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CreateBudgetRequestDto {
  @ApiProperty({ example: 120000, description: "Montant CAPEX (€)" })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  capexAmount!: number;

  @ApiProperty({ example: 40000, description: "Montant OPEX (€)" })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  opexAmount!: number;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  justification?: string;
}

export class DecideStepDto {
  @ApiProperty({ description: "true = approuver, false = refuser" })
  @IsBoolean()
  approve!: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
