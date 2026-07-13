import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length, MaxLength } from "class-validator";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../../domain/password.policy";

export class ChangePasswordDto {
  @ApiProperty({ description: "Mot de passe actuel" })
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  newPassword!: string;
}
