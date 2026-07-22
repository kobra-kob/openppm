import { BudgetCategory } from "@openppm/db";
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class SetLaborRateDto {
  /** Taux horaire en euros ; null/absent efface la valorisation du temps. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  laborRate?: number | null;
}

export class CreateBudgetLineDto {
  @IsEnum(BudgetCategory)
  category!: BudgetCategory;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  label!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  plannedAmount!: number;
}

export class UpdateBudgetLineDto {
  @IsOptional()
  @IsEnum(BudgetCategory)
  category?: BudgetCategory;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  label?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  plannedAmount?: number;
}

export class CreateCostEntryDto {
  @IsEnum(BudgetCategory)
  category!: BudgetCategory;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  label!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsDateString()
  incurredOn!: string;

  @IsOptional()
  @IsString()
  budgetLineId?: string | null;
}
