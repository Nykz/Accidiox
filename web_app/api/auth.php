<?php
// Accounts for all three Accidiox roles: rider, hospital, ambulance crew.
//   POST ?action=register   { role, name, email, password, ...role fields }
//   POST ?action=login      { role, email, password }
//   POST ?action=logout
//   GET  ?action=me
//   GET  ?action=hospitals  (public list, for the ambulance crew sign-up form)
require_once __DIR__ . '/lib/bootstrap.php';

$action = $_GET['action'] ?? '';
$roles = ['rider', 'hospital', 'ambulance'];

if ($action === 'hospitals') {
    json_out(["status" => "success", "hospitals" => db_all($conn,
        "SELECT id, short_name AS name, city FROM hospitals ORDER BY city, short_name")]);
}

if ($action === 'register') {
    $in = read_json();
    $role = str_in($in, 'role', 16);
    $name = str_in($in, 'name', 120);
    $email = strtolower(str_in($in, 'email', 190));
    $password = (string) ($in['password'] ?? '');
    $phone = normalize_phone(str_in($in, 'phone', 20));

    if (!in_array($role, $roles, true)) fail("Unknown account type.");
    if (mb_strlen($name) < 2) fail("Please enter your name.", 422, ["field" => "name"]);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail("Please enter a valid email address.", 422, ["field" => "email"]);
    if (strlen($password) < 8) fail("Password must be at least 8 characters.", 422, ["field" => "password"]);
    if (strlen($phone) < 10) fail("Please enter a valid phone number.", 422, ["field" => "phone"]);
    if (db_one($conn, "SELECT id FROM users WHERE email = ?", [$email])) {
        fail("An account with this email already exists. Try signing in.", 409, ["field" => "email"]);
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $now = now_ts();
    $hospitalId = null;

    if ($role === 'hospital') {
        $hospName = str_in($in, 'hospital_name', 160);
        $city = str_in($in, 'city', 80);
        $area = str_in($in, 'area', 160);
        $lat = isset($in['latitude']) ? (float) $in['latitude'] : null;
        $lon = isset($in['longitude']) ? (float) $in['longitude'] : null;
        $beds = max(0, (int) ($in['er_beds'] ?? 0));
        if (mb_strlen($hospName) < 3) fail("Please enter the hospital name.", 422, ["field" => "hospital_name"]);
        if ($lat === null || $lon === null || abs($lat) > 90 || abs($lon) > 180 || ($lat == 0 && $lon == 0)) {
            fail("Set the hospital location so crashes can be routed to you.", 422, ["field" => "location"]);
        }
        $slug = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($hospName)), '-');
        $hospitalId = substr($slug, 0, 30) . '-' . bin2hex(random_bytes(2));
        $short = mb_substr(preg_replace('/\s*\(.*\)\s*/', '', $hospName), 0, 60);
        db_exec($conn, "INSERT INTO hospitals (id, name, short_name, area, city, latitude, longitude, phone, email, er_beds_free, er_beds_total, created_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            [$hospitalId, $hospName, $short, $area ?: null, $city ?: null, $lat, $lon, $phone, $email, $beds, $beds, $now]);
    }

    if ($role === 'ambulance') {
        $hospitalId = str_in($in, 'hospital_id', 40);
        $unit = strtoupper(preg_replace('/[^A-Za-z0-9-]/', '', str_in($in, 'unit_code', 20)));
        $type = strtoupper(str_in($in, 'unit_type', 10));
        $vehicle = strtoupper(str_in($in, 'vehicle_number', 20));
        if (!db_one($conn, "SELECT id FROM hospitals WHERE id = ?", [$hospitalId])) fail("Choose your hospital.", 422, ["field" => "hospital_id"]);
        if (strlen($unit) < 2) fail("Enter your ambulance unit code, e.g. ALS-04.", 422, ["field" => "unit_code"]);
        if (!in_array($type, ['ALS', 'BLS', 'TRAUMA'], true)) $type = 'BLS';
        $existing = db_one($conn, "SELECT id, crew_user_id FROM ambulances WHERE hospital_id = ? AND unit_code = ?", [$hospitalId, $unit]);
        if ($existing && $existing['crew_user_id']) fail("Unit $unit already has a crew account. Ask your hospital to reassign it.", 409, ["field" => "unit_code"]);
    }

    db_exec($conn, "INSERT INTO users (role, name, email, phone, password_hash, hospital_id, created_at) VALUES (?,?,?,?,?,?,?)",
        [$role, $name, $email, $phone, $hash, $hospitalId, $now]);
    $userId = $conn->insert_id;

    if ($role === 'ambulance') {
        if (!empty($existing)) {
            db_exec($conn, "UPDATE ambulances SET crew_user_id = ?, crew_name = ?, crew_phone = ?, unit_type = ?, vehicle_number = COALESCE(NULLIF(?, ''), vehicle_number) WHERE id = ?",
                [$userId, $name, $phone, $type, $vehicle, (int) $existing['id']]);
        } else {
            $h = db_one($conn, "SELECT latitude, longitude FROM hospitals WHERE id = ?", [$hospitalId]);
            db_exec($conn, "INSERT INTO ambulances (hospital_id, unit_code, unit_type, vehicle_number, crew_user_id, crew_name, crew_phone, status, latitude, longitude)
                            VALUES (?,?,?,?,?,?,?,'offline',?,?)",
                [$hospitalId, $unit, $type, $vehicle ?: null, $userId, $name, $phone, (float) $h['latitude'], (float) $h['longitude']]);
        }
    }

    $token = issue_session($conn, $userId);
    json_out(["status" => "success", "token" => $token, "user" => me_payload($conn, $userId)]);
}

if ($action === 'login') {
    $in = read_json();
    $role = str_in($in, 'role', 16);
    $email = strtolower(str_in($in, 'email', 190));
    $password = (string) ($in['password'] ?? '');

    $user = db_one($conn, "SELECT id, role, password_hash FROM users WHERE email = ?", [$email]);
    if (!$user || !password_verify($password, $user['password_hash'])) {
        fail("Email or password is incorrect.", 401, ["field" => "password"]);
    }
    if ($role && $user['role'] !== $role) {
        $where = ["rider" => "the Accidiox rider app", "hospital" => "the hospital console", "ambulance" => "the ambulance crew app"][$user['role']];
        fail("This is a {$user['role']} account. Sign in from $where instead.", 403, ["field" => "email"]);
    }
    $token = issue_session($conn, $user['id']);
    json_out(["status" => "success", "token" => $token, "user" => me_payload($conn, $user['id'])]);
}

if ($action === 'logout') {
    $token = request_token();
    if ($token) db_exec($conn, "DELETE FROM user_sessions WHERE token_hash = ?", [hash('sha256', $token)]);
    json_out(["status" => "success"]);
}

if ($action === 'me') {
    $user = current_user($conn);
    if (!$user) fail("Not signed in.", 401, ["code" => "unauthenticated"]);
    json_out(["status" => "success", "user" => me_payload($conn, $user['id'])]);
}

fail("Unknown action.");

function me_payload($conn, $userId) {
    $u = db_one($conn, "SELECT id, role, name, email, phone, hospital_id FROM users WHERE id = ?", [(int) $userId]);
    $out = ["id" => (int) $u['id'], "role" => $u['role'], "name" => $u['name'], "email" => $u['email'], "phone" => $u['phone']];

    if ($u['role'] === 'rider') {
        $p = db_one($conn, "SELECT * FROM rider_profiles WHERE user_id = ?", [(int) $u['id']]);
        $out['profile'] = $p;
        $out['onboarded'] = $p && $p['completed_at'] !== null;
    }
    if ($u['role'] === 'hospital' || $u['role'] === 'ambulance') {
        $out['hospital'] = db_one($conn, "SELECT id, name, short_name, area, city, latitude, longitude, phone FROM hospitals WHERE id = ?", [$u['hospital_id']]);
    }
    if ($u['role'] === 'ambulance') {
        $out['ambulance'] = db_one($conn, "SELECT id, unit_code, unit_type, vehicle_number, status FROM ambulances WHERE crew_user_id = ?", [(int) $u['id']]);
    }
    return $out;
}
