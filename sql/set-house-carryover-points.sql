-- Run against an existing School House Points database as a MariaDB administrator.
-- Safe to re-run: it sets the previous-year opening scores to these exact values.
USE school_house_points;

ALTER TABLE houses
  ADD COLUMN IF NOT EXISTS carryover_points INT UNSIGNED NOT NULL DEFAULT 0;

UPDATE houses
SET carryover_points = CASE house_code
  WHEN 'houseA' THEN 44
  WHEN 'houseB' THEN 34
  ELSE carryover_points
END
WHERE house_code IN ('houseA', 'houseB');

CREATE OR REPLACE VIEW house_points AS
SELECT
  h.house_code,
  h.house_name,
  h.carryover_points + COUNT(a.learner_id) AS total_points
FROM houses AS h
LEFT JOIN attendance AS a
  ON a.house_code = h.house_code
GROUP BY h.house_code, h.house_name, h.carryover_points;
