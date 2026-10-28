-- Run once as a MariaDB administrator if the original schema was already applied.
-- Safe for this fresh-start deployment where no phone data needs to be retained.
ALTER TABLE users DROP COLUMN phone;
