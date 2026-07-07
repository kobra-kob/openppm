import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../../domain/password.policy";

export class AcceptInvitationDto {
  @ApiProperty({ description: "Jeton reçu par email" })
  @IsString()
  @MaxLength(255)
  token!: string;

  @ApiProperty({ example: "Jean" })
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty({ example: "Dupont" })
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  password!: string;

  @ApiPropertyOptional({ enum: ["fr", "en", "es", "de"], default: "fr" })
  @IsOptional()
  @IsIn(["fr", "en", "es", "de"])
  locale?: string;
}
