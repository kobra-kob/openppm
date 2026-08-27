-- Backfill idempotent : garantit que chaque utilisateur a un membership vers son
-- org, avec ses roles, et que chaque org a un owner. Sans effet si deja fait.

-- 1) Memberships manquants.
INSERT INTO `organization_memberships` (`id`, `user_id`, `organization_id`, `status`, `is_owner`, `created_at`, `updated_at`)
SELECT UUID(), u.`id`, u.`organization_id`, 'ACTIVE', 0, NOW(3), NOW(3)
FROM `users` u
WHERE NOT EXISTS (
  SELECT 1 FROM `organization_memberships` m
  WHERE m.`user_id` = u.`id` AND m.`organization_id` = u.`organization_id`
);

-- 2) Roles de membership manquants (copie depuis user_roles).
INSERT INTO `membership_roles` (`membership_id`, `role_id`)
SELECT m.`id`, ur.`role_id`
FROM `organization_memberships` m
JOIN `user_roles` ur ON ur.`user_id` = m.`user_id`
WHERE NOT EXISTS (
  SELECT 1 FROM `membership_roles` mr
  WHERE mr.`membership_id` = m.`id` AND mr.`role_id` = ur.`role_id`
);

-- 3) Owner d'org si manquant.
UPDATE `organizations` o
SET o.`owner_user_id` = (
  SELECT u.`id` FROM `users` u
  JOIN `user_roles` ur ON ur.`user_id` = u.`id`
  JOIN `roles` r ON r.`id` = ur.`role_id` AND r.`key` = 'admin'
  WHERE u.`organization_id` = o.`id`
  ORDER BY u.`created_at` ASC LIMIT 1
)
WHERE o.`owner_user_id` IS NULL;

-- 4) is_owner sur le membership du proprietaire.
UPDATE `organization_memberships` m
JOIN `organizations` o ON o.`id` = m.`organization_id` AND o.`owner_user_id` = m.`user_id`
SET m.`is_owner` = 1
WHERE m.`is_owner` = 0;
