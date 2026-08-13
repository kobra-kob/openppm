-- AlterTable
ALTER TABLE `roles` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `description` VARCHAR(255) NULL;
