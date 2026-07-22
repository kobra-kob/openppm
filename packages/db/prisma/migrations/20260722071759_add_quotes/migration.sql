-- CreateTable
CREATE TABLE `quotes` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `project_id` CHAR(36) NOT NULL,
    `reference` VARCHAR(30) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `customer_name` VARCHAR(160) NULL,
    `status` ENUM('draft', 'submitted', 'reviewed', 'approved', 'rejected') NOT NULL DEFAULT 'draft',
    `revision` INTEGER NOT NULL DEFAULT 1,
    `vat_rate` DECIMAL(5, 2) NOT NULL DEFAULT 20,
    `valid_until` DATE NULL,
    `notes` TEXT NULL,
    `created_by_id` CHAR(36) NOT NULL,
    `submitted_at` DATETIME(3) NULL,
    `reviewed_by_id` CHAR(36) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `approved_by_id` CHAR(36) NULL,
    `approved_at` DATETIME(3) NULL,
    `decision_comment` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `quotes_project_id_status_idx`(`project_id`, `status`),
    UNIQUE INDEX `quotes_organization_id_reference_key`(`organization_id`, `reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quote_lines` (
    `id` CHAR(36) NOT NULL,
    `quote_id` CHAR(36) NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `quantity` DECIMAL(10, 2) NOT NULL DEFAULT 1,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `discount_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `quote_lines_quote_id_position_idx`(`quote_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quote_lines` ADD CONSTRAINT `quote_lines_quote_id_fkey` FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
