-- ===============================================================
-- Merge vehicle_models rows that share the same make + model family
-- (e.g. Mazda CX-8 2018/2020/2022 -> one public Mazda CX-8 card)
--
-- Run AFTER add_vehicle_models_foundation.sql on production.
-- Safe to re-run: idempotent; rolls back cleanly on failure.
--
-- Fixes slug collisions by:
--   1) grouping on computed family slug (not raw make/model text alone)
--   2) deleting duplicate rows BEFORE updating keeper slugs
-- ===============================================================

BEGIN;

-- Shared family key: same formula as app slug (make + model, no year)
CREATE TEMP TABLE vm_merge_plan ON COMMIT DROP AS
SELECT
  vm.id,
  vm.make,
  vm.model,
  vm.year,
  vm.slug,
  vm.sort_order,
  vm.created_at,
  lower(
    regexp_replace(
      trim(concat_ws('-', vm.make, vm.model)),
      '[^a-zA-Z0-9]+',
      '-',
      'g'
    )
  ) AS family_slug,
  (SELECT COUNT(*)::int FROM cars c WHERE c.vehicle_model_id = vm.id) AS unit_count,
  ROW_NUMBER() OVER (
    PARTITION BY lower(
      regexp_replace(
        trim(concat_ws('-', vm.make, vm.model)),
        '[^a-zA-Z0-9]+',
        '-',
        'g'
      )
    )
    ORDER BY
      (SELECT COUNT(*)::int FROM cars c WHERE c.vehicle_model_id = vm.id) DESC,
      vm.sort_order ASC NULLS LAST,
      vm.created_at ASC NULLS LAST,
      vm.id ASC
  ) AS rn,
  FIRST_VALUE(vm.id) OVER (
    PARTITION BY lower(
      regexp_replace(
        trim(concat_ws('-', vm.make, vm.model)),
        '[^a-zA-Z0-9]+',
        '-',
        'g'
      )
    )
    ORDER BY
      (SELECT COUNT(*)::int FROM cars c WHERE c.vehicle_model_id = vm.id) DESC,
      vm.sort_order ASC NULLS LAST,
      vm.created_at ASC NULLS LAST,
      vm.id ASC
  ) AS keep_id
FROM vehicle_models vm;

UPDATE cars c
SET vehicle_model_id = p.keep_id
FROM vm_merge_plan p
WHERE c.vehicle_model_id = p.id
  AND p.rn > 1;

UPDATE bookings b
SET vehicle_model_id = p.keep_id
FROM vm_merge_plan p
WHERE b.vehicle_model_id = p.id
  AND p.rn > 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'car_reservations'
  ) THEN
    UPDATE car_reservations r
    SET vehicle_model_id = p.keep_id
    FROM vm_merge_plan p
    WHERE r.vehicle_model_id = p.id
      AND p.rn > 1;
  END IF;
END $$;

-- Remove duplicate family rows BEFORE touching slugs (avoids slug unique violations)
DELETE FROM vehicle_models vm
USING vm_merge_plan p
WHERE vm.id = p.id
  AND p.rn > 1;

-- Canonicalize surviving rows (one per family_slug)
UPDATE vehicle_models vm
SET
  slug = p.family_slug,
  display_name = trim(concat_ws(' ', vm.make, vm.model)),
  year = NULL
FROM vm_merge_plan p
WHERE vm.id = p.id
  AND p.rn = 1;

COMMIT;
