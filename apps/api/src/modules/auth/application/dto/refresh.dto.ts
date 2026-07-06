import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class RefreshDto {
  @ApiPropertyOptional({
    description:
      "Refresh token. Optionnel : le cookie httpOnly est utilisé s'il est absent.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  refreshToken?: string;
}
