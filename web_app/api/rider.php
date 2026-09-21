<?php
// Rider-side account data.
//   GET  ?action=profile          -> medical profile
//   POST ?action=save_profile     -> onboarding / edit profile
//   GET  ?action=active_incident  -> the rider's latest crash + who is responding
require_once __DIR__ . '/lib/bootstrap.php';

$user = require_role($conn, 'rider');
$action = $_GET['action'] ?? '';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

if ($action === 'profile') {
    json_out(["status" => "success", "profile" => db_one($conn, "SELECT * FROM rider_profiles WHERE user_id = ?", [(int) $user['id']])]);
}

if ($action === 'save_profile') {
    $in = read_json();
    $fullName = str_in($in, 'full_name', 120);
    $phone = normalize_phone(str_in($in, 'phone', 20));
    $blood = strtoupper(str_in($in, 'blood_group', 8));
    $dob = str_in($in, 'date_of_birth', 10);
    $emName = str_in($in, 'emergency_name', 120);
    $emPhone = normalize_phone(str_in($in, 'emergency_phone', 20));

    if (mb_strlen($fullName) < 2) fail("Please enter your full name.", 422, ["field" => "full_name"]);
    if (strlen($phone) < 10) fail("Please enter a valid phone number.", 422, ["field" => "phone"]);
    if (!in_array($blood, BLOOD_GROUPS, true)) fail("Please choose your blood group.", 422, ["field" => "blood_group"]);
    if ($dob && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dob)) fail("Please enter a valid date of birth.", 422, ["field" => "date_of_birth"]);
    if (mb_strlen($emName) < 2) fail("Add an emergency contact name.", 422, ["field" => "emergency_name"]);
    if (strlen($emPhone) < 10) fail("Add a valid emergency contact number.", 422, ["field" => "emergency_phone"]);

    $now = now_ts();
    db_exec($conn, "INSERT INTO rider_profiles (user_id, full_name, phone, date_of_birth, gender, blood_group, allergies, conditions,
                    emergency_name, emergency_phone, emergency_relation, vehicle_number, vehicle_model, completed_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), phone = VALUES(phone), date_of_birth = VALUES(date_of_birth),
                    gender = VALUES(gender), blood_group = VALUES(blood_group), allergies = VALUES(allergies), conditions = VALUES(conditions),
                    emergency_name = VALUES(emergency_name), emergency_phone = VALUES(emergency_phone), emergency_relation = VALUES(emergency_relation),
                    vehicle_number = VALUES(vehicle_number), vehicle_model = VALUES(vehicle_model),
                    completed_at = COALESCE(completed_at, VALUES(completed_at)), updated_at = VALUES(updated_at)",
        [(int) $user['id'], $fullName, $phone, $dob ?: null, str_in($in, 'gender', 16) ?: null, $blood,
         str_in($in, 'allergies', 255) ?: null, str_in($in, 'conditions', 255) ?: null,
         $emName, $emPhone, str_in($in, 'emergency_relation', 40) ?: null,
         strtoupper(str_in($in, 'vehicle_number', 20)) ?: null, str_in($in, 'vehicle_model', 60) ?: null, $now, $now]);

    db_exec($conn, "UPDATE users SET name = ?, phone = ? WHERE id = ?", [$fullName, $phone, (int) $user['id']]);
    json_out(["status" => "success", "profile" => db_one($conn, "SELECT * FROM rider_profiles WHERE user_id = ?", [(int) $user['id']])]);
}

if ($action === 'active_incident') {
    // Latest crash in the last 6 hours that hasn't been closed out for long.
    $row = db_one($conn, "SELECT * FROM incidents WHERE rider_user_id = ? AND created_at > ? ORDER BY id DESC LIMIT 1",
        [(int) $user['id'], date("Y-m-d H:i:s", time() - 6 * 3600)]);
    json_out([
        "status" => "success",
        "incident" => $row ? incident_payload($conn, $row) : null,
        "server_time" => now_ts(),
    ]);
}

fail("Unknown action.");
