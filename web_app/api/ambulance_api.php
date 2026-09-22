<?php
// Ambulance crew app API. Scoped to the unit linked to the signed-in crew
// account; a unit sees nothing until its hospital approves it.
//   GET  ?action=me             unit, hospital, current assignment
//   POST ?action=set_duty       { on_duty: bool }
//   POST ?action=location       { latitude, longitude, speed_kmh }
//   POST ?action=accept         accept the pending dispatch (within 60 s)
//   POST ?action=decline        hand it back to the hospital
//   POST ?action=update_status  { new_status: EN_ROUTE | AT_SCENE | PICKED_UP }
require_once __DIR__ . '/lib/bootstrap.php';

$user = require_role($conn, 'ambulance');
$amb = db_one($conn, "SELECT * FROM ambulances WHERE crew_user_id = ?", [(int) $user['id']]);
if (!$amb) fail("No ambulance unit is linked to this account.", 404);
$approved = (int) $amb['approved'] === 1;

$action = $_GET['action'] ?? 'me';
if ($action !== 'me') {
    require_post();
    if (!$approved) fail("Your hospital hasn't approved this unit yet.", 403);
}

function current_assignment($conn, $amb) {
    if (empty($amb['current_incident_id'])) return null;
    $row = db_one($conn, "SELECT * FROM incidents WHERE id = ? AND ambulance_id = ?", [(int) $amb['current_incident_id'], (int) $amb['id']]);
    return $row ? incident_payload($conn, $row) : null;
}

if ($action === 'me') {
    expire_stale_assignments($conn);
    $amb = db_one($conn, "SELECT * FROM ambulances WHERE id = ?", [(int) $amb['id']]);
    $hosp = db_one($conn, "SELECT id, name, short_name, area, city, latitude, longitude, phone FROM hospitals WHERE id = ?", [$amb['hospital_id']]);
    $done = db_one($conn, "SELECT COUNT(*) AS n FROM incidents WHERE ambulance_id = ? AND status = 'ADMITTED' AND admitted_at > ?",
        [(int) $amb['id'], date("Y-m-d 00:00:00")]);
    json_out([
        "status" => "success",
        "crew" => ["name" => $user['name'], "phone" => $user['phone'], "email" => $user['email']],
        "unit" => [
            "id" => (int) $amb['id'], "unit_code" => $amb['unit_code'], "unit_type" => $amb['unit_type'],
            "vehicle_number" => $amb['vehicle_number'], "status" => $amb['status'], "last_seen" => $amb['last_seen'],
            "approved" => (int) $amb['approved'] === 1,
        ],
        "hospital" => $hosp,
        "assignment" => (int) $amb['approved'] === 1 ? current_assignment($conn, $amb) : null,
        "accept_seconds" => ASSIGN_ACCEPT_SECONDS,
        // A case this unit was on that the rider just cancelled (they're safe).
        "recent_cancel" => db_one($conn, "SELECT id, cancel_condition, cancel_treatment, cancelled_by FROM incidents
                                  WHERE ambulance_id = ? AND status = 'CANCELLED' AND cancelled_at > ? ORDER BY id DESC LIMIT 1",
            [(int) $amb['id'], ts_ago(180)]),
        "completed_today" => (int) $done['n'],
        "server_time" => now_ts(),
    ]);
}

if ($action === 'set_duty') {
    $in = read_json();
    $onDuty = !empty($in['on_duty']);
    if (!$onDuty && $amb['status'] === 'assigned') fail("Finish the current case before going off duty.", 409);
    if ($amb['status'] !== 'assigned') {
        db_exec($conn, "UPDATE ambulances SET status = ? WHERE id = ?", [$onDuty ? 'available' : 'offline', (int) $amb['id']]);
    }
    json_out(["status" => "success"]);
}

if ($action === 'location') {
    rate_limit($conn, "loc:" . $amb['id'], 60, 60, "Too many location updates.");
    $in = read_json();
    $lat = isset($in['latitude']) && is_numeric($in['latitude']) ? (float) $in['latitude'] : null;
    $lon = isset($in['longitude']) && is_numeric($in['longitude']) ? (float) $in['longitude'] : null;
    if (!valid_coords($lat, $lon)) fail("Invalid coordinates.");
    $speed = max(0, min(250, (float) ($in['speed_kmh'] ?? 0)));
    db_exec($conn, "UPDATE ambulances SET latitude = ?, longitude = ?, speed_kmh = ?, last_seen = ? WHERE id = ?",
        [$lat, $lon, $speed, now_ts(), (int) $amb['id']]);

    // Live ETA: while heading to the scene, re-estimate from where the unit actually is.
    if (!empty($amb['current_incident_id'])) {
        $inc = db_one($conn, "SELECT id, status, assignment_status, latitude, longitude FROM incidents WHERE id = ? AND ambulance_id = ?",
            [(int) $amb['current_incident_id'], (int) $amb['id']]);
        if ($inc && $inc['assignment_status'] === 'ACCEPTED' && in_array($inc['status'], ['DISPATCHED', 'EN_ROUTE'], true)) {
            $eta = eta_minutes_for_km(haversine_km($lat, $lon, (float) $inc['latitude'], (float) $inc['longitude']));
            db_exec($conn, "UPDATE incidents SET eta_minutes = ? WHERE id = ?", [$eta, (int) $inc['id']]);
        }
    }
    json_out(["status" => "success"]);
}

function pending_incident($conn, $amb) {
    if (empty($amb['current_incident_id'])) fail("No active assignment.", 404);
    $inc = db_one($conn, "SELECT * FROM incidents WHERE id = ? AND ambulance_id = ?", [(int) $amb['current_incident_id'], (int) $amb['id']]);
    if (!$inc) fail("No active assignment.", 404);
    return $inc;
}

if ($action === 'accept') {
    expire_stale_assignments($conn);
    $amb = db_one($conn, "SELECT * FROM ambulances WHERE id = ?", [(int) $amb['id']]);
    $inc = pending_incident($conn, $amb);
    $ok = db_exec($conn, "UPDATE incidents SET assignment_status = 'ACCEPTED', updated_at = ? WHERE id = ? AND ambulance_id = ? AND assignment_status = 'PENDING'",
        [now_ts(), (int) $inc['id'], (int) $amb['id']]);
    if ($ok !== 1) fail("This dispatch is no longer available. It may have timed out.", 409);
    add_event($conn, $inc['id'], 'ACCEPTED', 'ambulance', $amb['unit_code'], "{$amb['unit_code']} · {$amb['crew_name']} accepted");
    $amb = db_one($conn, "SELECT * FROM ambulances WHERE id = ?", [(int) $amb['id']]);
    json_out(["status" => "success", "assignment" => current_assignment($conn, $amb)]);
}

if ($action === 'decline') {
    $inc = pending_incident($conn, $amb);
    if (!release_assignment($conn, (int) $inc['id'], (int) $amb['id'], 'DECLINED', 'ambulance', "{$amb['unit_code']} declined")) {
        fail("You've already accepted this case.", 409);
    }
    json_out(["status" => "success"]);
}

if ($action === 'update_status') {
    $in = read_json();
    $newStatus = str_in($in, 'new_status', 20);
    if (!in_array($newStatus, ['EN_ROUTE', 'AT_SCENE', 'PICKED_UP'], true)) {
        fail("Crews can mark en route, at scene or patient picked up. The hospital marks admission.");
    }
    $inc = pending_incident($conn, $amb);
    advance_incident($conn, $inc, $newStatus, 'ambulance', $amb['unit_code']);
    $amb = db_one($conn, "SELECT * FROM ambulances WHERE id = ?", [(int) $amb['id']]);
    json_out(["status" => "updated_success", "assignment" => current_assignment($conn, $amb)]);
}

fail("Unknown action.");
