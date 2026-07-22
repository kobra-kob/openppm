-- CreateTable
CREATE TABLE `budget_requests` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `project_id` CHAR(36) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `capex_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `opex_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `justification` TEXT NULL,
    `status` ENUM('draft', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `current_step` INTEGER NOT NULL DEFAULT 0,
    `requested_by_id` CHAR(36) NOT NULL,
    `decided_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `budget_requests_project_id_status_idx`(`project_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `approval_steps` (
    `id` CHAR(36) NOT NULL,
    `budget_request_id` CHAR(36) NOT NULL,
    `step_order` INTEGER NOT NULL,
    `approver_role` ENUM('admin', 'manager', 'project_manager', 'pmo', 'finance', 'employee', 'observer', 'guest') NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `decided_by_id` CHAR(36) NULL,
    `comment` VARCHAR(500) NULL,
    `decided_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `approval_steps_budget_request_id_step_order_idx`(`budget_request_id`, `step_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `budget_requests` ADD CONSTRAINT `budget_requests_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_requests` ADD CONSTRAINT `budget_requests_requested_by_id_fkey` FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approval_steps` ADD CONSTRAINT `approval_steps_budget_request_id_fkey` FOREIGN KEY (`budget_request_id`) REFERENCES `budget_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approval_steps` ADD CONSTRAINT `approval_steps_decided_by_id_fkey` FOREIGN KEY (`decided_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
