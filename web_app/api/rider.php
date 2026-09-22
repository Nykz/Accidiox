<?php
// Rider-side account data. Every call is scoped to the signed-in rider.
//   GET  ?action=profile          medical profile
//   POST ?action=save_profile     onboarding / edit profile
//   GET  ?action=active_incident  latest crash + who is responding
//   GET  ?action=history          every past emergency, newest first
require_once __DIR__ . '/lib/bootstrap.php';

$user = require_role($conn, 'rider');
$uid = (int) $user['id'];
$action = $_GET['action'] ?? '';

if ($action === 'profile') {
    json_out(["status" => "success", "profile" => db_one($conn, "SELECT * FROM rider_profiles WHERE user_id = ?", [$uid])]);
}

if ($action === 'save_profile') {
    require_post();
    $in = read_json();
    $fullName = str_in($in, 'full_name', 120);
    $phone = normalize_phone(str_in($in, 'phone', 20));
    $blood = strtoupper(str_in($in, 'blood_group', 8));
    $dob = str_in($in, 'date_of_birth', 10);
    $emName = str_in($in, 'emergency_name', 120);
    $emPhone = normalize_phone(str_in($in, 'emergency_phone', 20));
    $gender = str_in($in, 'gender', 16);

    if (mb_strlen($fullName) < 2) fail("Please enter your full name.", 422, ["field" => "full_name"]);
    if (strlen($phone) < 10) fail("Please enter a valid phone number.", 422, ["field" => "phone"]);
    if (!in_array($blood, BLOOD_GROUPS, true)) fail("Please choose your blood group.", 422, ["field" => "blood_group"]);
    if ($dob && (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dob) || strtotime($dob) === false || strtotime($dob) > time())) {
        fail("Please enter a valid date of birth.", 422, ["field" => "date_of_birth"]);
    }
    if (!in_array($gender, ['', 'Male', 'Female', 'Other'], true)) $gender = '';
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
        [$uid, $fullName, $phone, $dob ?: null, $gender ?: null, $blood,
         str_in($in, 'allergies', 255) ?: null, str_in($in, 'conditions', 255) ?: null,
         $emName, $emPhone, str_in($in, 'emergency_relation', 40) ?: null,
         strtoupper(str_in($in, 'vehicle_number', 20)) ?: null, str_in($in, 'vehicle_model', 60) ?: null, $now, $now]);

    db_exec($conn, "UPDATE users SET name = ?, phone = ? WHERE id = ?", [$fullName, $phone, $uid]);
    json_out(["status" => "success", "profile" => db_one($conn, "SELECT * FROM rider_profiles WHERE user_id = ?", [$uid])]);
}

if ($action === 'active_incident') {
    expire_stale_assignments($conn);
    // Latest crash in the last 6 hours.
    $row = db_one($conn, "SELECT * FROM incidents WHERE rider_user_id = ? AND created_at > ? ORDER BY id DESC LIMIT 1",
        [$uid, ts_ago(6 * 3600)]);
    json_out(["status" => "success", "incident" => $row ? rider_view(incident_payload($conn, $row)) : null, "server_time" => now_ts()]);
}

// The rider got help before the ambulance arrived (a nearby clinic, a
// medical shop, people nearby) and says they're safe. Stops the search,
// frees any assigned ambulance and records their answers.
//   POST { incident_id, condition: fine|minor|hurt, treatment: clinic|helped|hospital|none }
if ($action === 'cancel_incident') {
    require_post();
    $in = read_json();
    $incidentId = (int) ($in['incident_id'] ?? 0);
    $condition = str_in($in, 'condition', 16);
    $treatment = str_in($in, 'treatment', 16);
    if (!isset(CANCEL_CONDITION[$condition])) fail("Tell us how you're feeling.", 422, ["field" => "condition"]);
    if (!isset(CANCEL_TREATMENT[$treatment])) fail("Tell us whether you've been treated.", 422, ["field" => "treatment"]);
    // Safety: someone who is hurt and untreated keeps the ambulance coming.
    if ($condition === 'hurt' && $treatment === 'none') {
        fail("You said you're hurt and haven't been treated, so we're keeping help on the way.", 422, ["code" => "keep_help"]);
    }

    $inc = db_one($conn, "SELECT * FROM incidents WHERE id = ? AND rider_user_id = ?", [$incidentId, $uid]);
    if (!$inc) fail("Emergency not found.", 404);
    if (in_array($inc['status'], ['AT_SCENE', 'PICKED_UP', 'ADMITTED', 'CANCELLED'], true)) {
        fail($inc['status'] === 'CANCELLED' ? "This request is already cancelled." : "The ambulance crew is already with you.", 409);
    }

    $now = now_ts();
    $ok = db_exec($conn, "UPDATE incidents SET status = 'CANCELLED', assignment_status = IF(assignment_status IS NULL, NULL, 'CANCELLED'),
                          eta_minutes = NULL, cancelled_at = ?, cancel_condition = ?, cancel_treatment = ?, updated_at = ?
                          WHERE id = ? AND rider_user_id = ? AND status IN ('UNCLAIMED', 'DISPATCHED', 'EN_ROUTE')",
        [$now, $condition, $treatment, $now, $incidentId, $uid]);
    if ($ok !== 1) fail("This request can no longer be cancelled.", 409);

    // Free the ambulance straight away for the next emergency.
    if (!empty($inc['ambulance_id'])) {
        db_exec($conn, "UPDATE ambulances SET status = IF(status = 'assigned', 'available', status), current_incident_id = NULL
                        WHERE id = ? AND current_incident_id = ?", [(int) $inc['ambulance_id'], $incidentId]);
    }
    add_event($conn, $incidentId, 'CANCELLED', 'rider', null, CANCEL_CONDITION[$condition] . ' · ' . CANCEL_TREATMENT[$treatment]);

    $row = db_one($conn, "SELECT * FROM incidents WHERE id = ?", [$incidentId]);
    json_out(["status" => "success", "incident" => rider_view(incident_payload($conn, $row))]);
}

if ($action === 'history') {
    $rows = db_all($conn, "SELECT * FROM incidents WHERE rider_user_id = ? ORDER BY id DESC LIMIT 50", [$uid]);
    json_out(["status" => "success", "history" => array_map(fn($r) => rider_view(incident_payload($conn, $r)), $rows)]);
}

fail("Unknown action.");

// Riders see who helped them, not the internal dispatch details of other hospitals.
function rider_view($p) {
    $p['timeline'] = array_values(array_filter($p['timeline'] ?? [], fn($e) => in_array($e['status'],
        ['REPORTED', 'ALERTED', 'DISPATCHED', 'ACCEPTED', 'EN_ROUTE', 'AT_SCENE', 'PICKED_UP', 'ADMITTED', 'CANCELLED'], true)));
    foreach ($p['timeline'] as &$e) { unset($e['by']); }
    return $p;
}
