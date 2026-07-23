-- CreateTable
CREATE TABLE `demands` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `reference` VARCHAR(30) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `description` TEXT NULL,
    `objectives` TEXT NULL,
    `justification` TEXT NULL,
    `requester_id` CHAR(36) NOT NULL,
    `department` VARCHAR(120) NULL,
    `priority` INTEGER NOT NULL DEFAULT 3,
    `urgency` ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
    `estimated_budget` DECIMAL(14, 2) NULL,
    `estimated_duration_days` INTEGER NULL,
    `target_portfolio_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `demands_organization_id_deleted_at_idx`(`organization_id`, `deleted_at`),
    INDEX `demands_organization_id_target_portfolio_id_idx`(`organization_id`, `target_portfolio_id`),
    UNIQUE INDEX `demands_organization_id_reference_key`(`organization_id`, `reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `demand_tags` (
    `id` CHAR(36) NOT NULL,
    `demand_id` CHAR(36) NOT NULL,
    `label` VARCHAR(40) NOT NULL,

    INDEX `demand_tags_demand_id_idx`(`demand_id`),
    UNIQUE INDEX `demand_tags_demand_id_label_key`(`demand_id`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `demands` ADD CONSTRAINT `demands_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demands` ADD CONSTRAINT `demands_requester_id_fkey` FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demands` ADD CONSTRAINT `demands_target_portfolio_id_fkey` FOREIGN KEY (`target_portfolio_id`) REFERENCES `portfolios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demand_tags` ADD CONSTRAINT `demand_tags_demand_id_fkey` FOREIGN KEY (`demand_id`) REFERENCES `demands`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
