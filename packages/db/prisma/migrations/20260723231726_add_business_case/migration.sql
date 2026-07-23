-- CreateTable
CREATE TABLE `business_cases` (
    `id` CHAR(36) NOT NULL,
    `demand_id` CHAR(36) NOT NULL,
    `roi` TEXT NULL,
    `costs` TEXT NULL,
    `benefits` TEXT NULL,
    `assumptions` TEXT NULL,
    `resources` TEXT NULL,
    `dependencies` TEXT NULL,
    `planned_start_date` DATE NULL,
    `planned_end_date` DATE NULL,
    `created_by_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `business_cases_demand_id_key`(`demand_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_case_risks` (
    `id` CHAR(36) NOT NULL,
    `business_case_id` CHAR(36) NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `probability` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
    `impact` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
    `mitigation` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `business_case_risks_business_case_id_idx`(`business_case_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `business_cases` ADD CONSTRAINT `business_cases_demand_id_fkey` FOREIGN KEY (`demand_id`) REFERENCES `demands`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_cases` ADD CONSTRAINT `business_cases_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `business_case_risks` ADD CONSTRAINT `business_case_risks_business_case_id_fkey` FOREIGN KEY (`business_case_id`) REFERENCES `business_cases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
