import { ApiProperty } from "@nestjs/swagger";
import { RoleKey } from "@openppm/db";
import { Transform } from "class-transformer";
import { IsEmail, IsIn, MaxLength } from "class-validator";

export class InviteMemberDto {
  @ApiProperty({ example: "collegue@acme.fr" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(190)
  email!: string;

  @ApiProperty({ enum: Object.values(RoleKey), example: RoleKey.employee })
  @IsIn(Object.values(RoleKey))
  roleKey!: RoleKey;
}
