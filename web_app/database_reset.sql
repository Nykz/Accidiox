-- =======================================================
-- Accidiox: wipe ALL data and start fresh.
--
-- Deletes every account (riders, hospitals, crews), every incident, crash
-- log, contact, session and password-reset link, and restarts all IDs at 1.
-- The tables themselves stay. THIS CANNOT BE UNDONE: export a backup first
-- (phpMyAdmin -> Export) if you might need the data again.
--
-- How to run on Hostinger:
--   hPanel -> Databases -> phpMyAdmin -> select your Accidiox database
--   -> "SQL" tab -> paste this whole file -> Go.
-- =======================================================

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE incident_events;
TRUNCATE TABLE incident_alerts;
TRUNCATE TABLE incidents;
TRUNCATE TABLE accident_logs;
TRUNCATE TABLE ambulances;
TRUNCATE TABLE hospitals;
TRUNCATE TABLE emergency_contacts;
TRUNCATE TABLE rider_live;
TRUNCATE TABLE rider_profiles;
TRUNCATE TABLE password_resets;
TRUNCATE TABLE user_sessions;
TRUNCATE TABLE auth_attempts;
TRUNCATE TABLE users;

-- Left over from the first version of the app (safe if it doesn't exist).
DROP TABLE IF EXISTS live_status;

SET FOREIGN_KEY_CHECKS = 1;
