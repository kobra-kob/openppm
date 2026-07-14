import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { JwtPayload } from "../../auth/application/jwt-payload";
import { CurrentUser } from "../../auth/infrastructure/decorators/current-user.decorator";
import { MyTaskView, TasksService } from "../application/tasks.service";

@ApiTags("tasks")
@ApiBearerAuth()
@Controller("me")
export class MyTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get("tasks")
  @ApiOperation({
    summary: "Mes tâches ouvertes (tous projets, triées par échéance puis priorité)",
  })
  myTasks(@CurrentUser() user: JwtPayload): Promise<MyTaskView[]> {
    return this.tasks.myTasks(user);
  }
}
