<?php
// Shared bootstrap for the account + dispatch APIs (auth.php, rider.php,
// hospital_dispatch_api.php, ambulance_api.php, log_accident.php).
//
// - Opens the MySQL connection via ../db_config.php
// - Creates the v2 tables on first run and seeds the demo network
// - Token auth: clients send "X-Auth-Token"; we store only its SHA-256.
//   (A header token instead of a PHP session cookie: the rider app runs as
//   a TWA/PWA and must keep working for weeks without re-login, and PHP's
//   session GC on XAMPP/shared hosting would silently log riders out.)

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, X-Auth-Token");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Content-Type: application/json; charset=utf-8");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    exit();
}

date_default_timezone_set('Asia/Kolkata');

require_once __DIR__ . '/../db_config.php';
$conn->set_charset('utf8mb4');

const SESSION_DAYS = 30;
const SCHEMA_VERSION = 'v2.2';
const DEMO_PASSWORD = 'demo1234';

// ================= Response helpers =================
function json_out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit();
}

function fail($message, $code = 400, $extra = []) {
    json_out(array_merge(["status" => "error", "message" => $message], $extra), $code);
}

function read_json() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '', true);
    return is_array($data) ? $data : $_POST;
}

function now_ts() {
    return date("Y-m-d H:i:s");
}

function str_in($input, $key, $max = 255) {
    $v = isset($input[$key]) ? trim((string) $input[$key]) : '';
    return mb_substr($v, 0, $max);
}

function normalize_phone($phone) {
    $digits = preg_replace('/[^0-9]/', '', (string) $phone);
    if (strlen($digits) === 10) return "91" . $digits;
    if (strlen($digits) === 11 && $digits[0] === "0") return "91" . substr($digits, 1);
    return $digits;
}

// Prepared-statement helpers. Types are inferred (i/d/s) from PHP values.
function db_query($conn, $sql, $params = []) {
    $stmt = $conn->prepare($sql);
    if (!$stmt) fail("Database error: " . $conn->error, 500);
    if ($params) {
        $types = '';
        foreach ($params as $p) {
            $types .= is_int($p) ? 'i' : (is_float($p) ? 'd' : 's');
        }
        $stmt->bind_param($types, ...$params);
    }
    if (!$stmt->execute()) fail("Database error: " . $stmt->error, 500);
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
    $stmt = db_query($conn, $sql, $params);
    return $stmt->affected_rows;
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

// ================= Schema =================
function ensure_schema($conn) {
    $flag = __DIR__ . '/../data/.schema_' . SCHEMA_VERSION;
    if (file_exists($flag)) return;

    $tables = [
        "CREATE TABLE IF NOT EXISTS `accident_logs` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `status` VARCHAR(50) NOT NULL,
            `tilt_angle` FLOAT NOT NULL,
            `roll_angle` FLOAT NOT NULL,
            `pitch_angle` FLOAT NOT NULL,
            `latitude` DECIMAL(10, 8) DEFAULT NULL,
            `longitude` DECIMAL(11, 8) DEFAULT NULL,
            `speed_kmh` FLOAT DEFAULT 0.0,
            `nearest_hospital` VARCHAR(255) DEFAULT 'Searching...',
            `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS `users` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `role` VARCHAR(16) NOT NULL,
            `name` VARCHAR(120) NOT NULL,
            `email` VARCHAR(190) NOT NULL UNIQUE,
            `phone` VARCHAR(20) DEFAULT NULL,
            `password_hash` VARCHAR(255) NOT NULL,
            `hospital_id` VARCHAR(40) DEFAULT NULL,
            `created_at` DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS `user_sessions` (
            `token_hash` CHAR(64) PRIMARY KEY,
            `user_id` INT NOT NULL,
            `expires_at` DATETIME NOT NULL,
            `created_at` DATETIME NOT NULL,
            INDEX (`user_id`)
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
            `status` VARCHAR(16) NOT NULL DEFAULT 'available',
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
        if (!$conn->query($sql)) fail("Schema setup failed: " . $conn->error, 500);
    }

    // Emergency contacts predate accounts; scope them per rider. Rows with
    // no user_id are the legacy shared list (used by signed-out devices).
    $conn->query("CREATE TABLE IF NOT EXISTS `emergency_contacts` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `user_id` INT DEFAULT NULL,
        `name` VARCHAR(100) NOT NULL,
        `phone` VARCHAR(20) NOT NULL,
        `is_primary` TINYINT(1) DEFAULT 0,
        `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
        `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX (`user_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $col = $conn->query("SHOW COLUMNS FROM `emergency_contacts` LIKE 'user_id'");
    if ($col && $col->num_rows === 0) {
        $conn->query("ALTER TABLE `emergency_contacts` ADD COLUMN `user_id` INT DEFAULT NULL AFTER `id`, ADD INDEX (`user_id`)");
    }

    $count = db_one($conn, "SELECT COUNT(*) AS n FROM hospitals");
    if ((int) $count['n'] === 0) seed_demo_network($conn);

    @mkdir(dirname($flag), 0777, true);
    @file_put_contents($flag, now_ts());
}

// Four Varanasi facilities, their ambulance fleets, and ready-to-use demo
// logins so judges can try every role without signing up.
function seed_demo_network($conn) {
    $now = now_ts();
    $hash = password_hash(DEMO_PASSWORD, PASSWORD_DEFAULT);

    $hospitals = [
        ["bhu", "Sir Sunderlal Hospital (BHU Trauma Centre)", "Sir Sunderlal Hospital", "BHU Campus, Lanka", "Varanasi", 25.2750, 82.9990, "+915422367568", 7, 20],
        ["apex", "Apex Super Speciality Hospital", "Apex Super Speciality", "Mahmoorganj", "Varanasi", 25.2890, 82.9810, "+915422224000", 12, 24],
        ["heritage", "Heritage Hospitals & Trauma Center", "Heritage Hospitals", "Lanka", "Varanasi", 25.2980, 83.0050, "+915422368888", 5, 16],
        ["apollo", "Apollo 24/7 Emergency", "Apollo Emergency", "Sigra", "Varanasi", 25.3200, 82.9900, "+915422500000", 18, 30],
    ];
    foreach ($hospitals as $h) {
        db_exec($conn, "INSERT INTO hospitals (id, name, short_name, area, city, latitude, longitude, phone, email, er_beds_free, er_beds_total, created_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            [$h[0], $h[1], $h[2], $h[3], $h[4], $h[5], $h[6], $h[7], "{$h[0]}@accidiox.demo", $h[8], $h[9], $now]);
        db_exec($conn, "INSERT INTO users (role, name, email, phone, password_hash, hospital_id, created_at) VALUES ('hospital',?,?,?,?,?,?)",
            ["{$h[2]} Emergency Desk", "{$h[0]}@accidiox.demo", $h[7], $hash, $h[0], $now]);
    }

    // [hospital, unit, type, vehicle, crew name, crew phone, has login]
    $fleet = [
        ["bhu", "ALS-04", "ALS", "UP65 AT 1042", "Ravi Kumar", "+917086249545", true],
        ["bhu", "TRU-07", "TRAUMA", "UP65 AT 1107", "Sanjay Yadav", "+917086249545", false],
        ["bhu", "BLS-02", "BLS", "UP65 AT 1002", "Mohit Singh", "+917086249545", false],
        ["apex", "ALS-01", "ALS", "UP65 CK 2201", "Imran Ali", "+917086249545", true],
        ["apex", "BLS-05", "BLS", "UP65 CK 2205", "Deepak Maurya", "+917086249545", false],
        ["heritage", "ALS-03", "ALS", "UP65 HT 3303", "Arvind Patel", "+917086249545", false],
        ["heritage", "BLS-08", "BLS", "UP65 HT 3308", "Suresh Gupta", "+917086249545", false],
        ["apollo", "ALS-11", "ALS", "UP65 AP 4411", "Vikas Mishra", "+917086249545", false],
        ["apollo", "TRU-12", "TRAUMA", "UP65 AP 4412", "Nitin Rai", "+917086249545", false],
    ];
    $coords = [];
    foreach ($hospitals as $h) $coords[$h[0]] = [$h[5], $h[6]];

    foreach ($fleet as $a) {
        $crewId = null;
        if ($a[6]) {
            $email = strtolower(str_replace('-', '', $a[1])) . ".{$a[0]}@accidiox.demo";
            db_exec($conn, "INSERT INTO users (role, name, email, phone, password_hash, hospital_id, created_at) VALUES ('ambulance',?,?,?,?,?,?)",
                [$a[4], $email, $a[5], $hash, $a[0], $now]);
            $crewId = $conn->insert_id;
        }
        db_exec($conn, "INSERT INTO ambulances (hospital_id, unit_code, unit_type, vehicle_number, crew_user_id, crew_name, crew_phone, status, latitude, longitude)
                        VALUES (?,?,?,?,?,?,?,'available',?,?)",
            [$a[0], $a[1], $a[2], $a[3], $crewId, $a[4], $a[5], $coords[$a[0]][0], $coords[$a[0]][1]]);
    }

    db_exec($conn, "INSERT INTO users (role, name, email, phone, password_hash, created_at) VALUES ('rider',?,?,?,?,?)",
        ["Rohan Sharma", "rider@accidiox.demo", "917086249545", $hash, $now]);
    $riderId = $conn->insert_id;
    db_exec($conn, "INSERT INTO rider_profiles (user_id, full_name, phone, date_of_birth, gender, blood_group, allergies, conditions,
                    emergency_name, emergency_phone, emergency_relation, vehicle_number, vehicle_model, completed_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [$riderId, "Rohan Sharma", "917086249545", "2002-04-18", "Male", "O+", "Penicillin", "None",
         "Rajesh Sharma", "917086249545", "Father", "UP65 EX 4521", "Honda Activa 6G", $now, $now]);
}

// ================= Auth =================
function issue_session($conn, $userId) {
    $token = bin2hex(random_bytes(32));
    db_exec($conn, "INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)",
        [hash('sha256', $token), (int) $userId, date("Y-m-d H:i:s", time() + SESSION_DAYS * 86400), now_ts()]);
    return $token;
}

function request_token() {
    $t = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if (!$t && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strcasecmp($k, 'X-Auth-Token') === 0) $t = $v;
        }
    }
    return preg_match('/^[a-f0-9]{64}$/', $t) ? $t : null;
}

function current_user($conn) {
    $token = request_token();
    if (!$token) return null;
    return db_one($conn,
        "SELECT u.id, u.role, u.name, u.email, u.phone, u.hospital_id
         FROM user_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?",
        [hash('sha256', $token), now_ts()]);
}

function require_role($conn, $role) {
    $user = current_user($conn);
    if (!$user) fail("Please sign in again.", 401, ["code" => "unauthenticated"]);
    if ($user['role'] !== $role) fail("This account can't access this area.", 403, ["code" => "wrong_role"]);
    return $user;
}

// ================= Incidents =================
function add_event($conn, $incidentId, $status, $actorType, $actorId = null, $note = null) {
    db_exec($conn, "INSERT INTO incident_events (incident_id, status, actor_type, actor_id, note, created_at) VALUES (?,?,?,?,?,?)",
        [(int) $incidentId, $status, $actorType, $actorId === null ? null : (string) $actorId, $note, now_ts()]);
}

function nearest_hospitals($conn, $lat, $lon, $limit = 3) {
    $rows = db_all($conn, "SELECT id, name, short_name, latitude, longitude FROM hospitals");
    foreach ($rows as &$h) {
        $h['distance_km'] = haversine_km($lat, $lon, (float) $h['latitude'], (float) $h['longitude']);
    }
    unset($h);
    usort($rows, fn($a, $b) => $a['distance_km'] <=> $b['distance_km']);
    return array_slice($rows, 0, $limit);
}

// Creates the incident, snapshots the rider's medical profile onto it (so
// the record stays accurate even if the profile is edited later), and
// alerts the three nearest registered hospitals.
function create_incident($conn, $data) {
    $now = now_ts();
    $profile = null;
    if (!empty($data['rider_user_id'])) {
        $profile = db_one($conn, "SELECT * FROM rider_profiles WHERE user_id = ?", [(int) $data['rider_user_id']]);
    }
    $p = $profile ?: ($data['profile'] ?? []);

    $notes = trim(implode(' · ', array_filter([
        !empty($p['allergies']) && strcasecmp($p['allergies'], 'none') !== 0 ? "Allergies: {$p['allergies']}" : null,
        !empty($p['conditions']) && strcasecmp($p['conditions'], 'none') !== 0 ? "Conditions: {$p['conditions']}" : null,
    ])));
    $contact = !empty($p['emergency_phone'])
        ? trim(($p['emergency_name'] ?? '') . ' · +' . ltrim($p['emergency_phone'], '+') . (!empty($p['emergency_relation']) ? " ({$p['emergency_relation']})" : ''), ' ·')
        : null;

    db_exec($conn, "INSERT INTO incidents (accident_log_id, rider_user_id, rider_name, rider_phone, blood_group, medical_notes, emergency_contact,
                    vehicle_number, location_name, latitude, longitude, speed_kmh, tilt_angle, roll_angle, pitch_angle, impact_g,
                    status, is_simulated, created_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'UNCLAIMED',?,?,?)",
        [
            isset($data['accident_log_id']) ? (int) $data['accident_log_id'] : null,
            !empty($data['rider_user_id']) ? (int) $data['rider_user_id'] : null,
            $p['full_name'] ?? 'Unregistered rider',
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
            !empty($data['is_simulated']) ? 1 : 0,
            $now, $now
        ]);
    $incidentId = $conn->insert_id;

    add_event($conn, $incidentId, 'REPORTED', 'system', null, 'Crash confirmed by black box after 10 s hold + 20 s rider window');

    $alerted = nearest_hospitals($conn, (float) $data['latitude'], (float) $data['longitude'], 3);
    foreach ($alerted as $i => $h) {
        db_exec($conn, "INSERT INTO incident_alerts (incident_id, hospital_id, alert_rank, distance_km, notified_at) VALUES (?,?,?,?,?)",
            [$incidentId, $h['id'], $i + 1, round($h['distance_km'], 2), $now]);
    }
    if ($alerted) {
        add_event($conn, $incidentId, 'ALERTED', 'system', null,
            'Alert sent to ' . implode(', ', array_map(fn($h) => $h['short_name'], $alerted)));
    }
    return $incidentId;
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

    $out = [
        "id" => $id,
        "status" => "CONFIRMED_CRASH",
        "dispatch_status" => $row['status'],
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
        "ambulance_position" => $amb && $amb['last_seen'] ? [
            "latitude" => (float) $amb['latitude'], "longitude" => (float) $amb['longitude'],
            "speed_kmh" => (float) $amb['speed_kmh'], "last_seen" => $amb['last_seen'],
        ] : null,
        "eta_minutes" => $row['eta_minutes'] !== null ? (int) $row['eta_minutes'] : null,
        "dispatch_timestamp" => $row['dispatched_at'],
        "admitted_at" => $row['admitted_at'],
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
        "is_simulated" => (int) $row['is_simulated'] === 1,
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
