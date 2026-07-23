-- CreateTable
CREATE TABLE `workflow_definitions` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `entity_type` VARCHAR(60) NOT NULL,
    `name` VARCHAR(140) NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `workflow_definitions_organization_id_entity_type_active_idx`(`organization_id`, `entity_type`, `active`),
    UNIQUE INDEX `workflow_definitions_organization_id_key_key`(`organization_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_states` (
    `id` CHAR(36) NOT NULL,
    `definition_id` CHAR(36) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `label` VARCHAR(140) NOT NULL,
    `kind` ENUM('initial', 'intermediate', 'final_ok', 'final_ko') NOT NULL DEFAULT 'intermediate',
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `workflow_states_definition_id_position_idx`(`definition_id`, `position`),
    UNIQUE INDEX `workflow_states_definition_id_key_key`(`definition_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_transitions` (
    `id` CHAR(36) NOT NULL,
    `definition_id` CHAR(36) NOT NULL,
    `from_state_id` CHAR(36) NOT NULL,
    `to_state_id` CHAR(36) NOT NULL,
    `key` VARCHAR(60) NOT NULL,
    `label` VARCHAR(140) NOT NULL,
    `allowed_roles` JSON NULL,
    `requires_comment` BOOLEAN NOT NULL DEFAULT false,
    `auto_action` JSON NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `workflow_transitions_definition_id_from_state_id_position_idx`(`definition_id`, `from_state_id`, `position`),
    UNIQUE INDEX `workflow_transitions_definition_id_key_key`(`definition_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_instances` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `definition_id` CHAR(36) NOT NULL,
    `entity_type` VARCHAR(60) NOT NULL,
    `entity_id` CHAR(36) NOT NULL,
    `current_state_id` CHAR(36) NOT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closed_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `workflow_instances_organization_id_entity_type_idx`(`organization_id`, `entity_type`),
    UNIQUE INDEX `workflow_instances_entity_type_entity_id_key`(`entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_transition_logs` (
    `id` CHAR(36) NOT NULL,
    `instance_id` CHAR(36) NOT NULL,
    `transition_key` VARCHAR(60) NULL,
    `from_state_key` VARCHAR(60) NULL,
    `to_state_key` VARCHAR(60) NOT NULL,
    `actor_id` CHAR(36) NULL,
    `comment` VARCHAR(1000) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workflow_transition_logs_instance_id_created_at_idx`(`instance_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `workflow_definitions` ADD CONSTRAINT `workflow_definitions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_states` ADD CONSTRAINT `workflow_states_definition_id_fkey` FOREIGN KEY (`definition_id`) REFERENCES `workflow_definitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_transitions` ADD CONSTRAINT `workflow_transitions_definition_id_fkey` FOREIGN KEY (`definition_id`) REFERENCES `workflow_definitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_transitions` ADD CONSTRAINT `workflow_transitions_from_state_id_fkey` FOREIGN KEY (`from_state_id`) REFERENCES `workflow_states`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_transitions` ADD CONSTRAINT `workflow_transitions_to_state_id_fkey` FOREIGN KEY (`to_state_id`) REFERENCES `workflow_states`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_instances` ADD CONSTRAINT `workflow_instances_definition_id_fkey` FOREIGN KEY (`definition_id`) REFERENCES `workflow_definitions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_instances` ADD CONSTRAINT `workflow_instances_current_state_id_fkey` FOREIGN KEY (`current_state_id`) REFERENCES `workflow_states`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_transition_logs` ADD CONSTRAINT `workflow_transition_logs_instance_id_fkey` FOREIGN KEY (`instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_transition_logs` ADD CONSTRAINT `workflow_transition_logs_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
