import { Module } from "@nestjs/common";
import { TasksService } from "./application/tasks.service";
import { TASK_REPOSITORY } from "./domain/task.repository";
import { PrismaTaskRepository } from "./infrastructure/prisma-task.repository";
import { TasksController } from "./presentation/tasks.controller";

@Module({
  controllers: [TasksController],
  providers: [
    TasksService,
    { provide: TASK_REPOSITORY, useClass: PrismaTaskRepository },
  ],
  exports: [TasksService],
})
export class TaskModule {}
