-- AddForeignKey
ALTER TABLE `portfolios` ADD CONSTRAINT `portfolios_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
