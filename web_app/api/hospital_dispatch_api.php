<?php
// Hospital command console API. Every call is scoped to the signed-in
// hospital account.
//   GET  ?action=get_incidents     incidents this hospital was alerted to (or claimed), fleet, network
//   POST ?action=claim_incident    { incident_id, ambulance_id }  first hospital to claim wins
//   POST ?action=update_status     { incident_id, new_status }    only the claiming hospital
//   POST ?action=update_capacity   { er_beds_free }
//   POST ?action=simulate_incident demo crash near this hospital
//   POST ?action=reset_demo        clears incidents, returns every ambulance to base
require_once __DIR__ . '/lib/bootstrap.php';

$user = require_role($conn, 'hospital');
$hid = $user['hospital_id'];
$me = db_one($conn, "SELECT * FROM hospitals WHERE id = ?", [$hid]);
if (!$me) fail("Hospital record not found for this account.", 404);

$action = $_GET['action'] ?? 'get_incidents';

if ($action === 'get_incidents') {
    // Open incidents stay visible; closed ones drop off after 12 hours.
    $rows = db_all($conn,
        "SELECT i.*, a.alert_rank, a.distance_km
         FROM incidents i
         LEFT JOIN incident_alerts a ON a.incident_id = i.id AND a.hospital_id = ?
         WHERE (a.hospital_id IS NOT NULL OR i.claimed_by_hospital_id = ?)
           AND (i.status <> 'ADMITTED' OR i.updated_at > ?)
         ORDER BY i.id DESC LIMIT 50",
        [$hid, $hid, date("Y-m-d H:i:s", time() - 12 * 3600)]);

    $incidents = array_map(function ($r) use ($conn) {
        $p = incident_payload($conn, $r);
        $p['my_alert_rank'] = $r['alert_rank'] !== null ? (int) $r['alert_rank'] : null;
        $p['my_distance_km'] = $r['distance_km'] !== null ? (float) $r['distance_km'] : null;
        return $p;
    }, $rows);

    $fleet = array_map(fn($a) => [
        "id" => (int) $a['id'], "unit_code" => $a['unit_code'], "unit_type" => $a['unit_type'],
        "vehicle_number" => $a['vehicle_number'], "crew_name" => $a['crew_name'], "crew_phone" => $a['crew_phone'],
        "has_crew_app" => $a['crew_user_id'] !== null, "status" => $a['status'],
        "latitude" => $a['latitude'] !== null ? (float) $a['latitude'] : null,
        "longitude" => $a['longitude'] !== null ? (float) $a['longitude'] : null,
        "last_seen" => $a['last_seen'], "current_incident_id" => $a['current_incident_id'] !== null ? (int) $a['current_incident_id'] : null,
    ], db_all($conn, "SELECT * FROM ambulances WHERE hospital_id = ? ORDER BY FIELD(status,'available','assigned','offline'), unit_code", [$hid]));

    $network = array_map(fn($h) => [
        "id" => $h['id'], "name" => $h['short_name'], "full_name" => $h['name'], "area" => $h['area'], "city" => $h['city'],
        "latitude" => (float) $h['latitude'], "longitude" => (float) $h['longitude'],
        "er_beds_free" => (int) $h['er_beds_free'], "er_beds_total" => (int) $h['er_beds_total'],
        "ambulances_total" => (int) $h['total'], "ambulances_available" => (int) $h['ready'],
    ], db_all($conn,
        "SELECT h.*, COUNT(a.id) AS total, SUM(a.status = 'available') AS ready
         FROM hospitals h LEFT JOIN ambulances a ON a.hospital_id = h.id
         GROUP BY h.id ORDER BY h.city, h.short_name"));

    json_out([
        "status" => "success",
        "me" => [
            "id" => $me['id'], "name" => $me['short_name'], "full_name" => $me['name'], "area" => $me['area'], "city" => $me['city'],
            "latitude" => (float) $me['latitude'], "longitude" => (float) $me['longitude'],
            "er_beds_free" => (int) $me['er_beds_free'], "er_beds_total" => (int) $me['er_beds_total'],
            "user_name" => $user['name'], "email" => $user['email'],
        ],
        "incidents" => $incidents,
        "fleet" => $fleet,
        "hospitals" => $network,
        "server_time" => now_ts(),
    ]);
}

if ($action === 'claim_incident') {
    $in = read_json();
    $incidentId = (int) ($in['incident_id'] ?? 0);
    $ambulanceId = (int) ($in['ambulance_id'] ?? 0);

    $inc = db_one($conn, "SELECT * FROM incidents WHERE id = ?", [$incidentId]);
    if (!$inc) fail("Incident not found.", 404);
    if (!db_one($conn, "SELECT 1 FROM incident_alerts WHERE incident_id = ? AND hospital_id = ?", [$incidentId, $hid])) {
        fail("Your hospital wasn't among the nearest facilities alerted for this crash.", 403);
    }
    $amb = db_one($conn, "SELECT * FROM ambulances WHERE id = ? AND hospital_id = ?", [$ambulanceId, $hid]);
    if (!$amb) fail("Choose one of your ambulances.", 422);
    if ($amb['status'] !== 'available') fail("{$amb['unit_code']} is not available right now.", 409);

    $fromLat = $amb['latitude'] !== null ? (float) $amb['latitude'] : (float) $me['latitude'];
    $fromLon = $amb['longitude'] !== null ? (float) $amb['longitude'] : (float) $me['longitude'];
    $eta = eta_minutes_for_km(haversine_km($fromLat, $fromLon, (float) $inc['latitude'], (float) $inc['longitude']));
    $now = now_ts();

    // Atomic first-to-claim: only one UPDATE can flip UNCLAIMED -> DISPATCHED.
    $won = db_exec($conn,
        "UPDATE incidents SET status = 'DISPATCHED', claimed_by_hospital_id = ?, ambulance_id = ?, eta_minutes = ?, dispatched_at = ?, updated_at = ?
         WHERE id = ? AND status = 'UNCLAIMED'",
        [$hid, $ambulanceId, $eta, $now, $now, $incidentId]);

    if ($won !== 1) {
        $fresh = db_one($conn, "SELECT h.short_name FROM incidents i LEFT JOIN hospitals h ON h.id = i.claimed_by_hospital_id WHERE i.id = ?", [$incidentId]);
        fail("Already claimed by " . ($fresh['short_name'] ?? 'another hospital') . ". Your team is on standby.", 409, ["code" => "already_claimed"]);
    }

    db_exec($conn, "UPDATE ambulances SET status = 'assigned', current_incident_id = ? WHERE id = ?", [$incidentId, $ambulanceId]);
    add_event($conn, $incidentId, 'DISPATCHED', 'hospital', $hid, "{$amb['unit_code']} ({$amb['unit_type']}) · {$amb['crew_name']} · ETA $eta min");

    $row = db_one($conn, "SELECT * FROM incidents WHERE id = ?", [$incidentId]);
    json_out(["status" => "claimed_success", "message" => "{$amb['unit_code']} dispatched.", "incident" => incident_payload($conn, $row)]);
}

if ($action === 'update_status') {
    $in = read_json();
    $incidentId = (int) ($in['incident_id'] ?? 0);
    $newStatus = str_in($in, 'new_status', 20);
    if (!in_array($newStatus, ['EN_ROUTE', 'AT_SCENE', 'PICKED_UP', 'ADMITTED'], true)) fail("Unknown status.");

    $inc = db_one($conn, "SELECT * FROM incidents WHERE id = ?", [$incidentId]);
    if (!$inc) fail("Incident not found.", 404);
    if ($inc['claimed_by_hospital_id'] !== $hid) fail("Only the responding hospital can update this incident.", 403);

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

if ($action === 'simulate_incident') {
    // A crash 1.5-4 km from this hospital, from one of a few demo riders.
    $riders = [
        ["full_name" => "Aman Verma", "phone" => "917086249545", "blood_group" => "B+", "allergies" => "None", "conditions" => "Asthma",
         "emergency_name" => "Sunita Verma", "emergency_phone" => "917086249545", "emergency_relation" => "Mother", "vehicle_number" => "UP65 DK 7731"],
        ["full_name" => "Priya Singh", "phone" => "917086249545", "blood_group" => "A-", "allergies" => "Sulfa drugs", "conditions" => "None",
         "emergency_name" => "Karan Singh", "emergency_phone" => "917086249545", "emergency_relation" => "Brother", "vehicle_number" => "UP65 BL 1209"],
        ["full_name" => "Rahul Tiwari", "phone" => "917086249545", "blood_group" => "AB+", "allergies" => "None", "conditions" => "Type 1 diabetes",
         "emergency_name" => "Neha Tiwari", "emergency_phone" => "917086249545", "emergency_relation" => "Wife", "vehicle_number" => "UP65 FT 5520"],
    ];
    $places = ["Ring Road, near Shivpur", "Assi Ghat Road", "Durgakund Crossing", "Lanka Chauraha", "Rathyatra Flyover", "Sigra Main Road", "Manduadih Bypass"];

    $angle = mt_rand(0, 359) * M_PI / 180;
    $km = mt_rand(15, 40) / 10;
    $lat = (float) $me['latitude'] + ($km / 111) * cos($angle);
    $lon = (float) $me['longitude'] + ($km / (111 * cos(deg2rad((float) $me['latitude'])))) * sin($angle);
    $tilt = mt_rand(860, 900) / 10;

    $id = create_incident($conn, [
        "profile" => $riders[array_rand($riders)],
        "location_name" => $places[array_rand($places)] . ($me['city'] ? ", {$me['city']}" : ""),
        "latitude" => $lat, "longitude" => $lon,
        "speed_kmh" => mt_rand(380, 720) / 10, "tilt_angle" => $tilt, "roll_angle" => $tilt - 3.1, "pitch_angle" => mt_rand(80, 160) / 10,
        "impact_g" => (mt_rand(35, 52) / 10) . " G (Lateral impact)",
        "is_simulated" => 1,
    ]);
    $row = db_one($conn, "SELECT * FROM incidents WHERE id = ?", [$id]);
    json_out(["status" => "simulated_success", "incident" => incident_payload($conn, $row)]);
}

if ($action === 'reset_demo') {
    $conn->query("DELETE FROM incident_events");
    $conn->query("DELETE FROM incident_alerts");
    $conn->query("DELETE FROM incidents");
    $conn->query("UPDATE ambulances a JOIN hospitals h ON h.id = a.hospital_id
                  SET a.status = IF(a.status = 'offline', 'offline', 'available'), a.current_incident_id = NULL,
                      a.latitude = h.latitude, a.longitude = h.longitude, a.last_seen = NULL");
    json_out(["status" => "reset_success"]);
}

fail("Unknown action.");
