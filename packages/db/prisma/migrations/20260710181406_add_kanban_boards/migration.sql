-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `board_column_id` CHAR(36) NULL,
    ADD COLUMN `board_rank` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `boards` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `project_id` CHAR(36) NOT NULL,
    `name` VARCHAR(80) NOT NULL DEFAULT 'Board',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `boards_project_id_key`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `board_columns` (
    `id` CHAR(36) NOT NULL,
    `board_id` CHAR(36) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `wip_limit` INTEGER NULL,
    `maps_to_status` ENUM('todo', 'in_progress', 'done', 'cancelled') NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `board_columns_board_id_position_idx`(`board_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_board_column_id_fkey` FOREIGN KEY (`board_column_id`) REFERENCES `board_columns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `boards` ADD CONSTRAINT `boards_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `board_columns` ADD CONSTRAINT `board_columns_board_id_fkey` FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
