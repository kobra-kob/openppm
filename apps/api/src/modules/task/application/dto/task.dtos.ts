import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from "@nestjs/swagger";
import { TaskStatus } from "@openppm/db";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateTaskDto {
  @ApiProperty({ example: "Spécifier l'API paiement", minLength: 1, maxLength: 200 })
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiPropertyOptional({ description: "Tâche parente (sous-tâche)" })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

  @ApiPropertyOptional({ example: "2026-11-02" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: "2026-11-20" })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 16 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999)
  estimateHours?: number;

  @ApiPropertyOptional({ type: [String], description: "Assignés initiaux (membres du projet)" })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  assigneeIds?: string[];
}

export class UpdateTaskDto extends PartialType(
  PickType(CreateTaskDto, [
    "title",
    "description",
    "priority",
    "startDate",
    "dueDate",
    "estimateHours",
  ] as const),
) {}

export class ChangeTaskStatusDto {
  @ApiProperty({ enum: Object.values(TaskStatus) })
  @IsIn(Object.values(TaskStatus))
  status!: TaskStatus;
}

export class TaskAssigneeDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;
}

export class CreateChecklistItemDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @Length(1, 300)
  label!: string;
}

export class UpdateChecklistItemDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @Length(1, 300)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDone?: boolean;
}

export class AddDependencyDto {
  @ApiProperty({ description: "Tâche prérequise (fin → début)" })
  @IsUUID()
  predecessorId!: string;
}

export class LogTimeDto {
  @ApiProperty({ example: "2026-11-05" })
  @IsDateString()
  spentOn!: string;

  @ApiProperty({ example: 3.5, minimum: 0.25, maximum: 24 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.25)
  @Max(24)
  hours!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
