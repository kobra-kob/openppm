import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length, MaxLength } from "class-validator";
import { PASSWORD_MAX_LENGTH } from "../../domain/password.policy";

export class EnableMfaDto {
  @ApiProperty({ description: "Code TOTP à 6 chiffres", example: "123456" })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class DisableMfaDto {
  @ApiProperty({ description: "Mot de passe actuel" })
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  @ApiProperty({ description: "Code TOTP à 6 chiffres" })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class VerifyMfaDto {
  @ApiProperty({ description: "Jeton de défi renvoyé par /auth/login" })
  @IsString()
  @MaxLength(1024)
  mfaToken!: string;

  @ApiProperty({
    description: "Code TOTP à 6 chiffres, ou code de récupération",
    example: "123456",
  })
  @IsString()
  @Length(6, 32)
  code!: string;
}
