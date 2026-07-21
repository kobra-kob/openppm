-- AlterTable
ALTER TABLE `projects` ADD COLUMN `portfolio_id` CHAR(36) NULL;

-- CreateTable
CREATE TABLE `portfolios` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `name` VARCHAR(140) NOT NULL,
    `description` TEXT NULL,
    `owner_id` CHAR(36) NULL,
    `budget_envelope` DECIMAL(16, 2) NULL,
    `status` ENUM('active', 'archived') NOT NULL DEFAULT 'active',
    `created_by_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `portfolios_organization_id_deleted_at_idx`(`organization_id`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `projects_organization_id_portfolio_id_idx` ON `projects`(`organization_id`, `portfolio_id`);

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_portfolio_id_fkey` FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `portfolios` ADD CONSTRAINT `portfolios_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
