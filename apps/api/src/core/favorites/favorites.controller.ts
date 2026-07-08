import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { JwtPayload } from "../../modules/auth/application/jwt-payload";
import { CurrentUser } from "../../modules/auth/infrastructure/decorators/current-user.decorator";
import { FavoritesService, FavoriteView } from "./favorites.service";

@ApiTags("favorites")
@ApiBearerAuth()
@Controller("favorites")
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: "Favoris de l'utilisateur courant (projets)" })
  list(@CurrentUser() user: JwtPayload): Promise<FavoriteView[]> {
    return this.favorites.list(user.sub, user.org);
  }

  @Put("project/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Ajouter un projet aux favoris (idempotent)" })
  async add(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.favorites.add(user.sub, user.org, "project", id);
  }

  @Delete("project/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Retirer un projet des favoris" })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.favorites.remove(user.sub, "project", id);
  }
}
