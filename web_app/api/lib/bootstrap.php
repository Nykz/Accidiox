<?php
// Shared bootstrap for every Accidiox API.
//
// - Opens the MySQL connection via ../db_config.php
// - Creates / migrates the tables on first run (no demo data is seeded)
// - Token auth: clients send "X-Auth-Token"; only its SHA-256 is stored.
//   Tokens are per role, so a rider, hospital and crew account with the
//   same email are fully separate and never unlock each other's apps.
// - Rate limiting, generic errors, no cross-origin access.

ini_set('display_errors', '0');
date_default_timezone_set('Asia/Kolkata');

require_once __DIR__ . '/../db_config.php';

// db_config.php (kept only on the server) historically sends a wildcard
// CORS header. The apps are same-origin, so allow no other site to call us.
header_remove('Access-Control-Allow-Origin');
header_remove('Access-Control-Allow-Headers');
header_remove('Access-Control-Allow-Methods');
header("Content-Type: application/json; charset=utf-8");
header("X-Content-Type-Options: nosniff");
header("Cache-Control: no-store");
header("Referrer-Policy: no-referrer");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit();
}

$conn->set_charset('utf8mb4');

const SCHEMA_VERSION = 'v3.2';
const SESSION_DAYS = ['rider' => 180, 'hospital' => 7, 'ambulance' => 30, 'admin' => 2];
const ASSIGN_ACCEPT_SECONDS = 60;   // crew must accept a dispatch within this
const CLAIM_RELEASE_SECONDS = 300;  // a claim with no accepting crew goes back to the grid
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// ================= Response helpers =================
function json_out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit();
}

function fail($message, $code = 400, $extra = []) {
    json_out(array_merge(["status" => "error", "message" => $message], $extra), $code);
}

// Sends the JSON response and closes the connection, letting the script
// keep working (e.g. sending an email) after the client has its answer.
function respond_now($data, $code = 200) {
    ignore_user_abort(true);
    $body = json_encode($data, JSON_UNESCAPED_UNICODE);
    http_response_code($code);
    header("Connection: close");
    header("Content-Length: " . strlen($body));
    echo $body;
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } elseif (function_exists('litespeed_finish_request')) {
        litespeed_finish_request();
    } else {
        while (ob_get_level() > 0) ob_end_flush();
        flush();
    }
}

// Internal errors are logged server-side; clients only get a generic message.
function server_error($detail) {
    error_log("[Accidiox] " . $detail);
    fail("Something went wrong on our side. Please try again.", 500);
}

function read_json() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '', true);
    return is_array($data) ? $data : $_POST;
}

function require_post() {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail("Method not allowed.", 405);
}

function now_ts() {
    return date("Y-m-d H:i:s");
}

function ts_ago($seconds) {
    return date("Y-m-d H:i:s", time() - $seconds);
}

function str_in($input, $key, $max = 255) {
    $v = isset($input[$key]) && is_scalar($input[$key]) ? trim((string) $input[$key]) : '';
    // Strip control characters (incl. CR/LF, which could inject email headers).
    $v = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $v);
    return mb_substr($v, 0, $max);
}

function normalize_phone($phone) {
    $digits = preg_replace('/[^0-9]/', '', (string) $phone);
    if (strlen($digits) === 10) return "91" . $digits;
    if (strlen($digits) === 11 && $digits[0] === "0") return "91" . substr($digits, 1);
    return substr($digits, 0, 15);
}

function client_ip() {
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 45);
}

// Prepared-statement helpers. Types are inferred (i/d/s) from PHP values.
function db_query($conn, $sql, $params = []) {
    $stmt = $conn->prepare($sql);
    if (!$stmt) server_error("prepare failed: " . $conn->error . " | " . $sql);
    if ($params) {
        $types = '';
        foreach ($params as $p) {
            $types .= is_int($p) ? 'i' : (is_float($p) ? 'd' : 's');
        }
        $stmt->bind_param($types, ...$params);
    }
    if (!$stmt->execute()) server_error("execute failed: " . $stmt->error . " | " . $sql);
    return $stmt;
}

function db_all($conn, $sql, $params = []) {
    $res = db_query($conn, $sql, $params)->get_result();
    return $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
}

function db_one($conn, $sql, $params = []) {
    $rows = db_all($conn, $sql, $params);
    return $rows ? $rows[0] : null;
}

function db_exec($conn, $sql, $params = []) {
    return db_query($conn, $sql, $params)->affected_rows;
}

// ================= Rate limiting =================
// Counts recent events for a key (e.g. failed logins for one email) and
// refuses once the limit is reached.
function rate_count($conn, $key, $windowSeconds) {
    $row = db_one($conn, "SELECT COUNT(*) AS n FROM auth_attempts WHERE scope_key = ? AND created_at > ?", [$key, ts_ago($windowSeconds)]);
    return (int) $row['n'];
}

function rate_hit($conn, $key) {
    db_exec($conn, "INSERT INTO auth_attempts (scope_key, created_at) VALUES (?, ?)", [substr($key, 0, 190), now_ts()]);
    // Opportunistic cleanup of old rows.
    if (mt_rand(1, 50) === 1) db_exec($conn, "DELETE FROM auth_attempts WHERE created_at < ?", [ts_ago(86400)]);
}

function rate_limit($conn, $key, $max, $windowSeconds, $message = "Too many attempts. Please wait a few minutes and try again.") {
    if (rate_count($conn, $key, $windowSeconds) >= $max) fail($message, 429);
    rate_hit($conn, $key);
}

// ================= Geo helpers =================
function haversine_km($lat1, $lon1, $lat2, $lon2) {
    $r = 6371;
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
    return 2 * $r * asin(min(1, sqrt($a)));
}

// Ambulance on lights in Indian urban traffic: straight-line distance with
// a 1.35 road-winding factor at ~32 km/h average. Never quote under 3 min.
function eta_minutes_for_km($km) {
    return max(3, (int) round(($km * 1.35) / 32 * 60));
}

function valid_coords($lat, $lon) {
    return $lat !== null && $lon !== null && abs($lat) <= 90 && abs($lon) <= 180 && !($lat == 0 && $lon == 0);
}

// ================= Schema =================
function column_exists($conn, $table, $column) {
    $r = $conn->query("SHOW COLUMNS FROM `$table` LIKE '" . $conn->real_escape_string($column) . "'");
    return $r && $r->num_rows > 0;
}

function index_exists($conn, $table, $index) {
    $r = $conn->query("SHOW INDEX FROM `$table` WHERE Key_name = '" . $conn->real_escape_string($index) . "'");
    return $r && $r->num_rows > 0;
}

function ensure_schema($conn) {
    $flag = __DIR__ . '/../data/.schema_' . SCHEMA_VERSION;
    if (file_exists($flag)) return;

    $tables = [
        "CREATE TABLE IF NOT EXISTS `accident_logs` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT DEFAULT NULL,
            `status` VARCHAR(50) NOT NULL,
            `tilt_angle` FLOAT NOT NULL,
            `roll_angle` FLOAT NOT NULL,
            `pitch_angle` FLOAT NOT NULL,
            `latitude` DECIMAL(10, 8) DEFAULT NULL,
            `longitude` DECIMAL(11, 8) DEFAULT NULL,
            `speed_kmh` FLOAT DEFAULT 0.0,
            `nearest_hospital` VARCHAR(255) DEFAULT 'Searching...',
            `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX (`user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS `users` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `role` VARCHAR(16) NOT NULL,
            `name` VARCHAR(120) NOT NULL,
            `email` VARCHAR(190) NOT NULL,
            `phone` VARCHAR(20) DEFAULT NULL,
            `password_hash` VARCHAR(255) NOT NULL,
            `hospital_id` VARCHAR(40) DEFAULT NULL,
            `created_at` DATETIME NOT NULL,
            UNIQUE KEY `uniq_role_email` (`role`, `email`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS `user_sessions` (
            `token_hash` CHAR(64) PRIMARY KEY,
            `user_id` INT NOT NULL,
            `expires_at` DATETIME NOT NULL,
            `created_at` DATETIME NOT NULL,
            INDEX (`user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS `password_resets` (
            `token_hash` CHAR(64) PRIMARY KEY,
            `user_id` INT NOT NULL,
            `expires_at` DATETIME NOT NULL,
            `used_at` DATETIME DEFAULT NULL,
            `created_at` DATETIME NOT NULL,
            INDEX (`user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS `auth_attempts` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `scope_key` VARCHAR(190) NOT NULL,
            `created_at` DATETIME NOT NULL,
            INDEX (`scope_key`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS `rider_profiles` (
            `user_id` INT PRIMARY KEY,
            `full_name` VARCHAR(120) NOT NULL,
            `phone` VARCHAR(20) NOT NULL,
            `date_of_birth` DATE DEFAULT NULL,
            `gender` VARCHAR(16) DEFAULT NULL,
            `blood_group` VARCHAR(8) NOT NULL,
            `allergies` VARCHAR(255) DEFAULT NULL,
            `conditions` VARCHAR(255) DEFAULT NULL,
            `emergency_name` VARCHAR(120) DEFAULT NULL,
            `emergency_phone` VARCHAR(20) DEFAULT NULL,
            `emergency_relation` VARCHAR(40) DEFAULT NULL,
            `vehicle_number` VARCHAR(20) DEFAULT NULL,
            `vehicle_model` VARCHAR(60) DEFAULT NULL,
            `completed_at` DATETIME DEFAULT NULL,
            `updated_at` DATETIME DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS `rider_live` (
            `user_id` INT PRIMARY KEY,
            `latitude` DECIMAL(10, 8) DEFAULT NULL,
            `longitude` DECIMAL(11, 8) DEFAULT NULL,
            `speed_kmh` FLOAT DEFAULT 0,
            `status` VARCHAR(30) DEFAULT 'SAFE',
            `updated_at` DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS `emergency_contacts` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT DEFAULT NULL,
            `name` VARCHAR(100) NOT NULL,
            `phone` VARCHAR(20) NOT NULL,
            `is_primary` TINYINT(1) DEFAULT 0,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX (`user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS `hospitals` (
            `id` VARCHAR(40) PRIMARY KEY,
            `name` VARCHAR(160) NOT NULL,
            `short_name` VARCHAR(60) NOT NULL,
            `area` VARCHAR(160) DEFAULT NULL,
            `city` VARCHAR(80) DEFAULT NULL,
            `latitude` DECIMAL(10,7) NOT NULL,
            `longitude` DECIMAL(10,7) NOT NULL,
            `phone` VARCHAR(20) DEFAULT NULL,
            `email` VARCHAR(190) DEFAULT NULL,
            `er_beds_free` INT NOT NULL DEFAULT 0,
            `er_beds_total` INT NOT NULL DEFAULT 0,
            `verified` TINYINT(1) NOT NULL DEFAULT 0,
            `created_at` DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS `ambulances` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `hospital_id` VARCHAR(40) NOT NULL,
            `unit_code` VARCHAR(20) NOT NULL,
            `unit_type` VARCHAR(10) NOT NULL DEFAULT 'BLS',
            `vehicle_number` VARCHAR(20) DEFAULT NULL,
            `crew_user_id` INT DEFAULT NULL,
            `crew_name` VARCHAR(120) DEFAULT NULL,
            `crew_phone` VARCHAR(20) DEFAULT NULL,
            `approved` TINYINT(1) NOT NULL DEFAULT 0,
            `status` VARCHAR(16) NOT NULL DEFAULT 'offline',
            `latitude` DECIMAL(10,7) DEFAULT NULL,
            `longitude` DECIMAL(10,7) DEFAULT NULL,
            `speed_kmh` FLOAT DEFAULT 0,
            `last_seen` DATETIME DEFAULT NULL,
            `current_incident_id` INT DEFAULT NULL,
            UNIQUE KEY `uniq_unit` (`hospital_id`, `unit_code`),
            INDEX (`crew_user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS `incidents` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `accident_log_id` INT DEFAULT NULL,
            `rider_user_id` INT DEFAULT NULL,
            `rider_name` VARCHAR(120) DEFAULT NULL,
            `rider_phone` VARCHAR(20) DEFAULT NULL,
            `blood_group` VARCHAR(8) DEFAULT NULL,
            `medical_notes` VARCHAR(255) DEFAULT NULL,
            `emergency_contact` VARCHAR(160) DEFAULT NULL,
            `vehicle_number` VARCHAR(20) DEFAULT NULL,
            `location_name` VARCHAR(255) DEFAULT NULL,
            `latitude` DECIMAL(10,7) NOT NULL,
            `longitude` DECIMAL(10,7) NOT NULL,
            `speed_kmh` FLOAT DEFAULT 0,
            `tilt_angle` FLOAT DEFAULT 0,
            `roll_angle` FLOAT DEFAULT 0,
            `pitch_angle` FLOAT DEFAULT 0,
            `impact_g` VARCHAR(60) DEFAULT NULL,
            `status` VARCHAR(20) NOT NULL DEFAULT 'UNCLAIMED',
            `claimed_by_hospital_id` VARCHAR(40) DEFAULT NULL,
            `ambulance_id` INT DEFAULT NULL,
            `assignment_status` VARCHAR(16) DEFAULT NULL,
            `assigned_at` DATETIME DEFAULT NULL,
            `eta_minutes` INT DEFAULT NULL,
            `dispatched_at` DATETIME DEFAULT NULL,
            `admitted_at` DATETIME DEFAULT NULL,
            `is_simulated` TINYINT(1) NOT NULL DEFAULT 0,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            INDEX (`rider_user_id`),
            INDEX (`status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS `incident_alerts` (
            `incident_id` INT NOT NULL,
            `hospital_id` VARCHAR(40) NOT NULL,
            `alert_rank` TINYINT NOT NULL,
            `distance_km` FLOAT NOT NULL,
            `notified_at` DATETIME NOT NULL,
            PRIMARY KEY (`incident_id`, `hospital_id`),
            INDEX (`hospital_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS `incident_events` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `incident_id` INT NOT NULL,
            `status` VARCHAR(20) NOT NULL,
            `actor_type` VARCHAR(16) NOT NULL,
            `actor_id` VARCHAR(40) DEFAULT NULL,
            `note` VARCHAR(255) DEFAULT NULL,
            `created_at` DATETIME NOT NULL,
            INDEX (`incident_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    ];
    foreach ($tables as $sql) {
        if (!$conn->query($sql)) server_error("schema: " . $conn->error);
    }

    // Upgrades for databases created by earlier versions.
    $columns = [
        ['accident_logs', 'user_id', "ADD COLUMN `user_id` INT DEFAULT NULL AFTER `id`, ADD INDEX (`user_id`)"],
        ['emergency_contacts', 'user_id', "ADD COLUMN `user_id` INT DEFAULT NULL AFTER `id`, ADD INDEX (`user_id`)"],
        ['hospitals', 'verified', "ADD COLUMN `verified` TINYINT(1) NOT NULL DEFAULT 0"],
        ['ambulances', 'approved', "ADD COLUMN `approved` TINYINT(1) NOT NULL DEFAULT 0"],
        ['incidents', 'assignment_status', "ADD COLUMN `assignment_status` VARCHAR(16) DEFAULT NULL AFTER `ambulance_id`"],
        ['incidents', 'assigned_at', "ADD COLUMN `assigned_at` DATETIME DEFAULT NULL AFTER `assignment_status`"],
        // Rider cancelled the request after getting help ("Are you fine?" / "Got treatment?").
        ['incidents', 'cancelled_at', "ADD COLUMN `cancelled_at` DATETIME DEFAULT NULL"],
        ['incidents', 'cancel_condition', "ADD COLUMN `cancel_condition` VARCHAR(16) DEFAULT NULL"],
        ['incidents', 'cancel_treatment', "ADD COLUMN `cancel_treatment` VARCHAR(16) DEFAULT NULL"],
        // 'rider' (from the app) or 'support' (Accidiox team closed it after calling the rider).
        ['incidents', 'cancelled_by', "ADD COLUMN `cancelled_by` VARCHAR(16) DEFAULT NULL"],
        ['incidents', 'cancel_note', "ADD COLUMN `cancel_note` VARCHAR(255) DEFAULT NULL"],
    ];
    foreach ($columns as [$table, $col, $ddl]) {
        if (!column_exists($conn, $table, $col)) $conn->query("ALTER TABLE `$table` $ddl");
    }
    // Emails are unique per app (role), not globally.
    if (index_exists($conn, 'users', 'email')) $conn->query("ALTER TABLE `users` DROP INDEX `email`");
    if (!index_exists($conn, 'users', 'uniq_role_email')) $conn->query("ALTER TABLE `users` ADD UNIQUE KEY `uniq_role_email` (`role`, `email`)");

    @mkdir(dirname($flag), 0755, true);
    @file_put_contents($flag, now_ts());
}

// ================= Auth =================
function issue_session($conn, $userId, $role) {
    $token = bin2hex(random_bytes(32));
    $days = SESSION_DAYS[$role] ?? 7;
    db_exec($conn, "INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)",
        [hash('sha256', $token), (int) $userId, date("Y-m-d H:i:s", time() + $days * 86400), now_ts()]);
    return $token;
}

function request_token() {
    $t = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if (!$t && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strcasecmp($k, 'X-Auth-Token') === 0) $t = $v;
        }
    }
    return is_string($t) && preg_match('/^[a-f0-9]{64}$/', $t) ? $t : null;
}

function current_user($conn) {
    static $cached = false;
    if ($cached !== false) return $cached;
    $token = request_token();
    if (!$token) return $cached = null;
    $hash = hash('sha256', $token);
    $user = db_one($conn,
        "SELECT u.id, u.role, u.name, u.email, u.phone, u.hospital_id, s.expires_at
         FROM user_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?",
        [$hash, now_ts()]);
    // Sliding expiry: active users stay signed in.
    if ($user) {
        $days = SESSION_DAYS[$user['role']] ?? 7;
        if (strtotime($user['expires_at']) - time() < ($days * 86400) / 2) {
            db_exec($conn, "UPDATE user_sessions SET expires_at = ? WHERE token_hash = ?", [date("Y-m-d H:i:s", time() + $days * 86400), $hash]);
        }
    }
    return $cached = $user;
}

function require_role($conn, $role) {
    $user = current_user($conn);
    if (!$user) fail("Please sign in again.", 401, ["code" => "unauthenticated"]);
    if ($user['role'] !== $role) fail("Please sign in again.", 401, ["code" => "unauthenticated"]);
    return $user;
}

function require_any_user($conn) {
    $user = current_user($conn);
    if (!$user) fail("Please sign in again.", 401, ["code" => "unauthenticated"]);
    return $user;
}

// ================= Incidents =================
function add_event($conn, $incidentId, $status, $actorType, $actorId = null, $note = null) {
    db_exec($conn, "INSERT INTO incident_events (incident_id, status, actor_type, actor_id, note, created_at) VALUES (?,?,?,?,?,?)",
        [(int) $incidentId, $status, $actorType, $actorId === null ? null : (string) $actorId, $note === null ? null : mb_substr($note, 0, 255), now_ts()]);
}

function nearest_hospitals($conn, $lat, $lon, $limit = 3) {
    $rows = db_all($conn, "SELECT id, name, short_name, email, latitude, longitude FROM hospitals WHERE verified = 1");
    foreach ($rows as &$h) {
        $h['distance_km'] = haversine_km($lat, $lon, (float) $h['latitude'], (float) $h['longitude']);
    }
    unset($h);
    usort($rows, fn($a, $b) => $a['distance_km'] <=> $b['distance_km']);
    return array_slice($rows, 0, $limit);
}

// Creates the incident, snapshots the rider's medical profile onto it (so
// the record stays accurate even if the profile is edited later), and
// alerts the three nearest verified hospitals.
function create_incident($conn, $data) {
    $now = now_ts();
    $p = db_one($conn, "SELECT * FROM rider_profiles WHERE user_id = ?", [(int) $data['rider_user_id']]) ?: [];

    $notes = trim(implode(' · ', array_filter([
        !empty($p['allergies']) && strcasecmp($p['allergies'], 'none') !== 0 ? "Allergies: {$p['allergies']}" : null,
        !empty($p['conditions']) && strcasecmp($p['conditions'], 'none') !== 0 ? "Conditions: {$p['conditions']}" : null,
    ])));
    $contact = !empty($p['emergency_phone'])
        ? trim(($p['emergency_name'] ?? '') . ' · +' . ltrim($p['emergency_phone'], '+') . (!empty($p['emergency_relation']) ? " ({$p['emergency_relation']})" : ''), ' ·')
        : null;

    db_exec($conn, "INSERT INTO incidents (accident_log_id, rider_user_id, rider_name, rider_phone, blood_group, medical_notes, emergency_contact,
                    vehicle_number, location_name, latitude, longitude, speed_kmh, tilt_angle, roll_angle, pitch_angle, impact_g,
                    status, created_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'UNCLAIMED',?,?)",
        [
            isset($data['accident_log_id']) ? (int) $data['accident_log_id'] : null,
            (int) $data['rider_user_id'],
            $p['full_name'] ?? 'Rider',
            $p['phone'] ?? null,
            $p['blood_group'] ?? null,
            $notes ?: null,
            $contact,
            $p['vehicle_number'] ?? null,
            $data['location_name'] ?? null,
            (float) $data['latitude'],
            (float) $data['longitude'],
            (float) ($data['speed_kmh'] ?? 0),
            (float) ($data['tilt_angle'] ?? 0),
            (float) ($data['roll_angle'] ?? 0),
            (float) ($data['pitch_angle'] ?? 0),
            $data['impact_g'] ?? null,
            $now, $now
        ]);
    $incidentId = $conn->insert_id;

    add_event($conn, $incidentId, 'REPORTED', 'system', null, 'Crash confirmed by black box after 10 s hold + 20 s rider window');
    alert_hospitals($conn, $incidentId, (float) $data['latitude'], (float) $data['longitude']);
    return $incidentId;
}

function alert_hospitals($conn, $incidentId, $lat, $lon) {
    $now = now_ts();
    $alerted = nearest_hospitals($conn, $lat, $lon, 3);
    foreach ($alerted as $i => $h) {
        db_exec($conn, "INSERT IGNORE INTO incident_alerts (incident_id, hospital_id, alert_rank, distance_km, notified_at) VALUES (?,?,?,?,?)",
            [(int) $incidentId, $h['id'], $i + 1, round($h['distance_km'], 2), $now]);
    }
    if ($alerted) {
        add_event($conn, $incidentId, 'ALERTED', 'system', null,
            'Alert sent to ' . implode(', ', array_map(fn($h) => $h['short_name'], $alerted)));
    }
    return $alerted;
}

// Answers a rider can give when cancelling ("Are you fine?" / "Have you got
// medical treatment?"), with the wording shown to hospitals and crews.
const CANCEL_CONDITION = ['fine' => "I'm fine", 'minor' => 'Minor injuries', 'hurt' => "I'm hurt"];
const CANCEL_TREATMENT = ['clinic' => 'Treated at a nearby clinic / medical shop', 'helped' => 'Helped by people nearby', 'hospital' => 'Going to a hospital on my own', 'none' => 'No treatment yet'];

// Housekeeping run on every poll by hospitals, crews and riders:
//  1. A crew that doesn't accept within 60 s loses the assignment; the
//     hospital is asked to pick another ambulance.
//  2. A claim with no accepting crew after 5 minutes is released back to
//     the alerted hospitals, so a victim is never stuck with a hospital
//     that can't send anyone.
function expire_stale_assignments($conn) {
    $stale = db_all($conn, "SELECT i.id, i.ambulance_id, a.unit_code FROM incidents i LEFT JOIN ambulances a ON a.id = i.ambulance_id
                            WHERE i.assignment_status = 'PENDING' AND i.assigned_at < ?", [ts_ago(ASSIGN_ACCEPT_SECONDS)]);
    foreach ($stale as $s) {
        release_assignment($conn, (int) $s['id'], (int) $s['ambulance_id'], 'TIMEOUT', 'system',
            ($s['unit_code'] ?: 'Ambulance') . " did not accept within " . ASSIGN_ACCEPT_SECONDS . " s");
    }

    $orphans = db_all($conn, "SELECT id, claimed_by_hospital_id FROM incidents
                              WHERE status = 'DISPATCHED' AND (assignment_status IS NULL OR assignment_status <> 'ACCEPTED')
                                AND (assignment_status IS NULL OR assignment_status <> 'PENDING') AND dispatched_at < ?",
        [ts_ago(CLAIM_RELEASE_SECONDS)]);
    foreach ($orphans as $o) {
        $n = db_exec($conn, "UPDATE incidents SET status = 'UNCLAIMED', claimed_by_hospital_id = NULL, ambulance_id = NULL,
                             assignment_status = NULL, assigned_at = NULL, eta_minutes = NULL, dispatched_at = NULL, updated_at = ?
                             WHERE id = ? AND status = 'DISPATCHED' AND (assignment_status IS NULL OR assignment_status NOT IN ('ACCEPTED','PENDING'))",
            [now_ts(), (int) $o['id']]);
        if ($n === 1) add_event($conn, $o['id'], 'RELEASED', 'system', $o['claimed_by_hospital_id'], 'No ambulance accepted in 5 min · sent back to nearby hospitals');
    }
}

function release_assignment($conn, $incidentId, $ambulanceId, $reason, $actorType, $note) {
    $n = db_exec($conn, "UPDATE incidents SET ambulance_id = NULL, assignment_status = ?, assigned_at = NULL, eta_minutes = NULL, updated_at = ?
                         WHERE id = ? AND ambulance_id = ? AND assignment_status = 'PENDING'",
        [$reason, now_ts(), $incidentId, $ambulanceId]);
    if ($n !== 1) return false;
    db_exec($conn, "UPDATE ambulances SET status = IF(status = 'assigned', 'available', status), current_incident_id = NULL
                    WHERE id = ? AND current_incident_id = ?", [$ambulanceId, $incidentId]);
    add_event($conn, $incidentId, $reason === 'DECLINED' ? 'DECLINED' : 'NO_RESPONSE', $actorType, null, $note);
    return true;
}

function incident_payload($conn, $row, $withTimeline = true) {
    $id = (int) $row['id'];
    $amb = null;
    if (!empty($row['ambulance_id'])) {
        $amb = db_one($conn, "SELECT id, unit_code, unit_type, vehicle_number, crew_name, crew_phone, latitude, longitude, speed_kmh, last_seen
                              FROM ambulances WHERE id = ?", [(int) $row['ambulance_id']]);
    }
    $hosp = null;
    if (!empty($row['claimed_by_hospital_id'])) {
        $hosp = db_one($conn, "SELECT id, name, short_name, latitude, longitude, phone FROM hospitals WHERE id = ?", [$row['claimed_by_hospital_id']]);
    }
    $accepted = ($row['assignment_status'] ?? null) === 'ACCEPTED';

    $out = [
        "id" => $id,
        "dispatch_status" => $row['status'],
        "assignment_status" => $row['assignment_status'] ?? null,
        "assigned_at" => $row['assigned_at'] ?? null,
        "claimed_by_hospital_id" => $row['claimed_by_hospital_id'],
        "claimed_by_hospital_name" => $hosp ? $hosp['short_name'] : null,
        "hospital" => $hosp ? [
            "id" => $hosp['id'], "name" => $hosp['name'], "short_name" => $hosp['short_name'],
            "latitude" => (float) $hosp['latitude'], "longitude" => (float) $hosp['longitude'], "phone" => $hosp['phone'],
        ] : null,
        "ambulance_id" => $amb ? (int) $amb['id'] : null,
        "ambulance_unit" => $amb ? $amb['unit_code'] : null,
        "ambulance_type" => $amb ? $amb['unit_type'] : null,
        "ambulance_vehicle" => $amb ? $amb['vehicle_number'] : null,
        "driver_name" => $amb ? $amb['crew_name'] : null,
        "driver_phone" => $amb ? $amb['crew_phone'] : null,
        "ambulance_position" => $amb && $accepted && $amb['last_seen'] ? [
            "latitude" => (float) $amb['latitude'], "longitude" => (float) $amb['longitude'],
            "speed_kmh" => (float) $amb['speed_kmh'], "last_seen" => $amb['last_seen'],
        ] : null,
        "eta_minutes" => $row['eta_minutes'] !== null ? (int) $row['eta_minutes'] : null,
        "dispatch_timestamp" => $row['dispatched_at'],
        "admitted_at" => $row['admitted_at'],
        "cancelled_at" => $row['cancelled_at'] ?? null,
        "cancel_condition" => $row['cancel_condition'] ?? null,
        "cancel_treatment" => $row['cancel_treatment'] ?? null,
        "cancelled_by" => $row['cancelled_by'] ?? null,
        "rider_name" => $row['rider_name'],
        "rider_phone" => $row['rider_phone'],
        "blood_group" => $row['blood_group'],
        "medical_notes" => $row['medical_notes'],
        "emergency_contact" => $row['emergency_contact'],
        "vehicle_number" => $row['vehicle_number'],
        "location_name" => $row['location_name'],
        "latitude" => (float) $row['latitude'],
        "longitude" => (float) $row['longitude'],
        "speed_kmh" => (float) $row['speed_kmh'],
        "tilt_angle" => (float) $row['tilt_angle'],
        "roll_angle" => (float) $row['roll_angle'],
        "pitch_angle" => (float) $row['pitch_angle'],
        "impact_g" => $row['impact_g'],
        "created_at" => $row['created_at'],
        "updated_at" => $row['updated_at'],
    ];

    $out['alerted_hospitals'] = array_map(fn($a) => [
        "id" => $a['hospital_id'], "name" => $a['short_name'], "rank" => (int) $a['alert_rank'], "distance_km" => (float) $a['distance_km'],
    ], db_all($conn, "SELECT a.hospital_id, a.alert_rank, a.distance_km, h.short_name
                      FROM incident_alerts a JOIN hospitals h ON h.id = a.hospital_id
                      WHERE a.incident_id = ? ORDER BY a.alert_rank", [$id]));

    if ($withTimeline) {
        $out['timeline'] = array_map(fn($e) => [
            "status" => $e['status'], "at" => $e['created_at'], "actor_type" => $e['actor_type'], "by" => $e['actor_id'], "note" => $e['note'],
        ], db_all($conn, "SELECT status, actor_type, actor_id, note, created_at FROM incident_events WHERE incident_id = ? ORDER BY id", [$id]));
    }
    return $out;
}

// Status ladder shared by the hospital console and the ambulance app.
const STATUS_FLOW = ['UNCLAIMED', 'DISPATCHED', 'EN_ROUTE', 'AT_SCENE', 'PICKED_UP', 'ADMITTED'];

function status_index($s) {
    $i = array_search($s, STATUS_FLOW, true);
    return $i === false ? -1 : $i;
}

// Moves a claimed incident forward. Admission frees the ambulance and
// takes one trauma bed off the claiming hospital's count.
function advance_incident($conn, $incident, $newStatus, $actorType, $actorId) {
    if ($incident['status'] === 'CANCELLED') fail("The rider cancelled this request. They reported they're safe.", 409);
    if (($incident['assignment_status'] ?? null) !== 'ACCEPTED') {
        fail("The ambulance crew hasn't accepted this case yet.", 409);
    }
    if (status_index($newStatus) <= status_index($incident['status'])) {
        fail("Incident is already " . strtolower(str_replace('_', ' ', $incident['status'])) . ".", 409);
    }
    $now = now_ts();
    $fields = "status = ?, updated_at = ?";
    $params = [$newStatus, $now];
    if ($newStatus === 'ADMITTED') {
        $fields .= ", admitted_at = ?";
        $params[] = $now;
    }
    if (in_array($newStatus, ['AT_SCENE', 'PICKED_UP', 'ADMITTED'], true)) {
        $fields .= ", eta_minutes = 0";
    }
    $params[] = (int) $incident['id'];
    db_exec($conn, "UPDATE incidents SET $fields WHERE id = ?", $params);

    if ($newStatus === 'ADMITTED') {
        if (!empty($incident['ambulance_id'])) {
            db_exec($conn, "UPDATE ambulances SET status = 'available', current_incident_id = NULL WHERE id = ?", [(int) $incident['ambulance_id']]);
        }
        db_exec($conn, "UPDATE hospitals SET er_beds_free = GREATEST(er_beds_free - 1, 0) WHERE id = ?", [$incident['claimed_by_hospital_id']]);
    }
    add_event($conn, $incident['id'], $newStatus, $actorType, $actorId);
}

ensure_schema($conn);
