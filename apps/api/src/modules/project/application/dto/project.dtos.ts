import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from "@nestjs/swagger";
import { ProjectHealth, ProjectRole, ProjectStatus } from "@openppm/db";
import { Transform } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateProjectDto {
  @ApiProperty({ example: "Refonte CRM", minLength: 2, maxLength: 140 })
  @IsString()
  @Length(2, 140)
  name!: string;

  @ApiPropertyOptional({
    description: "Code unique (généré automatiquement si absent)",
    example: "CRM-2026",
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9][A-Z0-9-]{1,19}$/, {
    message: "code: 2 à 20 caractères alphanumériques majuscules ou tirets",
  })
  code?: string;

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

  @ApiPropertyOptional({ example: "2026-09-01" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: "2027-03-31" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "Chef de projet (membre de l'organisation)" })
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional({ description: "Catégorie du projet" })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: "Template appliqué : ses valeurs par défaut complètent les champs absents",
  })
  @IsOptional()
  @IsUUID()
  templateId?: string;
}

export class UpdateProjectDto extends PartialType(
  PickType(CreateProjectDto, [
    "name",
    "description",
    "priority",
    "startDate",
    "endDate",
    "managerId",
    "categoryId",
  ] as const),
) {
  @ApiPropertyOptional({ enum: Object.values(ProjectHealth) })
  @IsOptional()
  @IsIn(Object.values(ProjectHealth))
  health?: ProjectHealth;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: Object.values(ProjectStatus) })
  @IsIn(Object.values(ProjectStatus))
  status!: ProjectStatus;
}

export class AddProjectMemberDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ enum: Object.values(ProjectRole), default: ProjectRole.member })
  @IsOptional()
  @IsIn(Object.values(ProjectRole))
  role?: ProjectRole;
}

export class UpdateProjectMemberDto {
  @ApiProperty({ enum: Object.values(ProjectRole) })
  @IsIn(Object.values(ProjectRole))
  role!: ProjectRole;
}

export class ListProjectsQuery {
  @ApiPropertyOptional({ enum: Object.values(ProjectStatus) })
  @IsOptional()
  @IsIn(Object.values(ProjectStatus))
  status?: ProjectStatus;

  @ApiPropertyOptional({ description: "Recherche sur le nom et le code" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: "Filtre par catégorie" })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    enum: ["mine", "all"],
    default: "all",
    description: "mine = projets dont je suis membre, chef de projet ou créateur",
  })
  @IsOptional()
  @IsIn(["mine", "all"])
  scope?: "mine" | "all";

  @ApiPropertyOptional({ enum: ["recent", "priority"], default: "priority" })
  @IsOptional()
  @IsIn(["recent", "priority"])
  sort?: "recent" | "priority";

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
