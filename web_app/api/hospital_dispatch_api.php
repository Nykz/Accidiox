<?php
// Hospital command console API. Every call is scoped to the signed-in
// hospital account, and only verified hospitals receive crash alerts.
//   GET  ?action=get_incidents     alerted/claimed incidents + own fleet
//   POST ?action=claim_incident    { incident_id, ambulance_id }  first hospital to claim wins
//   POST ?action=assign_ambulance  { incident_id, ambulance_id }  after a crew declined / didn't respond
//   POST ?action=update_status     { incident_id, new_status }    manual override, claiming hospital only
//   POST ?action=update_capacity   { er_beds_free }
//   POST ?action=approve_crew      { ambulance_id }
//   POST ?action=remove_unit       { ambulance_id }  reject a request or remove a unit
require_once __DIR__ . '/lib/bootstrap.php';

$user = require_role($conn, 'hospital');
$hid = $user['hospital_id'];
$me = db_one($conn, "SELECT * FROM hospitals WHERE id = ?", [$hid]);
if (!$me) fail("Hospital record not found for this account.", 404);
$verified = (int) $me['verified'] === 1;

$action = $_GET['action'] ?? 'get_incidents';
if ($action !== 'get_incidents') require_post();
if ($action !== 'get_incidents' && $action !== 'update_capacity' && !$verified) {
    fail("Your hospital is awaiting verification.", 403);
}

function me_out($me, $user) {
    return [
        "id" => $me['id'], "name" => $me['short_name'], "full_name" => $me['name'], "area" => $me['area'], "city" => $me['city'],
        "latitude" => (float) $me['latitude'], "longitude" => (float) $me['longitude'],
        "er_beds_free" => (int) $me['er_beds_free'], "er_beds_total" => (int) $me['er_beds_total'],
        "verified" => (int) $me['verified'] === 1, "user_name" => $user['name'], "email" => $user['email'],
    ];
}

function my_unit($conn, $hid, $ambulanceId) {
    return db_one($conn, "SELECT * FROM ambulances WHERE id = ? AND hospital_id = ?", [(int) $ambulanceId, $hid]);
}

function claimable_unit($conn, $hid, $ambulanceId) {
    $amb = my_unit($conn, $hid, $ambulanceId);
    if (!$amb || !(int) $amb['approved']) fail("Choose one of your approved ambulances.", 422);
    if ($amb['status'] !== 'available') fail("{$amb['unit_code']} is not available right now.", 409);
    return $amb;
}

function eta_from_unit($amb, $me, $inc) {
    $fromLat = $amb['latitude'] !== null ? (float) $amb['latitude'] : (float) $me['latitude'];
    $fromLon = $amb['longitude'] !== null ? (float) $amb['longitude'] : (float) $me['longitude'];
    return eta_minutes_for_km(haversine_km($fromLat, $fromLon, (float) $inc['latitude'], (float) $inc['longitude']));
}

function assign_unit($conn, $incidentId, $amb, $eta) {
    db_exec($conn, "UPDATE ambulances SET status = 'assigned', current_incident_id = ? WHERE id = ?", [$incidentId, (int) $amb['id']]);
}

if ($action === 'get_incidents') {
    expire_stale_assignments($conn);
    $incidents = [];
    if ($verified) {
        // Open incidents stay visible; closed ones drop off after 12 hours.
        $rows = db_all($conn,
            "SELECT i.*, a.alert_rank, a.distance_km
             FROM incidents i
             LEFT JOIN incident_alerts a ON a.incident_id = i.id AND a.hospital_id = ?
             WHERE (a.hospital_id IS NOT NULL OR i.claimed_by_hospital_id = ?)
               AND (i.status NOT IN ('ADMITTED', 'CANCELLED') OR i.updated_at > ?)
             ORDER BY i.id DESC LIMIT 50",
            [$hid, $hid, ts_ago(12 * 3600)]);
        foreach ($rows as $r) {
            $p = incident_payload($conn, $r);
            $p['my_alert_rank'] = $r['alert_rank'] !== null ? (int) $r['alert_rank'] : null;
            $p['my_distance_km'] = $r['distance_km'] !== null ? (float) $r['distance_km'] : null;
            // Another hospital's responder details are none of our business.
            if ($p['claimed_by_hospital_id'] && $p['claimed_by_hospital_id'] !== $hid) {
                foreach (['driver_name', 'driver_phone', 'ambulance_vehicle', 'ambulance_position'] as $k) $p[$k] = null;
                $p['timeline'] = array_values(array_filter($p['timeline'], fn($e) => in_array($e['status'], ['REPORTED', 'ALERTED', 'DISPATCHED', 'ADMITTED', 'CANCELLED'], true)));
            }
            $incidents[] = $p;
        }
    }

    $fleet = array_map(fn($a) => [
        "id" => (int) $a['id'], "unit_code" => $a['unit_code'], "unit_type" => $a['unit_type'],
        "vehicle_number" => $a['vehicle_number'], "crew_name" => $a['crew_name'], "crew_phone" => $a['crew_phone'],
        "approved" => (int) $a['approved'] === 1, "status" => $a['status'],
        "latitude" => $a['latitude'] !== null ? (float) $a['latitude'] : null,
        "longitude" => $a['longitude'] !== null ? (float) $a['longitude'] : null,
        "last_seen" => $a['last_seen'], "current_incident_id" => $a['current_incident_id'] !== null ? (int) $a['current_incident_id'] : null,
    ], db_all($conn, "SELECT * FROM ambulances WHERE hospital_id = ?
                      ORDER BY approved ASC, FIELD(status,'available','assigned','offline'), unit_code", [$hid]));

    json_out([
        "status" => "success",
        "me" => me_out($me, $user),
        "incidents" => $incidents,
        "fleet" => $fleet,
        "accept_seconds" => ASSIGN_ACCEPT_SECONDS,
        "server_time" => now_ts(),
    ]);
}

if ($action === 'claim_incident') {
    $in = read_json();
    $incidentId = (int) ($in['incident_id'] ?? 0);
    $inc = db_one($conn, "SELECT * FROM incidents WHERE id = ?", [$incidentId]);
    if (!$inc) fail("Incident not found.", 404);
    if ($inc['status'] === 'CANCELLED') fail("The rider cancelled this request. They reported they're safe.", 409, ["code" => "cancelled"]);
    if (!db_one($conn, "SELECT 1 FROM incident_alerts WHERE incident_id = ? AND hospital_id = ?", [$incidentId, $hid])) {
        fail("Your hospital wasn't among the nearest hospitals alerted for this crash.", 403);
    }
    $amb = claimable_unit($conn, $hid, $in['ambulance_id'] ?? 0);
    $eta = eta_from_unit($amb, $me, $inc);
    $now = now_ts();

    // Atomic first-to-claim: only one UPDATE can flip UNCLAIMED -> DISPATCHED.
    $won = db_exec($conn,
        "UPDATE incidents SET status = 'DISPATCHED', claimed_by_hospital_id = ?, ambulance_id = ?, assignment_status = 'PENDING',
                assigned_at = ?, eta_minutes = ?, dispatched_at = ?, updated_at = ?
         WHERE id = ? AND status = 'UNCLAIMED'",
        [$hid, (int) $amb['id'], $now, $eta, $now, $now, $incidentId]);
    if ($won !== 1) {
        fail("Another hospital already accepted this case. Your team is on standby.", 409, ["code" => "already_claimed"]);
    }
    assign_unit($conn, $incidentId, $amb, $eta);
    add_event($conn, $incidentId, 'DISPATCHED', 'hospital', $hid, "{$amb['unit_code']} ({$amb['unit_type']}) · {$amb['crew_name']} · waiting for crew to accept");

    $row = db_one($conn, "SELECT * FROM incidents WHERE id = ?", [$incidentId]);
    json_out(["status" => "claimed_success", "message" => "{$amb['unit_code']} alerted. Waiting for the crew to accept.", "incident" => incident_payload($conn, $row)]);
}

if ($action === 'assign_ambulance') {
    $in = read_json();
    $incidentId = (int) ($in['incident_id'] ?? 0);
    $inc = db_one($conn, "SELECT * FROM incidents WHERE id = ?", [$incidentId]);
    if (!$inc || $inc['claimed_by_hospital_id'] !== $hid) fail("Incident not found.", 404);
    if ($inc['status'] === 'CANCELLED') fail("The rider cancelled this request. They reported they're safe.", 409);
    $amb = claimable_unit($conn, $hid, $in['ambulance_id'] ?? 0);
    $eta = eta_from_unit($amb, $me, $inc);
    $now = now_ts();

    $ok = db_exec($conn,
        "UPDATE incidents SET ambulance_id = ?, assignment_status = 'PENDING', assigned_at = ?, eta_minutes = ?, updated_at = ?
         WHERE id = ? AND claimed_by_hospital_id = ? AND status = 'DISPATCHED' AND ambulance_id IS NULL",
        [(int) $amb['id'], $now, $eta, $now, $incidentId, $hid]);
    if ($ok !== 1) fail("This case already has an ambulance.", 409);
    assign_unit($conn, $incidentId, $amb, $eta);
    add_event($conn, $incidentId, 'REASSIGNED', 'hospital', $hid, "{$amb['unit_code']} · {$amb['crew_name']} · waiting for crew to accept");

    $row = db_one($conn, "SELECT * FROM incidents WHERE id = ?", [$incidentId]);
    json_out(["status" => "assigned_success", "incident" => incident_payload($conn, $row)]);
}

if ($action === 'update_status') {
    $in = read_json();
    $incidentId = (int) ($in['incident_id'] ?? 0);
    $newStatus = str_in($in, 'new_status', 20);
    if (!in_array($newStatus, ['EN_ROUTE', 'AT_SCENE', 'PICKED_UP', 'ADMITTED'], true)) fail("Unknown status.");

    $inc = db_one($conn, "SELECT * FROM incidents WHERE id = ?", [$incidentId]);
    if (!$inc || $inc['claimed_by_hospital_id'] !== $hid) fail("Only the responding hospital can update this incident.", 403);

    advance_incident($conn, $inc, $newStatus, 'hospital', $hid);
    $row = db_one($conn, "SELECT * FROM incidents WHERE id = ?", [$incidentId]);
    json_out(["status" => "updated_success", "incident" => incident_payload($conn, $row)]);
}

if ($action === 'update_capacity') {
    $in = read_json();
    $beds = max(0, min(999, (int) ($in['er_beds_free'] ?? 0)));
    db_exec($conn, "UPDATE hospitals SET er_beds_free = ?, er_beds_total = GREATEST(er_beds_total, ?) WHERE id = ?", [$beds, $beds, $hid]);
    json_out(["status" => "success", "er_beds_free" => $beds]);
}

if ($action === 'approve_crew') {
    $in = read_json();
    $amb = my_unit($conn, $hid, $in['ambulance_id'] ?? 0);
    if (!$amb) fail("Unit not found.", 404);
    db_exec($conn, "UPDATE ambulances SET approved = 1 WHERE id = ?", [(int) $amb['id']]);
    json_out(["status" => "success"]);
}

if ($action === 'remove_unit') {
    $in = read_json();
    $amb = my_unit($conn, $hid, $in['ambulance_id'] ?? 0);
    if (!$amb) fail("Unit not found.", 404);
    if ($amb['current_incident_id']) fail("{$amb['unit_code']} is on a case. Remove it after the patient is admitted.", 409);
    if ($amb['crew_user_id']) {
        db_exec($conn, "DELETE FROM user_sessions WHERE user_id = ?", [(int) $amb['crew_user_id']]);
        db_exec($conn, "DELETE FROM users WHERE id = ? AND role = 'ambulance'", [(int) $amb['crew_user_id']]);
    }
    db_exec($conn, "DELETE FROM ambulances WHERE id = ?", [(int) $amb['id']]);
    json_out(["status" => "success"]);
}

fail("Unknown action.");
