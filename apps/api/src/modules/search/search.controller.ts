import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";
import type { JwtPayload } from "../auth/application/jwt-payload";
import { CurrentUser } from "../auth/infrastructure/decorators/current-user.decorator";
import { SearchResults, SearchService } from "./search.service";

class SearchQuery {
  @IsString()
  @Length(2, 100)
  q!: string;
}

@ApiTags("search")
@ApiBearerAuth()
@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @ApiOperation({ summary: "Recherche globale : projets et tâches (min 2 caractères)" })
  global(
    @CurrentUser() user: JwtPayload,
    @Query() query: SearchQuery,
  ): Promise<SearchResults> {
    return this.search.global(user, query.q);
  }
}
