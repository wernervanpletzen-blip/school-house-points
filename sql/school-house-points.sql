-- MariaDB schema for the School House Points app.
-- Start with a new database; passwords are stored as bcrypt hashes.

CREATE DATABASE IF NOT EXISTS school_house_points
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE school_house_points;

CREATE TABLE IF NOT EXISTS houses (
  house_code VARCHAR(16) NOT NULL,
  house_name VARCHAR(100) NOT NULL,
  carryover_points INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (house_code)
) ENGINE = InnoDB;

INSERT INTO houses (house_code, house_name, carryover_points)
VALUES
  ('houseA', 'Eerhof', 44),
  ('houseB', 'Edelhof', 34)
ON DUPLICATE KEY UPDATE
  house_name = VALUES(house_name);

CREATE TABLE IF NOT EXISTS users (
  user_id CHAR(36) NOT NULL,
  role ENUM('learner', 'teacher') NOT NULL,
  name VARCHAR(100) NOT NULL,
  surname VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(60) NOT NULL,
  grade SMALLINT UNSIGNED NULL,
  house_code VARCHAR(16) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email),
  KEY ix_users_role_grade_house (role, grade, house_code),
  CONSTRAINT fk_users_house
    FOREIGN KEY (house_code) REFERENCES houses (house_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS events (
  event_id CHAR(36) NOT NULL,
  event_name VARCHAR(200) NOT NULL,
  event_date DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (event_id),
  KEY ix_events_date (event_date)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS attendance (
  event_id CHAR(36) NOT NULL,
  learner_id CHAR(36) NOT NULL,
  house_code VARCHAR(16) NOT NULL,
  checked_in_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (event_id, learner_id),
  KEY ix_attendance_learner (learner_id),
  KEY ix_attendance_house (house_code),
  CONSTRAINT fk_attendance_event
    FOREIGN KEY (event_id) REFERENCES events (event_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_attendance_learner
    FOREIGN KEY (learner_id) REFERENCES users (user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_attendance_house
    FOREIGN KEY (house_code) REFERENCES houses (house_code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE = InnoDB;

-- The carry-over is the previous year's opening score; attendance adds points
-- earned in this year's events. The attendance house snapshot preserves history
-- if a learner changes houses later.
CREATE OR REPLACE VIEW house_points AS
SELECT
  h.house_code,
  h.house_name,
  h.carryover_points + COUNT(a.learner_id) AS total_points
FROM houses AS h
LEFT JOIN attendance AS a
  ON a.house_code = h.house_code
GROUP BY h.house_code, h.house_name, h.carryover_points;

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash CHAR(64) NOT NULL,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (token_hash),
  KEY ix_auth_sessions_expiry (expires_at),
  CONSTRAINT fk_auth_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE = InnoDB;
