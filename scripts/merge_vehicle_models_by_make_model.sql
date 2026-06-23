-- ===============================================================
-- Merge vehicle_models rows that share the same make + model
-- (e.g. Mazda CX-8 2018/2020/2022 -> one public Mazda CX-8 card)
-- Run AFTER add_vehicle_models_foundation.sql on production.
-- Safe to re-run: only merges families with 2+ rows.
-- ===============================================================

BEGIN;

WITH ranked AS (
  SELECT
    vm.id,
    vm.make,
    vm.model,
    vm.year,
    vm.sort_order,
    vm.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(vm.make)), lower(trim(vm.model))
      ORDER BY
        (SELECT COUNT(*)::int FROM cars c WHERE c.vehicle_model_id = vm.id) DESC,
        vm.sort_order ASC NULLS LAST,
        vm.created_at ASC NULLS LAST,
        vm.id ASC
    ) AS rn
  FROM vehicle_models vm
),
keepers AS (
  SELECT id AS keep_id, make, model
  FROM ranked
  WHERE rn = 1
),
dupes AS (
  SELECT r.id AS dup_id, k.keep_id
  FROM ranked r
  INNER JOIN keepers k
    ON lower(trim(r.make)) = lower(trim(k.make))
    AND lower(trim(r.model)) = lower(trim(k.model))
  WHERE r.rn > 1
)
UPDATE cars c
SET vehicle_model_id = d.keep_id
FROM dupes d
WHERE c.vehicle_model_id = d.dup_id;

WITH ranked AS (
  SELECT
    vm.id,
    vm.make,
    vm.model,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(vm.make)), lower(trim(vm.model))
      ORDER BY
        (SELECT COUNT(*)::int FROM cars c WHERE c.vehicle_model_id = vm.id) DESC,
        vm.sort_order ASC NULLS LAST,
        vm.created_at ASC NULLS LAST,
        vm.id ASC
    ) AS rn
  FROM vehicle_models vm
),
keepers AS (
  SELECT id AS keep_id, make, model
  FROM ranked
  WHERE rn = 1
),
dupes AS (
  SELECT r.id AS dup_id, k.keep_id
  FROM ranked r
  INNER JOIN keepers k
    ON lower(trim(r.make)) = lower(trim(k.make))
    AND lower(trim(r.model)) = lower(trim(k.model))
  WHERE r.rn > 1
)
UPDATE bookings b
SET vehicle_model_id = d.keep_id
FROM dupes d
WHERE b.vehicle_model_id = d.dup_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'car_reservations'
  ) THEN
    WITH ranked AS (
      SELECT
        vm.id,
        vm.make,
        vm.model,
        ROW_NUMBER() OVER (
          PARTITION BY lower(trim(vm.make)), lower(trim(vm.model))
          ORDER BY
            (SELECT COUNT(*)::int FROM cars c WHERE c.vehicle_model_id = vm.id) DESC,
            vm.sort_order ASC NULLS LAST,
            vm.created_at ASC NULLS LAST,
            vm.id ASC
        ) AS rn
      FROM vehicle_models vm
    ),
    keepers AS (
      SELECT id AS keep_id, make, model
      FROM ranked
      WHERE rn = 1
    ),
    dupes AS (
      SELECT r.id AS dup_id, k.keep_id
      FROM ranked r
      INNER JOIN keepers k
        ON lower(trim(r.make)) = lower(trim(k.make))
        AND lower(trim(r.model)) = lower(trim(k.model))
      WHERE r.rn > 1
    )
    UPDATE car_reservations r
    SET vehicle_model_id = d.keep_id
    FROM dupes d
    WHERE r.vehicle_model_id = d.dup_id;
  END IF;
END $$;

UPDATE vehicle_models vm
SET
  slug = lower(
    regexp_replace(
      trim(concat_ws('-', vm.make, vm.model)),
      '[^a-zA-Z0-9]+',
      '-',
      'g'
    )
  ),
  display_name = trim(concat_ws(' ', vm.make, vm.model)),
  year = NULL
WHERE vm.id IN (
  SELECT keep_id
  FROM (
    SELECT
      id AS keep_id,
      ROW_NUMBER() OVER (
        PARTITION BY lower(trim(make)), lower(trim(model))
        ORDER BY
          (SELECT COUNT(*)::int FROM cars c WHERE c.vehicle_model_id = vehicle_models.id) DESC,
          sort_order ASC NULLS LAST,
          created_at ASC NULLS LAST,
          id ASC
      ) AS rn
    FROM vehicle_models
  ) ranked_keepers
  WHERE rn = 1
);

DELETE FROM vehicle_models vm
USING (
  SELECT r.id AS dup_id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY lower(trim(make)), lower(trim(model))
        ORDER BY
          (SELECT COUNT(*)::int FROM cars c WHERE c.vehicle_model_id = vehicle_models.id) DESC,
          sort_order ASC NULLS LAST,
          created_at ASC NULLS LAST,
          id ASC
      ) AS rn
    FROM vehicle_models
  ) r
  WHERE r.rn > 1
) dupes
WHERE vm.id = dupes.dup_id;

COMMIT;
