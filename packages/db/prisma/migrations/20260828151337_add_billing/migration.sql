-- CreateTable
CREATE TABLE `subscription_plans` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(30) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `unit_amount` INTEGER NOT NULL DEFAULT 0,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'eur',
    `interval` ENUM('month', 'year') NOT NULL DEFAULT 'month',
    `stripe_price_monthly` VARCHAR(120) NULL,
    `stripe_price_yearly` VARCHAR(120) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscription_plans_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `plan_key` VARCHAR(30) NOT NULL DEFAULT 'STANDARD',
    `status` ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'SUSPENDED', 'CANCELED', 'ENTERPRISE') NOT NULL DEFAULT 'TRIALING',
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_amount` INTEGER NOT NULL DEFAULT 2000,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'eur',
    `interval` ENUM('month', 'year') NOT NULL DEFAULT 'month',
    `stripe_customer_id` VARCHAR(120) NULL,
    `stripe_subscription_id` VARCHAR(120) NULL,
    `trial_start` DATETIME(3) NULL,
    `trial_end` DATETIME(3) NULL,
    `current_period_start` DATETIME(3) NULL,
    `current_period_end` DATETIME(3) NULL,
    `cancel_at_period_end` BOOLEAN NOT NULL DEFAULT false,
    `canceled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscriptions_organization_id_key`(`organization_id`),
    INDEX `subscriptions_status_idx`(`status`),
    INDEX `subscriptions_stripe_customer_id_idx`(`stripe_customer_id`),
    INDEX `subscriptions_stripe_subscription_id_idx`(`stripe_subscription_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `billing_events` (
    `id` CHAR(36) NOT NULL,
    `stripe_event_id` VARCHAR(120) NOT NULL,
    `type` VARCHAR(80) NOT NULL,
    `payload` JSON NOT NULL,
    `processed_at` DATETIME(3) NULL,
    `result` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `billing_events_stripe_event_id_key`(`stripe_event_id`),
    INDEX `billing_events_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `stripe_invoice_id` VARCHAR(120) NULL,
    `number` VARCHAR(60) NULL,
    `amount_due` INTEGER NOT NULL DEFAULT 0,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'eur',
    `status` VARCHAR(30) NOT NULL DEFAULT 'draft',
    `period_start` DATETIME(3) NULL,
    `period_end` DATETIME(3) NULL,
    `hosted_invoice_url` VARCHAR(500) NULL,
    `pdf_url` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `invoices_stripe_invoice_id_key`(`stripe_invoice_id`),
    INDEX `invoices_organization_id_created_at_idx`(`organization_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Amorçage plateforme + backfill (additif, sans perte) ────────────────
-- Plans commerciaux (donnee plateforme).
INSERT INTO `subscription_plans` (`id`, `key`, `name`, `unit_amount`, `currency`, `interval`, `active`, `created_at`, `updated_at`)
VALUES
 (UUID(), 'STANDARD', 'Standard', 2000, 'eur', 'month', 1, NOW(3), NOW(3)),
 (UUID(), 'ENTERPRISE', 'Enterprise', 0, 'eur', 'month', 1, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- Un abonnement par organisation existante : ACTIVE (droits acquis), plan
-- STANDARD, quantite = nombre de membres actifs. Idempotent.
INSERT INTO `subscriptions`
 (`id`, `organization_id`, `plan_key`, `status`, `quantity`, `unit_amount`, `currency`, `interval`,
  `current_period_start`, `current_period_end`, `cancel_at_period_end`, `created_at`, `updated_at`)
SELECT
  UUID(), o.`id`, 'STANDARD', 'ACTIVE',
  GREATEST(1, (SELECT COUNT(*) FROM `organization_memberships` m
              WHERE m.`organization_id` = o.`id` AND m.`status` = 'ACTIVE')),
  2000, 'eur', 'month',
  NOW(3), DATE_ADD(NOW(3), INTERVAL 1 MONTH), 0, NOW(3), NOW(3)
FROM `organizations` o
WHERE o.`deleted_at` IS NULL
  AND NOT EXISTS (SELECT 1 FROM `subscriptions` s WHERE s.`organization_id` = o.`id`);
