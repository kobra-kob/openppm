import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../../domain/password.policy";

export class RegisterDto {
  @ApiProperty({ example: "ACME SAS", minLength: 2, maxLength: 120 })
  @IsString()
  @Length(2, 120)
  organizationName!: string;

  @ApiProperty({ example: "Marie" })
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty({ example: "Leroy" })
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @ApiProperty({ example: "marie@acme.fr" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(190)
  email!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  password!: string;

  @ApiPropertyOptional({ enum: ["fr", "en", "es", "de"], default: "fr" })
  @IsOptional()
  @IsIn(["fr", "en", "es", "de"])
  locale?: string;
}
