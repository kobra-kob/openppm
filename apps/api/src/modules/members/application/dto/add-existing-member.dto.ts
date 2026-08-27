import { ApiProperty } from "@nestjs/swagger";
import { RoleKey } from "@openppm/db";
import { Transform } from "class-transformer";
import { IsEmail, IsIn, MaxLength } from "class-validator";

/** Ajoute un compte OpenPPM **existant** à l'organisation courante (multi-org). */
export class AddExistingMemberDto {
  @ApiProperty({ example: "collegue@acme.fr" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(190)
  email!: string;

  @ApiProperty({ enum: Object.values(RoleKey), example: RoleKey.employee })
  @IsIn(Object.values(RoleKey))
  roleKey!: RoleKey;
}
