import { Module } from "@nestjs/common";
import { TasksService } from "./application/tasks.service";
import { TASK_REPOSITORY } from "./domain/task.repository";
import { PrismaTaskRepository } from "./infrastructure/prisma-task.repository";
import { MyTasksController } from "./presentation/my-tasks.controller";
import { TasksController } from "./presentation/tasks.controller";

@Module({
  controllers: [TasksController, MyTasksController],
  providers: [
    TasksService,
    { provide: TASK_REPOSITORY, useClass: PrismaTaskRepository },
  ],
  exports: [TasksService],
})
export class TaskModule {}
