-- =======================================================
-- Database Schema for Two-Wheeler Smart Black Box
-- Runs inside whichever database is currently selected —
-- on WAMP/XAMPP that's two_wheeler_blackbox (create it yourself
-- first); on shared hosting (e.g. Hostinger) select your
-- pre-created database in phpMyAdmin before importing this file,
-- since hosting accounts can't CREATE DATABASE from SQL.
-- =======================================================

-- Table for storing accident incidents and safety events
CREATE TABLE IF NOT EXISTS `accident_logs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `status` VARCHAR(50) NOT NULL COMMENT 'CONFIRMED_CRASH or CANCELED_FALSE_ALARM',
    `tilt_angle` FLOAT NOT NULL COMMENT 'Tilt in degrees',
    `roll_angle` FLOAT NOT NULL COMMENT 'Roll in degrees',
    `pitch_angle` FLOAT NOT NULL COMMENT 'Pitch in degrees',
    `latitude` DECIMAL(10, 8) DEFAULT NULL,
    `longitude` DECIMAL(11, 8) DEFAULT NULL,
    `speed_kmh` FLOAT DEFAULT 0.0,
    `nearest_hospital` VARCHAR(255) DEFAULT 'Searching...',
    `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert a sample dummy log for testing
INSERT INTO `accident_logs` (`status`, `tilt_angle`, `roll_angle`, `pitch_angle`, `latitude`, `longitude`, `speed_kmh`, `nearest_hospital`, `timestamp`)
VALUES
('CONFIRMED_CRASH', 62.4, 58.1, 15.2, 25.26770000, 82.99130000, 42.5, 'Sir Sunderlal Hospital, BHU', NOW());

-- Single-row table holding the bike's most recent live position, updated
-- continuously by the rider app while connected. This is what the admin
-- portal's "live" marker reads — separate from accident_logs, which only
-- gets a row when a crash is confirmed or canceled.
CREATE TABLE IF NOT EXISTS `live_status` (
    `id` INT PRIMARY KEY DEFAULT 1,
    `latitude` DECIMAL(10, 8) DEFAULT NULL,
    `longitude` DECIMAL(11, 8) DEFAULT NULL,
    `speed_kmh` FLOAT DEFAULT 0.0,
    `status` VARCHAR(50) DEFAULT 'SAFE',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `live_status` (`id`) VALUES (1)
ON DUPLICATE KEY UPDATE `id` = `id`;
