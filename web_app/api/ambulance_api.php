<?php
// Ambulance crew app API. Scoped to the unit linked to the signed-in crew account.
//   GET  ?action=me             unit, hospital, current assignment
//   POST ?action=set_duty       { on_duty: bool }
//   POST ?action=location       { latitude, longitude, speed_kmh }   live GPS, every few seconds
//   POST ?action=update_status  { new_status: EN_ROUTE | AT_SCENE | PICKED_UP }
require_once __DIR__ . '/lib/bootstrap.php';

$user = require_role($conn, 'ambulance');
$amb = db_one($conn, "SELECT * FROM ambulances WHERE crew_user_id = ?", [(int) $user['id']]);
if (!$amb) fail("No ambulance unit is linked to this account.", 404);

$action = $_GET['action'] ?? 'me';

function current_assignment($conn, $amb) {
    if (empty($amb['current_incident_id'])) return null;
    $row = db_one($conn, "SELECT * FROM incidents WHERE id = ?", [(int) $amb['current_incident_id']]);
    return $row ? incident_payload($conn, $row) : null;
}

if ($action === 'me') {
    $hosp = db_one($conn, "SELECT id, name, short_name, area, city, latitude, longitude, phone FROM hospitals WHERE id = ?", [$amb['hospital_id']]);
    $done = db_one($conn, "SELECT COUNT(*) AS n FROM incidents WHERE ambulance_id = ? AND status = 'ADMITTED' AND admitted_at > ?",
        [(int) $amb['id'], date("Y-m-d 00:00:00")]);
    json_out([
        "status" => "success",
        "crew" => ["name" => $user['name'], "phone" => $user['phone'], "email" => $user['email']],
        "unit" => [
            "id" => (int) $amb['id'], "unit_code" => $amb['unit_code'], "unit_type" => $amb['unit_type'],
            "vehicle_number" => $amb['vehicle_number'], "status" => $amb['status'], "last_seen" => $amb['last_seen'],
        ],
        "hospital" => $hosp,
        "assignment" => current_assignment($conn, $amb),
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
    json_out(["status" => "success", "unit_status" => $onDuty ? ($amb['status'] === 'assigned' ? 'assigned' : 'available') : 'offline']);
}

if ($action === 'location') {
    $in = read_json();
    $lat = isset($in['latitude']) ? (float) $in['latitude'] : null;
    $lon = isset($in['longitude']) ? (float) $in['longitude'] : null;
    if ($lat === null || $lon === null || abs($lat) > 90 || abs($lon) > 180) fail("Invalid coordinates.");
    $speed = max(0, (float) ($in['speed_kmh'] ?? 0));
    db_exec($conn, "UPDATE ambulances SET latitude = ?, longitude = ?, speed_kmh = ?, last_seen = ? WHERE id = ?",
        [$lat, $lon, $speed, now_ts(), (int) $amb['id']]);

    // Live ETA: while heading to the scene, re-estimate from where the unit actually is.
    if (!empty($amb['current_incident_id'])) {
        $inc = db_one($conn, "SELECT id, status, latitude, longitude FROM incidents WHERE id = ?", [(int) $amb['current_incident_id']]);
        if ($inc && in_array($inc['status'], ['DISPATCHED', 'EN_ROUTE'], true)) {
            $eta = eta_minutes_for_km(haversine_km($lat, $lon, (float) $inc['latitude'], (float) $inc['longitude']));
            db_exec($conn, "UPDATE incidents SET eta_minutes = ? WHERE id = ?", [$eta, (int) $inc['id']]);
        }
    }
    json_out(["status" => "success"]);
}

if ($action === 'update_status') {
    $in = read_json();
    $newStatus = str_in($in, 'new_status', 20);
    if (!in_array($newStatus, ['EN_ROUTE', 'AT_SCENE', 'PICKED_UP'], true)) {
        fail("Crews can mark en route, at scene or patient picked up. The hospital marks admission.");
    }
    $inc = empty($amb['current_incident_id']) ? null : db_one($conn, "SELECT * FROM incidents WHERE id = ?", [(int) $amb['current_incident_id']]);
    if (!$inc) fail("No active assignment.", 404);
    advance_incident($conn, $inc, $newStatus, 'ambulance', $amb['unit_code']);
    $amb = db_one($conn, "SELECT * FROM ambulances WHERE id = ?", [(int) $amb['id']]);
    json_out(["status" => "updated_success", "assignment" => current_assignment($conn, $amb)]);
}

fail("Unknown action.");
