<?php
// Accounts for the three Accidiox apps. Each app has its own accounts: the
// same email can hold a rider, a hospital and a crew account, and signing
// in to one never opens another.
//   POST ?action=register         { role, name, email, password, phone, ...role fields }
//   POST ?action=login            { role, email, password }
//   POST ?action=logout
//   GET  ?action=me
//   GET  ?action=hospitals        verified hospitals, for the crew sign-up form
//   POST ?action=forgot_password  { role, email }   emails a reset link
//   POST ?action=reset_password   { token, password }
require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/mailer.php';

$action = $_GET['action'] ?? '';
const ROLES = ['rider', 'hospital', 'ambulance'];
const ROLE_APP = ['rider' => 'Accidiox rider app', 'hospital' => 'Accidiox hospital console', 'ambulance' => 'Accidiox Crew app'];

function role_in($in) {
    $role = str_in($in, 'role', 16);
    if (!in_array($role, ROLES, true)) fail("Unknown account type.");
    return $role;
}

function password_problem($password) {
    if (strlen($password) < 8) return "Password must be at least 8 characters.";
    if (strlen($password) > 128) return "Password is too long.";
    if (!preg_match('/[A-Za-z]/', $password) || !preg_match('/[0-9]/', $password)) return "Use at least one letter and one number in your password.";
    return null;
}

if ($action === 'hospitals') {
    rate_limit($conn, "hosplist:" . client_ip(), 60, 600);
    json_out(["status" => "success", "hospitals" => db_all($conn,
        "SELECT id, short_name AS name, city FROM hospitals WHERE verified = 1 ORDER BY city, short_name")]);
}

if ($action === 'register') {
    require_post();
    $in = read_json();
    $role = role_in($in);
    rate_limit($conn, "register:" . client_ip(), 10, 3600, "Too many sign-ups from this network. Please try again later.");

    $name = str_in($in, 'name', 120);
    $email = strtolower(str_in($in, 'email', 190));
    $password = is_string($in['password'] ?? null) ? $in['password'] : '';
    $phone = normalize_phone(str_in($in, 'phone', 20));

    if (mb_strlen($name) < 2) fail("Please enter your name.", 422, ["field" => "name"]);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail("Please enter a valid email address.", 422, ["field" => "email"]);
    if ($problem = password_problem($password)) fail($problem, 422, ["field" => "password"]);
    if (strlen($phone) < 10) fail("Please enter a valid phone number.", 422, ["field" => "phone"]);
    if (db_one($conn, "SELECT id FROM users WHERE role = ? AND email = ?", [$role, $email])) {
        fail("An account with this email already exists. Try signing in.", 409, ["field" => "email"]);
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $now = now_ts();
    $hospitalId = null;
    $existing = null;

    if ($role === 'hospital') {
        $hospName = str_in($in, 'hospital_name', 160);
        $city = str_in($in, 'city', 80);
        $area = str_in($in, 'area', 160);
        $lat = isset($in['latitude']) && is_numeric($in['latitude']) ? (float) $in['latitude'] : null;
        $lon = isset($in['longitude']) && is_numeric($in['longitude']) ? (float) $in['longitude'] : null;
        $beds = max(0, min(999, (int) ($in['er_beds'] ?? 0)));
        if (mb_strlen($hospName) < 3) fail("Please enter the hospital name.", 422, ["field" => "hospital_name"]);
        if (!valid_coords($lat, $lon)) fail("Set the hospital location so crashes can be routed to you.", 422, ["field" => "location"]);
        $slug = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($hospName)), '-') ?: 'hospital';
        $hospitalId = substr($slug, 0, 30) . '-' . bin2hex(random_bytes(3));
        $short = mb_substr(trim(preg_replace('/\s*\(.*\)\s*/', ' ', $hospName)), 0, 60);
        db_exec($conn, "INSERT INTO hospitals (id, name, short_name, area, city, latitude, longitude, phone, email, er_beds_free, er_beds_total, verified, created_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?)",
            [$hospitalId, $hospName, $short, $area ?: null, $city ?: null, $lat, $lon, $phone, $email, $beds, $beds, $now]);
    }

    if ($role === 'ambulance') {
        $hospitalId = str_in($in, 'hospital_id', 40);
        $unit = strtoupper(preg_replace('/[^A-Za-z0-9-]/', '', str_in($in, 'unit_code', 20)));
        $type = strtoupper(str_in($in, 'unit_type', 10));
        $vehicle = strtoupper(str_in($in, 'vehicle_number', 20));
        if (!db_one($conn, "SELECT id FROM hospitals WHERE id = ? AND verified = 1", [$hospitalId])) fail("Choose your hospital.", 422, ["field" => "hospital_id"]);
        if (strlen($unit) < 2) fail("Enter your ambulance unit code, e.g. ALS-04.", 422, ["field" => "unit_code"]);
        if (!in_array($type, ['ALS', 'BLS', 'TRAUMA'], true)) $type = 'BLS';
        $existing = db_one($conn, "SELECT id, crew_user_id FROM ambulances WHERE hospital_id = ? AND unit_code = ?", [$hospitalId, $unit]);
        if ($existing && $existing['crew_user_id']) fail("Unit $unit already has a crew account. Ask your hospital to remove it first.", 409, ["field" => "unit_code"]);
    }

    db_exec($conn, "INSERT INTO users (role, name, email, phone, password_hash, hospital_id, created_at) VALUES (?,?,?,?,?,?,?)",
        [$role, $name, $email, $phone, $hash, $hospitalId, $now]);
    $userId = $conn->insert_id;

    if ($role === 'ambulance') {
        // New crews wait for their hospital to approve them before they can
        // receive any patient data.
        if ($existing) {
            db_exec($conn, "UPDATE ambulances SET crew_user_id = ?, crew_name = ?, crew_phone = ?, unit_type = ?, approved = 0, status = 'offline',
                            vehicle_number = COALESCE(NULLIF(?, ''), vehicle_number) WHERE id = ?",
                [$userId, $name, $phone, $type, $vehicle, (int) $existing['id']]);
        } else {
            $h = db_one($conn, "SELECT latitude, longitude FROM hospitals WHERE id = ?", [$hospitalId]);
            db_exec($conn, "INSERT INTO ambulances (hospital_id, unit_code, unit_type, vehicle_number, crew_user_id, crew_name, crew_phone, approved, status, latitude, longitude)
                            VALUES (?,?,?,?,?,?,?,0,'offline',?,?)",
                [$hospitalId, $unit, $type, $vehicle ?: null, $userId, $name, $phone, (float) $h['latitude'], (float) $h['longitude']]);
        }
    }

    $token = issue_session($conn, $userId, $role);
    json_out(["status" => "success", "token" => $token, "user" => me_payload($conn, $userId)]);
}

if ($action === 'login') {
    require_post();
    $in = read_json();
    $role = role_in($in);
    $email = strtolower(str_in($in, 'email', 190));
    $password = is_string($in['password'] ?? null) ? $in['password'] : '';

    // Brute-force protection: per account and per network.
    $acctKey = "loginfail:$role:$email";
    $ipKey = "loginfail-ip:" . client_ip();
    if (rate_count($conn, $acctKey, 900) >= 5 || rate_count($conn, $ipKey, 900) >= 30) {
        fail("Too many failed attempts. Wait 15 minutes or reset your password.", 429);
    }

    $user = db_one($conn, "SELECT id, password_hash FROM users WHERE role = ? AND email = ?", [$role, $email]);
    // Verify against a dummy hash when the account doesn't exist, so response
    // time doesn't reveal which emails are registered.
    $hash = $user ? $user['password_hash'] : '$2y$10$A/333Og3AzOF25PTdnQKf.x/xzBC9WaQEo9tWHF9QDA/geFikg7iS';
    if (!password_verify($password, $hash) || !$user) {
        rate_hit($conn, $acctKey);
        rate_hit($conn, $ipKey);
        fail("Email or password is incorrect.", 401, ["field" => "password"]);
    }
    if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
        db_exec($conn, "UPDATE users SET password_hash = ? WHERE id = ?", [password_hash($password, PASSWORD_DEFAULT), (int) $user['id']]);
    }
    $token = issue_session($conn, $user['id'], $role);
    json_out(["status" => "success", "token" => $token, "user" => me_payload($conn, $user['id'])]);
}

if ($action === 'logout') {
    require_post();
    $token = request_token();
    if ($token) db_exec($conn, "DELETE FROM user_sessions WHERE token_hash = ?", [hash('sha256', $token)]);
    json_out(["status" => "success"]);
}

if ($action === 'me') {
    $user = current_user($conn);
    if (!$user) fail("Not signed in.", 401, ["code" => "unauthenticated"]);
    json_out(["status" => "success", "user" => me_payload($conn, $user['id'])]);
}

if ($action === 'forgot_password') {
    require_post();
    $in = read_json();
    $role = role_in($in);
    $email = strtolower(str_in($in, 'email', 190));
    $generic = ["status" => "success", "message" => "If an account exists for that email, a reset link is on its way. Check your inbox and spam folder."];
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail("Please enter a valid email address.", 422, ["field" => "email"]);

    rate_limit($conn, "forgot-ip:" . client_ip(), 10, 3600, "Too many reset requests. Please try again later.");
    if (rate_count($conn, "forgot:$role:$email", 3600) >= 3) json_out($generic);
    rate_hit($conn, "forgot:$role:$email");

    $user = db_one($conn, "SELECT id, name FROM users WHERE role = ? AND email = ?", [$role, $email]);
    // Answer first, send afterwards: a slow mail server must not reveal
    // (by response time) which emails have accounts.
    respond_now($generic);
    if ($user) {
        $token = bin2hex(random_bytes(32));
        db_exec($conn, "UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL", [now_ts(), (int) $user['id']]);
        db_exec($conn, "INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)",
            [hash('sha256', $token), (int) $user['id'], date("Y-m-d H:i:s", time() + 1800), now_ts()]);
        $link = app_base_url() . "/auth.html?role=$role&reset=$token";
        $body = "<p>Hi " . htmlspecialchars($user['name'], ENT_QUOTES, 'UTF-8') . ",</p>"
              . "<p>We received a request to reset the password for your " . ROLE_APP[$role] . " account.</p>"
              . "<p>This link works once and expires in <strong>30 minutes</strong>. If you didn't ask for this, ignore this email; your password stays the same.</p>";
        $sent = send_mail($email, "Reset your Accidiox password", email_layout("Reset your password", $body, "Choose a new password", $link));
        if (!$sent['ok']) error_log("[Accidiox] reset mail to $email failed: " . $sent['detail']);
    }
    exit();
}

if ($action === 'reset_password') {
    require_post();
    $in = read_json();
    $token = str_in($in, 'token', 64);
    $password = is_string($in['password'] ?? null) ? $in['password'] : '';
    rate_limit($conn, "reset-ip:" . client_ip(), 20, 3600);
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) fail("This reset link is invalid. Request a new one.", 400);
    if ($problem = password_problem($password)) fail($problem, 422, ["field" => "password"]);

    $row = db_one($conn, "SELECT r.user_id, u.role FROM password_resets r JOIN users u ON u.id = r.user_id
                          WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ?", [hash('sha256', $token), now_ts()]);
    if (!$row) fail("This reset link has expired or was already used. Request a new one.", 400);

    db_exec($conn, "UPDATE users SET password_hash = ? WHERE id = ?", [password_hash($password, PASSWORD_DEFAULT), (int) $row['user_id']]);
    db_exec($conn, "UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL", [now_ts(), (int) $row['user_id']]);
    // Sign out every device that used the old password.
    db_exec($conn, "DELETE FROM user_sessions WHERE user_id = ?", [(int) $row['user_id']]);
    json_out(["status" => "success", "role" => $row['role'], "message" => "Password updated. Sign in with your new password."]);
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
        $out['hospital'] = db_one($conn, "SELECT id, name, short_name, area, city, latitude, longitude, phone, verified FROM hospitals WHERE id = ?", [$u['hospital_id']]);
    }
    if ($u['role'] === 'ambulance') {
        $out['ambulance'] = db_one($conn, "SELECT id, unit_code, unit_type, vehicle_number, status, approved FROM ambulances WHERE crew_user_id = ?", [(int) $u['id']]);
    }
    return $out;
}
