<?php
// Accidiox owner console (admin.html). Only the owner's admin account can
// use it. There is no public sign-up: the first admin account is created
// once with the setup key (the database password from db_config.php), and
// after that setup is closed for good.
//   GET  ?action=setup_status
//   POST ?action=setup              { setup_key, name, email, password }
//   POST ?action=login              { email, password }
//   POST ?action=logout
//   GET  ?action=overview           stats, open emergencies, hospitals, crews
//   POST ?action=resolve_incident   { incident_id, condition, treatment, note }
//   POST ?action=set_hospital       { hospital_id, verified: true|false }
//   POST ?action=free_unit          { ambulance_id }  case over, put the unit back on duty
//   POST ?action=set_crew           { ambulance_id, approved: true|false }
require_once __DIR__ . '/lib/bootstrap.php';

$ADMIN_SETUP_KEY = (string) ($password ?? '');
$action = $_GET['action'] ?? '';
if ($action !== 'setup_status' && $action !== 'overview') require_post();

// What support recorded after phoning the rider.
const ADMIN_CONDITION = CANCEL_CONDITION + ['false_alarm' => 'False alarm / test'];
const ADMIN_TREATMENT = CANCEL_TREATMENT + ['not_needed' => 'Not needed'];
const OPEN_STATUSES = ['UNCLAIMED', 'DISPATCHED', 'EN_ROUTE', 'AT_SCENE', 'PICKED_UP'];

function admin_exists($conn) {
    return (bool) db_one($conn, "SELECT id FROM users WHERE role = 'admin' LIMIT 1");
}

if ($action === 'setup_status') {
    json_out(["status" => "success", "needs_setup" => !admin_exists($conn)]);
}

if ($action === 'setup') {
    rate_limit($conn, "adminsetup:" . client_ip(), 5, 3600);
    if (admin_exists($conn)) fail("The owner account already exists. Please sign in.", 409);
    $in = read_json();
    $key = is_string($in['setup_key'] ?? null) ? $in['setup_key'] : '';
    if (strlen($ADMIN_SETUP_KEY) < 6 || !hash_equals($ADMIN_SETUP_KEY, $key)) fail("That setup key isn't right.", 403, ["field" => "setup_key"]);

    $name = str_in($in, 'name', 120);
    $email = strtolower(str_in($in, 'email', 190));
    $pass = is_string($in['password'] ?? null) ? $in['password'] : '';
    if (mb_strlen($name) < 2) fail("Please enter your name.", 422, ["field" => "name"]);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail("Please enter a valid email address.", 422, ["field" => "email"]);
    if (strlen($pass) < 10 || !preg_match('/[A-Za-z]/', $pass) || !preg_match('/[0-9]/', $pass)) {
        fail("Use at least 10 characters with letters and numbers.", 422, ["field" => "password"]);
    }
    db_exec($conn, "INSERT INTO users (role, name, email, phone, password_hash, hospital_id, created_at) VALUES ('admin',?,?,NULL,?,NULL,?)",
        [$name, $email, password_hash($pass, PASSWORD_DEFAULT), now_ts()]);
    $uid = $conn->insert_id;
    json_out(["status" => "success", "token" => issue_session($conn, $uid, 'admin'), "name" => $name]);
}

if ($action === 'login') {
    $in = read_json();
    $email = strtolower(str_in($in, 'email', 190));
    $pass = is_string($in['password'] ?? null) ? $in['password'] : '';
    if (rate_count($conn, "adminlogin:" . client_ip(), 900) >= 8) fail("Too many wrong attempts. Please wait 15 minutes.", 429);
    $u = db_one($conn, "SELECT id, name, password_hash FROM users WHERE role = 'admin' AND email = ?", [$email]);
    if (!$u || !password_verify($pass, $u['password_hash'])) {
        rate_hit($conn, "adminlogin:" . client_ip());
        fail("Wrong email or password.", 401);
    }
    json_out(["status" => "success", "token" => issue_session($conn, $u['id'], 'admin'), "name" => $u['name']]);
}

// Everything below needs the owner signed in.
$admin = require_role($conn, 'admin');

if ($action === 'logout') {
    $t = request_token();
    if ($t) db_exec($conn, "DELETE FROM user_sessions WHERE token_hash = ?", [hash('sha256', $t)]);
    json_out(["status" => "success"]);
}

if ($action === 'overview') {
    expire_stale_assignments($conn);
    $open = db_all($conn, "SELECT i.*, h.short_name AS hospital_name, a.unit_code
                           FROM incidents i
                           LEFT JOIN hospitals h ON h.id = i.claimed_by_hospital_id
                           LEFT JOIN ambulances a ON a.id = i.ambulance_id
                           WHERE i.status IN ('UNCLAIMED','DISPATCHED','EN_ROUTE','AT_SCENE','PICKED_UP')
                           ORDER BY i.id ASC LIMIT 200");
    $closed = db_all($conn, "SELECT i.id, i.rider_name, i.status, i.cancelled_by, i.cancel_condition, i.cancel_treatment, i.cancel_note,
                                    i.location_name, i.created_at, i.updated_at, h.short_name AS hospital_name
                             FROM incidents i LEFT JOIN hospitals h ON h.id = i.claimed_by_hospital_id
                             WHERE i.status IN ('ADMITTED','CANCELLED') ORDER BY i.updated_at DESC LIMIT 30");
    $hospitals = db_all($conn, "SELECT h.id, h.name, h.short_name, h.area, h.city, h.latitude, h.longitude, h.phone, h.email,
                                       h.er_beds_free, h.er_beds_total, h.verified, h.created_at,
                                       (SELECT u.name FROM users u WHERE u.role = 'hospital' AND u.hospital_id = h.id ORDER BY u.id LIMIT 1) AS contact_name,
                                       (SELECT COUNT(*) FROM ambulances a WHERE a.hospital_id = h.id) AS units
                                FROM hospitals h ORDER BY h.verified ASC, h.created_at DESC");
    $crews = db_all($conn, "SELECT a.id, a.unit_code, a.unit_type, a.vehicle_number, a.crew_name, a.crew_phone, a.approved, a.status,
                                   a.last_seen, a.current_incident_id, h.short_name AS hospital_name
                            FROM ambulances a LEFT JOIN hospitals h ON h.id = a.hospital_id
                            WHERE a.crew_user_id IS NOT NULL ORDER BY a.approved ASC, h.short_name, a.unit_code");
    $riders = db_one($conn, "SELECT COUNT(*) AS n FROM users WHERE role = 'rider'");

    $open = array_map(function ($r) {
        return [
            "id" => (int) $r['id'], "status" => $r['status'], "assignment_status" => $r['assignment_status'],
            "rider_name" => $r['rider_name'], "rider_phone" => $r['rider_phone'], "blood_group" => $r['blood_group'],
            "emergency_contact" => $r['emergency_contact'], "medical_notes" => $r['medical_notes'],
            "vehicle_number" => $r['vehicle_number'], "location_name" => $r['location_name'],
            "latitude" => (float) $r['latitude'], "longitude" => (float) $r['longitude'],
            "hospital_name" => $r['hospital_name'], "unit_code" => $r['unit_code'],
            "created_at" => $r['created_at'], "updated_at" => $r['updated_at'],
        ];
    }, $open);

    json_out([
        "status" => "success",
        "admin" => ["name" => $admin['name'], "email" => $admin['email']],
        "stats" => [
            "open" => count($open),
            "hospitals_pending" => count(array_filter($hospitals, fn($h) => !(int) $h['verified'])),
            "hospitals_verified" => count(array_filter($hospitals, fn($h) => (int) $h['verified'])),
            "crews_pending" => count(array_filter($crews, fn($c) => !(int) $c['approved'])),
            "crews_on_duty" => count(array_filter($crews, fn($c) => (int) $c['approved'] && in_array($c['status'], ['available', 'assigned'], true))),
            "riders" => (int) $riders['n'],
        ],
        "open" => $open,
        "closed" => $closed,
        "hospitals" => $hospitals,
        "crews" => $crews,
        "conditions" => ADMIN_CONDITION,
        "treatments" => ADMIN_TREATMENT,
        "server_time" => now_ts(),
    ]);
}

// Support phoned the rider (or their family) and confirmed they're safe.
// Closes the emergency everywhere: hospitals stop seeing it, any assigned
// ambulance is freed, and the rider app shows it as closed by support.
if ($action === 'resolve_incident') {
    $in = read_json();
    $id = (int) ($in['incident_id'] ?? 0);
    $condition = str_in($in, 'condition', 16);
    $treatment = str_in($in, 'treatment', 16);
    $note = str_in($in, 'note', 255);
    if (!isset(ADMIN_CONDITION[$condition])) fail("Choose how the rider is.", 422, ["field" => "condition"]);
    if (!isset(ADMIN_TREATMENT[$treatment])) fail("Choose what treatment they got.", 422, ["field" => "treatment"]);
    if ($condition === 'hurt' && $treatment === 'none') fail("The rider is hurt and untreated, so keep this emergency open.", 422);
    if (mb_strlen($note) < 3) fail("Add a short note on what the rider told you.", 422, ["field" => "note"]);

    $inc = db_one($conn, "SELECT * FROM incidents WHERE id = ?", [$id]);
    if (!$inc) fail("Emergency not found.", 404);
    if (!in_array($inc['status'], OPEN_STATUSES, true)) fail("This emergency is already closed.", 409);

    $now = now_ts();
    $ok = db_exec($conn, "UPDATE incidents SET status = 'CANCELLED', assignment_status = IF(assignment_status IS NULL, NULL, 'CANCELLED'),
                          eta_minutes = NULL, cancelled_at = ?, cancel_condition = ?, cancel_treatment = ?, cancelled_by = 'support',
                          cancel_note = ?, updated_at = ?
                          WHERE id = ? AND status IN ('UNCLAIMED','DISPATCHED','EN_ROUTE','AT_SCENE','PICKED_UP')",
        [$now, $condition, $treatment, $note, $now, $id]);
    if ($ok !== 1) fail("This emergency is already closed.", 409);
    if (!empty($inc['ambulance_id'])) {
        db_exec($conn, "UPDATE ambulances SET status = IF(status = 'assigned', 'available', status), current_incident_id = NULL
                        WHERE id = ? AND current_incident_id = ?", [(int) $inc['ambulance_id'], $id]);
    }
    add_event($conn, $id, 'CANCELLED', 'support', (string) $admin['id'], "Accidiox support: " . ADMIN_CONDITION[$condition] . " · " . ADMIN_TREATMENT[$treatment]);
    json_out(["status" => "success"]);
}

if ($action === 'set_hospital') {
    $in = read_json();
    $hid = str_in($in, 'hospital_id', 40);
    $v = !empty($in['verified']) ? 1 : 0;
    if (!db_one($conn, "SELECT id FROM hospitals WHERE id = ?", [$hid])) fail("Hospital not found.", 404);
    db_exec($conn, "UPDATE hospitals SET verified = ? WHERE id = ?", [$v, $hid]);
    json_out(["status" => "success"]);
}

if ($action === 'free_unit') {
    $in = read_json();
    $amb = db_one($conn, "SELECT * FROM ambulances WHERE id = ?", [(int) ($in['ambulance_id'] ?? 0)]);
    if (!$amb) fail("Ambulance not found.", 404);
    free_unit($conn, $amb);
    json_out(["status" => "success"]);
}

if ($action === 'set_crew') {
    $in = read_json();
    $aid = (int) ($in['ambulance_id'] ?? 0);
    $v = !empty($in['approved']) ? 1 : 0;
    $amb = db_one($conn, "SELECT id, status FROM ambulances WHERE id = ?", [$aid]);
    if (!$amb) fail("Ambulance not found.", 404);
    if (!$v && $amb['status'] === 'assigned') fail("This crew is on a case right now. Try again after it ends.", 409);
    db_exec($conn, "UPDATE ambulances SET approved = ?, status = IF(? = 0, 'offline', status) WHERE id = ?", [$v, $v, $aid]);
    json_out(["status" => "success"]);
}

fail("Unknown action.");
