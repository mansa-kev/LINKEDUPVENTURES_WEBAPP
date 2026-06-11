-- Repair bookings where inspections exist but lifecycle status/timestamps are stale.
-- 1) Run the preview SELECT
-- 2) Run the UPDATE block
-- 3) Re-run preview — should return zero rows

-- ── Preview ──────────────────────────────────────────────────────────────────
WITH inspection_summary AS (
  SELECT
    booking_id,
    MAX(created_at) FILTER (WHERE type = 'pre_handover') AS pre_at,
    MAX(conducted_by) FILTER (WHERE type = 'pre_handover') AS pre_by,
    MAX(created_at) FILTER (WHERE type = 'post_return') AS post_at,
    MAX(conducted_by) FILTER (WHERE type = 'post_return') AS post_by
  FROM booking_inspections
  GROUP BY booking_id
)
SELECT
  b.id,
  b.status,
  b.sub_status,
  b.pickup_confirmed_at,
  b.return_confirmed_at,
  i.pre_at,
  i.post_at
FROM bookings b
JOIN inspection_summary i ON i.booking_id = b.id
WHERE
  (i.pre_at IS NOT NULL AND b.pickup_confirmed_at IS NULL)
  OR (i.post_at IS NOT NULL AND b.return_confirmed_at IS NULL)
  OR (i.post_at IS NOT NULL AND b.status NOT IN ('completed', 'returned'))
  OR (i.pre_at IS NOT NULL AND i.post_at IS NULL AND b.status NOT IN ('on_trip', 'returned', 'completed'));

-- ── Repair ───────────────────────────────────────────────────────────────────
WITH inspection_summary AS (
  SELECT
    booking_id,
    MAX(created_at) FILTER (WHERE type = 'pre_handover') AS pre_at,
    MAX(conducted_by) FILTER (WHERE type = 'pre_handover') AS pre_by,
    MAX(created_at) FILTER (WHERE type = 'post_return') AS post_at,
    MAX(conducted_by) FILTER (WHERE type = 'post_return') AS post_by
  FROM booking_inspections
  GROUP BY booking_id
)
UPDATE bookings b
SET
  pickup_confirmed_at = COALESCE(b.pickup_confirmed_at, i.pre_at),
  pickup_confirmed_by = COALESCE(b.pickup_confirmed_by, i.pre_by),
  return_confirmed_at = COALESCE(b.return_confirmed_at, i.post_at),
  return_confirmed_by = COALESCE(b.return_confirmed_by, i.post_by),
  status = CASE
    WHEN i.post_at IS NOT NULL THEN 'completed'::booking_status
    WHEN i.pre_at IS NOT NULL THEN 'on_trip'::booking_status
    ELSE b.status
  END,
  sub_status = CASE
    WHEN i.post_at IS NOT NULL THEN 'completed'
    WHEN i.pre_at IS NOT NULL THEN 'in_transit'
    ELSE b.sub_status
  END
FROM inspection_summary i
WHERE b.id = i.booking_id
  AND (
    (i.pre_at IS NOT NULL AND b.pickup_confirmed_at IS NULL)
    OR (i.post_at IS NOT NULL AND b.return_confirmed_at IS NULL)
    OR (i.post_at IS NOT NULL AND b.status NOT IN ('completed', 'returned'))
    OR (i.pre_at IS NOT NULL AND i.post_at IS NULL AND b.status NOT IN ('on_trip', 'returned', 'completed'))
  );
