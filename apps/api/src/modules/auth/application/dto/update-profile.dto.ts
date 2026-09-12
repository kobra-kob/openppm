import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

/** Modification de son identité (prénom / nom) depuis la page Compte. */
export class UpdateProfileDto {
  @ApiProperty({ example: "Marie", minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty({ example: "Leroy", minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  lastName!: string;
}
