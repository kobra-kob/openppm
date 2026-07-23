-- Harmonise les numéros de projet au format PROJxxxxx (PROJ + 5 chiffres).
-- Les codes historiques hétérogènes (ex. « ECOM-2026 », « P-0002 », « PROJ0001 »)
-- sont renumérotés par organisation, dans l'ordre de création, à partir de 1.
-- Le renommage passe par un code temporaire pour éviter toute collision avec la
-- contrainte d'unicité (organization_id, code) pendant la mise à jour.
-- La table temporaire déclare explicitement la collation des colonnes pour
-- rester alignée sur `projects` (utf8mb4_unicode_ci).

CREATE TEMPORARY TABLE tmp_project_codes (
  id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,
  new_code VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
);

-- 1) Séquence cible par organisation (ordre de création stable)
INSERT INTO tmp_project_codes (id, new_code)
SELECT
  id,
  CONCAT(
    'PROJ',
    LPAD(ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at, id), 5, '0')
  )
FROM projects;

-- 2) Neutralise temporairement les codes actuels (pas de doublon transitoire)
UPDATE projects p
JOIN tmp_project_codes t ON t.id = p.id
SET p.code = CONCAT('~', LEFT(p.id, 18));

-- 3) Applique les numéros définitifs
UPDATE projects p
JOIN tmp_project_codes t ON t.id = p.id
SET p.code = t.new_code;

DROP TEMPORARY TABLE tmp_project_codes;
