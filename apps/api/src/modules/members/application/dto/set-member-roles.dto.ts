import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsUUID } from "class-validator";

/** Remplace intégralement les rôles d'un membre (rôles cumulables). */
export class SetMemberRolesDto {
  @ApiProperty({ type: [String], description: "Identifiants des rôles à attribuer" })
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID("all", { each: true })
  roleIds!: string[];
}
