-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `address` VARCHAR(255) NULL,
    ADD COLUMN `country` VARCHAR(2) NULL,
    ADD COLUMN `logo_url` VARCHAR(500) NULL,
    ADD COLUMN `owner_user_id` CHAR(36) NULL,
    ADD COLUMN `vat_number` VARCHAR(40) NULL;

-- CreateTable
CREATE TABLE `organization_memberships` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `status` ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
    `is_owner` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `organization_memberships_organization_id_status_idx`(`organization_id`, `status`),
    UNIQUE INDEX `organization_memberships_user_id_organization_id_key`(`user_id`, `organization_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `membership_roles` (
    `membership_id` CHAR(36) NOT NULL,
    `role_id` CHAR(36) NOT NULL,

    PRIMARY KEY (`membership_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organization_memberships` ADD CONSTRAINT `organization_memberships_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organization_memberships` ADD CONSTRAINT `organization_memberships_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membership_roles` ADD CONSTRAINT `membership_roles_membership_id_fkey` FOREIGN KEY (`membership_id`) REFERENCES `organization_memberships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membership_roles` ADD CONSTRAINT `membership_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Backfill multi-tenant (donnees existantes, sans perte) ──────────────
-- 1) Un membership ACTIF par utilisateur vers son organisation actuelle.
INSERT INTO `organization_memberships` (`id`, `user_id`, `organization_id`, `status`, `is_owner`, `created_at`, `updated_at`)
SELECT UUID(), u.`id`, u.`organization_id`, 'ACTIVE', 0, NOW(3), NOW(3)
FROM `users` u;

-- 2) Copie des roles utilisateur -> roles de membership (roles par organisation).
INSERT INTO `membership_roles` (`membership_id`, `role_id`)
SELECT m.`id`, ur.`role_id`
FROM `organization_memberships` m
JOIN `user_roles` ur ON ur.`user_id` = m.`user_id`;

-- 3) Proprietaire d'org = plus ancien administrateur de l'org.
UPDATE `organizations` o
SET o.`owner_user_id` = (
  SELECT u.`id`
  FROM `users` u
  JOIN `user_roles` ur ON ur.`user_id` = u.`id`
  JOIN `roles` r ON r.`id` = ur.`role_id` AND r.`key` = 'admin'
  WHERE u.`organization_id` = o.`id`
  ORDER BY u.`created_at` ASC
  LIMIT 1
);

-- 4) Marque le membership du proprietaire comme owner.
UPDATE `organization_memberships` m
JOIN `organizations` o ON o.`id` = m.`organization_id` AND o.`owner_user_id` = m.`user_id`
SET m.`is_owner` = 1;
