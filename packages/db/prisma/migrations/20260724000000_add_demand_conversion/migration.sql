-- DropForeignKey
ALTER TABLE `documents` DROP FOREIGN KEY `documents_project_id_fkey`;

-- AlterTable
ALTER TABLE `documents` ADD COLUMN `demand_id` CHAR(36) NULL,
    MODIFY `project_id` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `allow_direct_project_creation` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `projects` ADD COLUMN `demand_id` CHAR(36) NULL;

-- CreateTable
CREATE TABLE `risks` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `project_id` CHAR(36) NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `probability` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
    `impact` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
    `severity` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
    `mitigation` TEXT NULL,
    `owner_id` CHAR(36) NULL,
    `status` ENUM('open', 'mitigated', 'closed') NOT NULL DEFAULT 'open',
    `source_business_case_risk_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `risks_organization_id_project_id_idx`(`organization_id`, `project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `documents_demand_id_idx` ON `documents`(`demand_id`);

-- CreateIndex
CREATE UNIQUE INDEX `projects_demand_id_key` ON `projects`(`demand_id`);

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_demand_id_fkey` FOREIGN KEY (`demand_id`) REFERENCES `demands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_demand_id_fkey` FOREIGN KEY (`demand_id`) REFERENCES `demands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `risks` ADD CONSTRAINT `risks_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `risks` ADD CONSTRAINT `risks_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `risks` ADD CONSTRAINT `risks_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

