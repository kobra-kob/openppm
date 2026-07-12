import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TaskStatus } from "@openppm/db";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from "class-validator";

export class CreateColumnDto {
  @ApiProperty({ example: "Revue", minLength: 1, maxLength: 60 })
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 99, description: "Limite WIP indicative" })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  wipLimit?: number;

  @ApiPropertyOptional({
    enum: Object.values(TaskStatus),
    description: "Statut appliqué aux cartes déposées ici",
  })
  @IsOptional()
  @IsIn(Object.values(TaskStatus))
  mapsToStatus?: TaskStatus;
}

export class UpdateColumnDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 60 })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 99, nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  wipLimit?: number | null;

  @ApiPropertyOptional({ enum: Object.values(TaskStatus), nullable: true })
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsIn(Object.values(TaskStatus))
  mapsToStatus?: TaskStatus | null;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;
}

export class MoveCardDto {
  @ApiProperty()
  @IsUUID()
  taskId!: string;

  @ApiProperty()
  @IsUUID()
  columnId!: string;

  @ApiProperty({ minimum: 0, description: "Index cible dans la colonne (0 = en haut)" })
  @IsInt()
  @Min(0)
  position!: number;
}
