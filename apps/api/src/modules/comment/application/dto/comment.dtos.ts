import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsString, IsUUID, Length } from "class-validator";

export class CreateCommentDto {
  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @IsString()
  @Length(1, 5000)
  body!: string;

  @ApiPropertyOptional({
    type: [String],
    description: "Identifiants des membres mentionnés (@)",
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  mentions: string[] = [];
}
