import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { RateUnit, ResourceType } from "@openppm/db";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from "class-validator";

export class RateDto {
  @ApiProperty({ example: 650 })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ enum: Object.values(RateUnit), example: RateUnit.DAY })
  @IsIn(Object.values(RateUnit))
  unit!: RateUnit;

  @ApiPropertyOptional({ example: "EUR", default: "EUR" })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}

export class CreateResourceDto {
  @ApiProperty({ example: "Jean" })
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty({ example: "Dupont" })
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @ApiProperty({ enum: Object.values(ResourceType), default: ResourceType.CONTRACTOR })
  @IsIn(Object.values(ResourceType))
  resourceType!: ResourceType;

  @ApiPropertyOptional({ example: "ABC Consulting" })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(190)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string;

  @ApiPropertyOptional({ type: RateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RateDto)
  rate?: RateDto;
}

export class UpdateResourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 80)
  lastName?: string;

  @ApiPropertyOptional({ enum: Object.values(ResourceType) })
  @IsOptional()
  @IsIn(Object.values(ResourceType))
  resourceType?: ResourceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(190)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class SetRateDto extends RateDto {}

export class AssignResourceDto {
  @ApiProperty()
  @IsUUID()
  resourceId!: string;
}

export class ListResourcesQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: Object.values(ResourceType) })
  @IsOptional()
  @IsIn(Object.values(ResourceType))
  resourceType?: ResourceType;

  @ApiPropertyOptional({ description: "true = actives, false = archivées" })
  @IsOptional()
  @Transform(({ value }) => (value === "true" ? true : value === "false" ? false : value))
  @IsBoolean()
  active?: boolean;
}
